import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

type RecentOrder = {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string | null;
  phone: string | null;
  customer: { displayName: string | null; phone: string | null } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const [settings, recentLogs, ordersResponse] = await Promise.all([
    db.smsSetting.findUnique({ where: { shop: session.shop } }),
    db.smsLog.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    admin.graphql(
      `#graphql
        query RecentOrders {
          orders(first: 8, sortKey: CREATED_AT, reverse: true) {
            nodes {
              id
              name
              createdAt
              displayFinancialStatus
              phone
              customer {
                displayName
                phone
              }
            }
          }
        }`,
    ),
  ]);

  const ordersJson = await ordersResponse.json();
  const orders: RecentOrder[] = ordersJson.data?.orders?.nodes ?? [];

  return {
    shop: session.shop,
    smsEnabled: settings?.enabled ?? false,
    senderId: settings?.senderId ?? "",
    orders,
    logs: recentLogs,
  };
};

export default function Index() {
  const { smsEnabled, senderId, orders, logs } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Archi SMS Order">
      <s-link slot="primary-action" href="/app/settings" variant="primary">
        SMS settings
      </s-link>

      <s-section heading="Order SMS notifications">
        <s-paragraph>
          Send SMS messages when customers place orders. Connect a provider in
          settings, then new orders are queued from the{" "}
          <s-text type="strong">orders/create</s-text> webhook.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-badge tone={smsEnabled ? "success" : "warning"}>
            {smsEnabled ? "SMS enabled" : "SMS disabled"}
          </s-badge>
          {senderId ? <s-badge>Sender: {senderId}</s-badge> : null}
        </s-stack>
      </s-section>

      <s-section heading="Recent orders">
        {orders.length === 0 ? (
          <s-paragraph>
            No recent orders yet. Place a test order on the store to see it
            here.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {orders.map((order) => {
              const phone = order.phone || order.customer?.phone || "No phone";
              return (
                <s-box
                  key={order.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <s-stack direction="block" gap="small">
                    <s-heading>{order.name}</s-heading>
                    <s-paragraph>
                      {order.customer?.displayName || "Guest"} · {phone} ·{" "}
                      {order.displayFinancialStatus || "UNKNOWN"}
                    </s-paragraph>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>

      <s-section heading="SMS log">
        {logs.length === 0 ? (
          <s-paragraph>
            No SMS events yet. Enable SMS in settings and create an order to
            queue a notification.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {logs.map((log) => (
              <s-box
                key={log.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-paragraph>
                  {log.status} · {log.to} · {log.body}
                </s-paragraph>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="App stack">
        <s-paragraph>
          <s-text>Framework: </s-text>
          <s-link href="https://reactrouter.com/" target="_blank">
            React Router
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Database: </s-text>
          <s-link href="https://www.prisma.io/" target="_blank">
            Prisma
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>API: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            Admin GraphQL
          </s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
