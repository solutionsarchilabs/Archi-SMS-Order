import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { EVENT_LABELS, type EventType } from "../lib/constants";
import { normalizePhone } from "../lib/phone.server";
import { deliverLog } from "../lib/sms.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const q = url.searchParams.get("q")?.trim() || "";

  const where = {
    shop: session.shop,
    ...(status !== "all" ? { status } : {}),
    ...(q ? { to: { contains: q } } : {}),
  };

  const [logs, optOuts] = await Promise.all([
    db.smsLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.smsOptOut.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return { logs, optOuts, status, q };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const shop = session.shop;

  if (intent === "block") {
    const phone = normalizePhone(String(formData.get("phone") || ""));
    if (!phone) return { ok: false, error: "Enter a valid phone number" };
    await db.smsOptOut.upsert({
      where: { shop_phone: { shop, phone } },
      create: { shop, phone },
      update: {},
    });
    return { ok: true, message: "Number blocked" };
  }

  if (intent === "unblock") {
    const phone = String(formData.get("phone") || "");
    await db.smsOptOut.deleteMany({ where: { shop, phone } });
    return { ok: true, message: "Number unblocked" };
  }

  if (intent === "retry") {
    const id = String(formData.get("id") || "");
    const result = await deliverLog(id);
    return {
      ok: result.status === "sent" || result.status === "simulated",
      message: result.status === "failed" ? result.error : `Retry ${result.status}`,
    };
  }

  return { ok: false };
};

function statusTone(status: string) {
  if (status === "sent" || status === "simulated") return "success";
  if (status === "failed") return "critical";
  if (status === "scheduled" || status === "queued") return "warning";
  return "neutral";
}

export default function LogsPage() {
  const { logs, optOuts, status, q } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const [params] = useSearchParams();

  useEffect(() => {
    if (actionData?.message) shopify.toast.show(actionData.message);
  }, [actionData, shopify]);

  return (
    <s-page heading="SMS logs">
      <s-section heading="Find a message">
        <Form method="get">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-search-field name="q" label="Phone" value={q} placeholder="Search phone" />
            <s-select name="status" label="Status" value={status}>
              <s-option value="all">All</s-option>
              <s-option value="sent">Sent</s-option>
              <s-option value="simulated">Simulated</s-option>
              <s-option value="failed">Failed</s-option>
              <s-option value="skipped">Skipped</s-option>
              <s-option value="scheduled">Scheduled</s-option>
            </s-select>
            <s-button type="submit">Filter</s-button>
          </s-stack>
        </Form>
        {params.toString() ? (
          <s-paragraph>
            <s-link href="/app/logs">Clear filters</s-link>
          </s-paragraph>
        ) : null}
      </s-section>

      <s-section heading="History">
        {logs.length === 0 ? (
          <s-paragraph>No SMS events match this filter.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">When</s-table-header>
              <s-table-header>Event</s-table-header>
              <s-table-header>Order</s-table-header>
              <s-table-header>To</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Message</s-table-header>
              <s-table-header>Retry</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {logs.map((log) => (
                <s-table-row key={log.id}>
                  <s-table-cell>{new Date(log.createdAt).toLocaleString()}</s-table-cell>
                  <s-table-cell>
                    {EVENT_LABELS[log.eventType as EventType] || log.eventType}
                  </s-table-cell>
                  <s-table-cell>{log.orderName || "—"}</s-table-cell>
                  <s-table-cell>{log.to || "—"}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={statusTone(log.status)}>{log.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{log.error ? `${log.body} (${log.error})` : log.body}</s-table-cell>
                  <s-table-cell>
                    {log.status === "failed" ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="retry" />
                        <input type="hidden" name="id" value={log.id} />
                        <s-button
                          type="submit"
                          variant="tertiary"
                          {...(navigation.state === "submitting" ? { loading: true } : {})}
                        >
                          Retry
                        </s-button>
                      </Form>
                    ) : (
                      "—"
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Opt-outs">
        <s-paragraph>
          Block a number to stop all future SMS. Customers who reply STOP should be added here.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="block" />
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-text-field name="phone" label="Phone to block" placeholder="+91XXXXXXXXXX" />
            <s-button type="submit">Block number</s-button>
          </s-stack>
        </Form>
        {optOuts.length === 0 ? (
          <s-paragraph tone="neutral">No blocked numbers.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {optOuts.map((item) => (
              <s-box key={item.phone} padding="base" background="subdued" border="base" borderRadius="base">
                <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                  <s-text>{item.phone}</s-text>
                  <Form method="post">
                    <input type="hidden" name="intent" value="unblock" />
                    <input type="hidden" name="phone" value={item.phone} />
                    <s-button type="submit" variant="tertiary">
                      Unblock
                    </s-button>
                  </Form>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
