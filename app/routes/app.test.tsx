import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { runHealthCheck } from "../lib/health.server";
import { sendShopSms } from "../lib/sms.server";
import { SAMPLE_VARS } from "../lib/templates";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return runHealthCheck(session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const phone = String(formData.get("phone") || "");
  const result = await sendShopSms({
    shop: session.shop,
    eventType: "order_confirmed",
    to: phone,
    vars: { ...SAMPLE_VARS },
    orderName: "TEST",
    dedupeKey: `test:${Date.now()}`,
    force: true,
  });
  if (result.status === "sent" || result.status === "simulated") {
    await db.smsSetting.updateMany({
      where: { shop: session.shop },
      data: { testSent: true },
    });
  }
  return {
    ok: result.status === "sent" || result.status === "simulated" || result.status === "scheduled",
    status: result.status,
    error: "error" in result ? result.error : undefined,
  };
};

function toneFor(ok: boolean) {
  return ok ? "success" : "warning";
}

export default function TestPage() {
  const health = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  useEffect(() => {
    if (!actionData) return;
    if (actionData.ok) {
      shopify.toast.show(
        actionData.status === "simulated" ? "Test logged (simulated)" : `Test ${actionData.status}`,
      );
    } else {
      shopify.toast.show(actionData.error || "Test failed");
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="Test the app">
      <s-link slot="primary-action" href="/app/assistant">
        Ask AI to test
      </s-link>

      {health.ready ? (
        <s-banner heading="Core setup looks good" tone="success">
          Provider is connected and SMS is on. Send a test below, then place a real order with a
          phone number and confirm a new row in Logs.
        </s-banner>
      ) : (
        <s-banner heading="Not ready for live orders yet" tone="warning">
          Fix the failed checks, or open the AI assistant and say “set up the app for me”.
        </s-banner>
      )}

      <s-section heading="Health checks">
        <s-stack direction="block" gap="base">
          {health.checks.map((item) => (
            <s-box key={item.id} padding="base" background="subdued" border="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-badge tone={toneFor(item.ok)}>{item.ok ? "Pass" : "Needs work"}</s-badge>
                  <s-text type="strong">{item.label}</s-text>
                </s-stack>
                <s-paragraph>{item.detail}</s-paragraph>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
        <s-paragraph tone="neutral">
          Plan: {health.plan} · {health.remaining} SMS left · {health.sent} sent/simulated ·{" "}
          {health.failed} failed
          {health.aiConfigured ? " · AI key present" : " · AI key not set (guided assistant still works)"}
        </s-paragraph>
      </s-section>

      <s-section heading="1. Send a test SMS to yourself">
        <s-paragraph>
          This uses the Order confirmed template. Status <s-text type="strong">sent</s-text> means
          your provider accepted it. <s-text type="strong">simulated</s-text> means the app logic
          worked but no live gateway is connected.
        </s-paragraph>
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-text-field name="phone" label="Your phone number" placeholder="+91XXXXXXXXXX" />
            <s-button
              type="submit"
              variant="primary"
              {...(navigation.state === "submitting" ? { loading: true } : {})}
            >
              Send test SMS
            </s-button>
          </s-stack>
        </Form>
        {actionData ? (
          <s-box padding="base" background="subdued" border="base" borderRadius="base">
            <s-paragraph>
              Result: {actionData.status}
              {actionData.error ? ` — ${actionData.error}` : ""}
            </s-paragraph>
          </s-box>
        ) : null}
      </s-section>

      <s-section heading="2. Place a real test order">
        <s-ordered-list>
          <s-list-item>In the Shopify admin, create an order (or check out on the storefront) with a phone number.</s-list-item>
          <s-list-item>Wait a few seconds, then open Logs. You should see order_confirmed or order_cod.</s-list-item>
          <s-list-item>Fulfill the order with tracking to test shipped / out for delivery / delivered.</s-list-item>
          <s-list-item>Cancel or refund to test those templates.</s-list-item>
        </s-ordered-list>
      </s-section>

      <s-section heading="Latest events">
        {health.lastLogs.length === 0 ? (
          <s-paragraph>No SMS logs yet. Send a test or place an order.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">When</s-table-header>
              <s-table-header>Event</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>To</s-table-header>
              <s-table-header>Detail</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {health.lastLogs.map((log) => (
                <s-table-row key={log.id}>
                  <s-table-cell>{new Date(log.createdAt).toLocaleString()}</s-table-cell>
                  <s-table-cell>{log.eventType}</s-table-cell>
                  <s-table-cell>{log.status}</s-table-cell>
                  <s-table-cell>{log.to || "—"}</s-table-cell>
                  <s-table-cell>{log.error || log.body}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
