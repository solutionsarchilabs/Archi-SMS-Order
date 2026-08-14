import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import type { EventType } from "./constants";
import {
  isCodOrder,
  orderGid,
  orderId,
  orderPhone,
  shipmentEvent,
  varsFromOrder,
  type FulfillmentLike,
  type OrderLike,
  type RefundLike,
} from "./order.server";
import { ensureShopSetup } from "./shop.server";
import { sendShopSms } from "./sms.server";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export async function handleSmsWebhook(
  { request }: ActionFunctionArgs,
  expectedTopic?: string,
) {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (expectedTopic && topic.toLowerCase() !== expectedTopic.toLowerCase()) {
    return new Response();
  }

  const settings = await ensureShopSetup(shop);
  const shopName = settings.storeName || shop.replace(".myshopify.com", "");
  const graphql = admin as AdminGraphql | undefined;

  switch (topic) {
    case "ORDERS_CREATE":
    case "orders/create":
      await onOrderCreate(shop, payload as OrderLike, shopName, graphql, settings);
      break;
    case "ORDERS_CANCELLED":
    case "orders/cancelled":
      await onSimpleOrder(shop, payload as OrderLike, shopName, "order_cancelled");
      break;
    case "ORDERS_FULFILLED":
    case "orders/fulfilled":
      await onSimpleOrder(shop, payload as OrderLike, shopName, "order_shipped", {
        extraDedupe: "fulfilled",
      });
      break;
    case "REFUNDS_CREATE":
    case "refunds/create":
      await onRefund(shop, payload as RefundLike, shopName, graphql);
      break;
    case "FULFILLMENTS_CREATE":
    case "fulfillments/create":
      await onFulfillment(shop, payload as FulfillmentLike, shopName, "order_shipped", graphql);
      break;
    case "FULFILLMENTS_UPDATE":
    case "fulfillments/update": {
      const fulfillment = payload as FulfillmentLike;
      const event = shipmentEvent(fulfillment.shipment_status);
      if (event) await onFulfillment(shop, fulfillment, shopName, event, graphql);
      break;
    }
    default:
      break;
  }

  return new Response();
}

async function onOrderCreate(
  shop: string,
  order: OrderLike,
  shopName: string,
  admin?: AdminGraphql,
  settings?: { addOrderNote: boolean },
) {
  const eventType: EventType = isCodOrder(order) ? "order_cod" : "order_confirmed";
  const id = orderId(order);
  const result = await sendShopSms({
    shop,
    eventType,
    to: orderPhone(order),
    vars: varsFromOrder(order, shopName),
    orderId: id,
    orderName: order.name,
    dedupeKey: `${eventType}:${id}`,
  });

  if (
    settings?.addOrderNote &&
    (result.status === "sent" || result.status === "simulated" || result.status === "scheduled")
  ) {
    await maybeTagOrder(admin, order, eventType);
  }
}

async function onSimpleOrder(
  shop: string,
  order: OrderLike,
  shopName: string,
  eventType: EventType,
  options?: { extraDedupe?: string },
) {
  const id = orderId(order);
  await sendShopSms({
    shop,
    eventType,
    to: orderPhone(order),
    vars: varsFromOrder(order, shopName),
    orderId: id,
    orderName: order.name,
    dedupeKey: `${eventType}:${id}:${options?.extraDedupe || "v1"}`,
  });
}

async function onRefund(shop: string, refund: RefundLike, shopName: string, admin?: AdminGraphql) {
  const orderIdValue = refund.order_id != null ? String(refund.order_id) : null;
  const order = orderIdValue ? await fetchOrder(admin, orderIdValue) : null;
  await sendShopSms({
    shop,
    eventType: "order_refunded",
    to: order ? orderPhone(order) : null,
    vars: order
      ? varsFromOrder(order, shopName)
      : { shop_name: shopName, order_name: orderIdValue ? `#${orderIdValue}` : "your order" },
    orderId: orderIdValue,
    orderName: order?.name || (orderIdValue ? `#${orderIdValue}` : null),
    dedupeKey: `order_refunded:${refund.id ?? orderIdValue}`,
  });
}

async function onFulfillment(
  shop: string,
  fulfillment: FulfillmentLike,
  shopName: string,
  eventType: EventType,
  admin?: AdminGraphql,
) {
  const orderIdValue = fulfillment.order_id != null ? String(fulfillment.order_id) : null;
  const order = orderIdValue ? await fetchOrder(admin, orderIdValue) : null;
  const trackingNumber = fulfillment.tracking_number || fulfillment.tracking_numbers?.[0] || "";
  const trackingUrl = fulfillment.tracking_url || fulfillment.tracking_urls?.[0] || trackingNumber;

  await sendShopSms({
    shop,
    eventType,
    to: order ? orderPhone(order) : null,
    vars: {
      ...(order ? varsFromOrder(order, shopName) : { shop_name: shopName }),
      order_name: order?.name || fulfillment.name || (orderIdValue ? `#${orderIdValue}` : "your order"),
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
    },
    orderId: orderIdValue,
    orderName: order?.name || fulfillment.name || null,
    dedupeKey: `${eventType}:${fulfillment.id ?? orderIdValue}`,
  });
}

async function fetchOrder(admin: AdminGraphql | undefined, id: string): Promise<OrderLike | null> {
  if (!admin) return null;
  try {
    const response = await admin.graphql(
      `#graphql
        query SmsOrder($id: ID!) {
          order(id: $id) {
            id
            name
            phone
            displayFinancialStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { firstName lastName phone }
            shippingAddress { phone city firstName }
          }
        }`,
      { variables: { id: `gid://shopify/Order/${id}` } },
    );
    const json = await response.json();
    const node = json.data?.order;
    if (!node) return null;
    return {
      id,
      admin_graphql_api_id: node.id,
      name: node.name,
      phone: node.phone,
      financial_status: node.displayFinancialStatus,
      total_price: node.totalPriceSet?.shopMoney?.amount,
      currency: node.totalPriceSet?.shopMoney?.currencyCode,
      customer: {
        first_name: node.customer?.firstName,
        last_name: node.customer?.lastName,
        phone: node.customer?.phone,
      },
      shipping_address: {
        phone: node.shippingAddress?.phone,
        city: node.shippingAddress?.city,
        first_name: node.shippingAddress?.firstName,
      },
    };
  } catch (error) {
    console.warn("Could not load order for SMS webhook", error);
    return null;
  }
}

async function maybeTagOrder(admin: AdminGraphql | undefined, order: OrderLike, eventType: string) {
  const gid = orderGid(order);
  if (!admin || !gid) return;
  try {
    await admin.graphql(
      `#graphql
        mutation TagSmsOrder($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            userErrors { message }
          }
        }`,
      { variables: { id: gid, tags: [`sms:${eventType}`] } },
    );
  } catch (error) {
    console.warn("Could not tag order after SMS", error);
  }
}
