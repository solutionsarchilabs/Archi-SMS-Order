import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import {
  EVENT_HELP,
  EVENT_LABELS,
  EVENT_TYPES,
  TEMPLATE_VARS,
  type EventType,
} from "../lib/constants";
import { SAMPLE_VARS, renderTemplate } from "../lib/templates";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const templates = await db.smsTemplate.findMany({
    where: { shop: session.shop },
  });
  const byType = Object.fromEntries(templates.map((item) => [item.eventType, item]));
  return {
    templates: EVENT_TYPES.map((eventType) => ({
      eventType,
      enabled: byType[eventType]?.enabled ?? true,
      body: byType[eventType]?.body ?? "",
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  await Promise.all(
    EVENT_TYPES.map((eventType) =>
      db.smsTemplate.upsert({
        where: { shop_eventType: { shop: session.shop, eventType } },
        create: {
          shop: session.shop,
          eventType,
          enabled: formData.get(`enabled_${eventType}`) === "on",
          body: String(formData.get(`body_${eventType}`) || "").trim(),
        },
        update: {
          enabled: formData.get(`enabled_${eventType}`) === "on",
          body: String(formData.get(`body_${eventType}`) || "").trim(),
        },
      }),
    ),
  );

  return { ok: true };
};

export default function TemplatesPage() {
  const { templates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const [bodies, setBodies] = useState<Record<string, string>>(
    Object.fromEntries(templates.map((item) => [item.eventType, item.body])),
  );
  const [previewType, setPreviewType] = useState<EventType>("order_confirmed");

  useEffect(() => {
    if (actionData?.ok) shopify.toast.show("Templates saved");
  }, [actionData, shopify]);

  const preview = renderTemplate(bodies[previewType] || "", SAMPLE_VARS);

  return (
    <s-page heading="Templates">
      <s-section heading="What customers receive">
        <s-paragraph>
          Keep messages under 160 characters when you can — one SMS is cheaper and gets read. COD
          confirmation is separate so prepaid buyers are not asked to keep cash ready.
        </s-paragraph>
        <s-stack direction="inline" gap="small">
          {TEMPLATE_VARS.map((item) => (
            <s-badge key={item.key}>{item.key}</s-badge>
          ))}
        </s-stack>
      </s-section>

      <Form id="templates-form" method="post">
        <s-stack direction="block" gap="base">
          {templates.map((item) => (
            <s-section key={item.eventType} heading={EVENT_LABELS[item.eventType]}>
              <s-paragraph tone="neutral">{EVENT_HELP[item.eventType]}</s-paragraph>
              <s-checkbox
                name={`enabled_${item.eventType}`}
                label={`Send “${EVENT_LABELS[item.eventType]}” SMS`}
                checked={item.enabled || undefined}
              />
              <s-text-area
                name={`body_${item.eventType}`}
                label="Message"
                rows={3}
                value={bodies[item.eventType]}
                onInput={(event: { currentTarget: { value: string } }) => {
                  setBodies((current) => ({ ...current, [item.eventType]: event.currentTarget.value }));
                }}
              />
              <s-paragraph tone="neutral">
                {(bodies[item.eventType] || "").length} characters
                {(bodies[item.eventType] || "").length > 160 ? " · may cost more than 1 SMS" : " · 1 SMS"}
              </s-paragraph>
            </s-section>
          ))}
            <s-button
              type="submit"
              variant="primary"
              {...(navigation.state === "submitting" ? { loading: true } : {})}
            >
              Save templates
            </s-button>
        </s-stack>
      </Form>

      <s-section slot="aside" heading="Preview">
        <s-select
          label="Event"
          name="preview"
          value={previewType}
          onChange={(event: { currentTarget: { value: string } }) => {
            setPreviewType(event.currentTarget.value as EventType);
          }}
        >
          {EVENT_TYPES.map((eventType) => (
            <s-option key={eventType} value={eventType}>
              {EVENT_LABELS[eventType]}
            </s-option>
          ))}
        </s-select>
        <s-box padding="base" background="subdued" border="base" borderRadius="base">
          <s-paragraph>{preview}</s-paragraph>
        </s-box>
        <s-paragraph tone="neutral">{preview.length} characters with sample data.</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
