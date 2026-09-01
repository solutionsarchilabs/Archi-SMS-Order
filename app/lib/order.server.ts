import type { EventType } from "./constants";
import type { TemplateVars } from "./templates";

export type OrderLike = {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  order_number?: number;
  phone?: string | null;
  total_price?: string;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  gateway?: string | null;
  payment_gateway_names?: string[];
  tags?: string;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    default_address?: { phone?: string | null; city?: string | null };
  } | null;
  shipping_address?: { phone?: string | null; city?: string | null; first_name?: string | null } | null;
  billing_address?: { phone?: string | null; city?: string | null } | null;
};

export type FulfillmentLike = {
  id?: number | string;
  order_id?: number | string;
  name?: string;
  tracking_number?: string | null;
  tracking_url?: string | null;
  tracking_numbers?: string[];
  tracking_urls?: string[];
  shipment_status?: string | null;
  status?: string | null;
};

export type RefundLike = {
  id?: number | string;
  order_id?: number | string;
};

export function isCodOrder(order: OrderLike): boolean {
  const gateways = [
    order.gateway,
    ...(order.payment_gateway_names || []),
    order.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    gateways.includes("cash_on_delivery") ||
    gateways.includes("cash on delivery") ||
    /\bcod\b/.test(gateways)
  );
}

export function orderPhone(order: OrderLike): string | null {
  return (
    order.phone ||
    order.shipping_address?.phone ||
    order.customer?.phone ||
    order.customer?.default_address?.phone ||
    order.billing_address?.phone ||
    null
  );
}

export function orderId(order: OrderLike): string | null {
  if (order.id == null) return null;
  return String(order.id);
}

export function orderGid(order: OrderLike): string | null {
  if (order.admin_graphql_api_id) return order.admin_graphql_api_id;
  const id = orderId(order);
  return id ? `gid://shopify/Order/${id}` : null;
}

export function formatMoney(amount?: string, currency?: string) {
  if (!amount) return "";
  if (!currency) return amount;
  if (currency === "INR") return `₹${amount}`;
  return `${currency} ${amount}`;
}

export function varsFromOrder(
  order: OrderLike,
  shopName: string,
  extra?: Partial<TemplateVars>,
): TemplateVars {
  const first = order.customer?.first_name || order.shipping_address?.first_name || "";
  const last = order.customer?.last_name || "";
  return {
    shop_name: shopName,
    customer_first_name: first,
    customer_name: [first, last].filter(Boolean).join(" "),
    order_name: order.name || (order.order_number ? `#${order.order_number}` : ""),
    order_total: formatMoney(order.total_price, order.currency),
    order_status: order.financial_status || order.fulfillment_status || "",
    shipping_city: order.shipping_address?.city || order.customer?.default_address?.city || "",
    ...extra,
  };
}

export function shipmentEvent(status: string | null | undefined): EventType | null {
  const value = (status || "").toLowerCase();
  if (value === "delivered") return "order_delivered";
  if (value === "out_for_delivery" || value === "in_transit") return "out_for_delivery";
  return null;
}
