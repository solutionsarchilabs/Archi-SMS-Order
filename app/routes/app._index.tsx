import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { planLabel, remainingSms } from "../lib/billing.server";
import { EVENT_LABELS, type EventType } from "../lib/constants";
import { isProviderReady, parseCredentials } from "../lib/shop.server";

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
  const shop = session.shop;

  const [settings, logs, sent, failed, skipped, ordersResponse] = await Promise.all([
    db.smsSetting.findUnique({ where: { shop } }),
    db.smsLog.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.smsLog.count({ where: { shop, status: { in: ["sent", "simulated"] } } }),
    db.smsLog.count({ where: { shop, status: "failed" } }),
    db.smsLog.count({ where: { shop, status: "skipped" } }),
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
  const withPhone = orders.filter((order) => order.phone || order.customer?.phone).length;
  const credentials = parseCredentials(settings?.encryptedCredentials || "");
  const providerReady = settings ? isProviderReady(settings, credentials) : false;

  const steps = [
    { id: "provider", label: "Connect Twilio, MSG91, or a custom HTTP gateway", done: providerReady, href: "/app/settings" },
    { id: "enable", label: "Turn on order SMS", done: Boolean(settings?.enabled), href: "/app/settings" },
    { id: "templates", label: "Review confirmation, COD, and shipping templates", done: true, href: "/app/templates" },
    { id: "test", label: "Send a test SMS to your phone", done: Boolean(settings?.testSent), href: "/app/settings" },
  ];

  return {
    enabled: settings?.enabled ?? false,
    providerReady,
    plan: planLabel(settings?.plan || "free"),
    used: settings?.smsUsedThisPeriod ?? 0,
    remaining: settings ? remainingSms(settings) : 50,
    sent,
    failed,
    skipped,
    withPhone,
    orderCount: orders.length,
    steps,
    orders,
    logs,
  };
};

function statusTone(status: string) {
  if (status === "sent" || status === "simulated") return "success";
  if (status === "failed") return "critical";
  if (status === "scheduled" || status === "queued") return "warning";
  return "neutral";
}

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const incomplete = data.steps.filter((step) => !step.done).length;

  return (
    <s-page heading="Archi SMS Order">
      <s-link slot="primary-action" href="/app/settings">
        {data.providerReady ? "Settings" : "Connect provider"}
      </s-link>
      <s-link slot="secondary-actions" href="/app/templates">
        Edit templates
      </s-link>

      {incomplete > 0 ? (
        <s-banner heading="Finish setup to start reducing WISMO tickets" tone="info">
          Stores that text order updates get fewer “where is my order?” chats and recover more COD
          orders. {incomplete} setup {incomplete === 1 ? "step" : "steps"} left.
        </s-banner>
      ) : null}

      {!data.enabled && data.providerReady ? (
        <s-banner heading="SMS is connected but paused" tone="warning">
          Turn on sending in Settings so new orders notify customers automatically.
        </s-banner>
      ) : null}

      {data.remaining <= 5 ? (
        <s-banner heading="You are near this month’s SMS limit" tone="warning">
          {data.used} used on the {data.plan} plan.{" "}
          <s-link href="/app/billing">Upgrade</s-link> to keep shipping and COD updates flowing.
        </s-banner>
      ) : null}

      <s-section heading="This month">
        <s-grid gridTemplateColumns="1fr 1fr 1fr 1fr" gap="base">
          <Metric label="Sent" value={String(data.sent)} />
          <Metric label="Failed" value={String(data.failed)} />
          <Metric label="Skipped" value={String(data.skipped)} />
          <Metric
            label={`${data.plan} remaining`}
            value={String(data.remaining)}
          />
        </s-grid>
        <s-paragraph tone="neutral">
          {data.orderCount > 0
            ? `${data.withPhone} of ${data.orderCount} recent orders have a phone number. Missing numbers are the #1 reason SMS is skipped.`
            : "Place a test order to see phone coverage and live SMS events."}
        </s-paragraph>
      </s-section>

      <s-section heading="Launch checklist">
        <s-stack direction="block" gap="base">
          {data.steps.map((step) => (
            <s-box key={step.id} padding="base" background="subdued" border="base" borderRadius="base">
              <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-badge tone={step.done ? "success" : "warning"}>
                    {step.done ? "Done" : "To do"}
                  </s-badge>
                  <s-text>{step.label}</s-text>
                </s-stack>
                <s-link href={step.href}>{step.done ? "Review" : "Start"}</s-link>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Why merchants keep this app">
        <s-unordered-list>
          <s-list-item>
            Instant order and COD confirmation — customers trust the purchase and pick up the phone
            when the courier calls.
          </s-list-item>
          <s-list-item>
            Shipping, out-for-delivery, and delivered texts cut WISMO tickets without extra staff.
          </s-list-item>
          <s-list-item>
            You bring Twilio, MSG91, or any HTTP gateway. Archi automates Shopify events, templates,
            logs, and plan limits.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section heading="Recent orders">
        {data.orders.length === 0 ? (
          <s-paragraph>No recent orders yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Order</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Phone</s-table-header>
              <s-table-header>Payment</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.orders.map((order) => (
                <s-table-row key={order.id}>
                  <s-table-cell>{order.name}</s-table-cell>
                  <s-table-cell>{order.customer?.displayName || "Guest"}</s-table-cell>
                  <s-table-cell>{order.phone || order.customer?.phone || "Missing"}</s-table-cell>
                  <s-table-cell>{order.displayFinancialStatus || "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Latest SMS">
        {data.logs.length === 0 ? (
          <s-paragraph>
            No messages yet. Finish setup, then create an order — or send a test from Settings.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Event</s-table-header>
              <s-table-header>To</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Message</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.logs.map((log) => (
                <s-table-row key={log.id}>
                  <s-table-cell>
                    {EVENT_LABELS[log.eventType as EventType] || log.eventType}
                  </s-table-cell>
                  <s-table-cell>{log.to || "—"}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={statusTone(log.status)}>{log.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{log.body}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <s-box padding="base" background="subdued" border="base" borderRadius="base">
      <s-stack direction="block" gap="small">
        <s-text type="strong">{value}</s-text>
        <s-paragraph tone="neutral">{label}</s-paragraph>
      </s-stack>
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
