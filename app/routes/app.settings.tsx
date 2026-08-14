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
import db from "../db.server";
import { PROVIDERS, type ProviderId } from "../lib/constants";
import { maskSecret } from "../lib/crypto.server";
import {
  isProviderReady,
  parseCredentials,
  serializeCredentials,
} from "../lib/shop.server";
import { sendShopSms } from "../lib/sms.server";
import { SAMPLE_VARS } from "../lib/templates.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await db.smsSetting.findUnique({ where: { shop: session.shop } });
  const credentials = parseCredentials(settings?.encryptedCredentials || "");

  return {
    enabled: settings?.enabled ?? false,
    storeName: settings?.storeName ?? "",
    provider: (settings?.provider || "twilio") as ProviderId,
    fromNumber: settings?.fromNumber ?? "",
    senderId: settings?.senderId ?? "",
    countryCode: settings?.countryCode ?? "IN",
    timezone: settings?.timezone ?? "Asia/Kolkata",
    quietHoursEnabled: settings?.quietHoursEnabled ?? false,
    quietHoursStart: settings?.quietHoursStart ?? "21:00",
    quietHoursEnd: settings?.quietHoursEnd ?? "08:00",
    addOrderNote: settings?.addOrderNote ?? true,
    includeOptOutText: settings?.includeOptOutText ?? true,
    accountSid: maskSecret(credentials.accountSid || ""),
    authToken: maskSecret(credentials.authToken || ""),
    httpUrl: credentials.httpUrl || "",
    httpAuthHeader: maskSecret(credentials.httpAuthHeader || ""),
    providerReady: settings ? isProviderReady(settings, credentials) : false,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save");

  if (intent === "test") {
    const to = String(formData.get("testPhone") || "");
    const result = await sendShopSms({
      shop,
      eventType: "order_confirmed",
      to,
      vars: { ...SAMPLE_VARS },
      orderName: "TEST",
      dedupeKey: `test:${Date.now()}`,
      force: true,
    });
    if (result.status === "sent" || result.status === "simulated") {
      await db.smsSetting.update({
        where: { shop },
        data: { testSent: true },
      });
    }
    return {
      ok: result.status === "sent" || result.status === "simulated" || result.status === "scheduled",
      test: true,
      status: result.status,
      error: "error" in result ? result.error : undefined,
    };
  }

  const existing = await db.smsSetting.findUnique({ where: { shop } });
  const current = parseCredentials(existing?.encryptedCredentials || "");
  const accountSid = String(formData.get("accountSid") || "").trim();
  const authToken = String(formData.get("authToken") || "").trim();
  const httpUrl = String(formData.get("httpUrl") || "").trim();
  const httpAuthHeader = String(formData.get("httpAuthHeader") || "").trim();

  const credentials = {
    accountSid: accountSid || current.accountSid || "",
    authToken: authToken || current.authToken || "",
    httpUrl: httpUrl || current.httpUrl || "",
    httpAuthHeader: httpAuthHeader || current.httpAuthHeader || "",
  };

  await db.smsSetting.upsert({
    where: { shop },
    create: {
      shop,
      enabled: formData.get("enabled") === "on",
      storeName: String(formData.get("storeName") || "").trim(),
      provider: String(formData.get("provider") || "twilio"),
      encryptedCredentials: serializeCredentials(credentials),
      fromNumber: String(formData.get("fromNumber") || "").trim(),
      senderId: String(formData.get("senderId") || "").trim(),
      countryCode: String(formData.get("countryCode") || "IN").trim() || "IN",
      timezone: String(formData.get("timezone") || "Asia/Kolkata").trim(),
      quietHoursEnabled: formData.get("quietHoursEnabled") === "on",
      quietHoursStart: String(formData.get("quietHoursStart") || "21:00"),
      quietHoursEnd: String(formData.get("quietHoursEnd") || "08:00"),
      addOrderNote: formData.get("addOrderNote") === "on",
      includeOptOutText: formData.get("includeOptOutText") === "on",
    },
    update: {
      enabled: formData.get("enabled") === "on",
      storeName: String(formData.get("storeName") || "").trim(),
      provider: String(formData.get("provider") || "twilio"),
      encryptedCredentials: serializeCredentials(credentials),
      fromNumber: String(formData.get("fromNumber") || "").trim(),
      senderId: String(formData.get("senderId") || "").trim(),
      countryCode: String(formData.get("countryCode") || "IN").trim() || "IN",
      timezone: String(formData.get("timezone") || "Asia/Kolkata").trim(),
      quietHoursEnabled: formData.get("quietHoursEnabled") === "on",
      quietHoursStart: String(formData.get("quietHoursStart") || "21:00"),
      quietHoursEnd: String(formData.get("quietHoursEnd") || "08:00"),
      addOrderNote: formData.get("addOrderNote") === "on",
      includeOptOutText: formData.get("includeOptOutText") === "on",
    },
  });

  return { ok: true, test: false };
};

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    if (!actionData?.ok) {
      if (actionData && "error" in actionData && actionData.error) {
        shopify.toast.show(String(actionData.error));
      }
      return;
    }
    if (actionData.test) {
      shopify.toast.show(
        actionData.status === "simulated"
          ? "Test logged (connect a provider to send for real)"
          : "Test SMS sent",
      );
    } else {
      shopify.toast.show("Settings saved");
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="Settings">
      <s-section heading="Sending">
        <s-paragraph>
          {data.providerReady
            ? "Provider connected. Messages send through your own SMS account — Archi never resells credits."
            : "Connect a provider to send live SMS. Until then, events are logged as simulated so you can still trial the flow."}
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="save" />
          <s-stack direction="block" gap="base">
            <s-checkbox name="enabled" label="Send SMS for order events" checked={data.enabled || undefined} />
            <s-text-field
              name="storeName"
              label="Store name in messages"
              value={data.storeName}
              details="Used as {{shop_name}} in templates."
            />
            <s-select name="provider" label="SMS provider" value={data.provider}>
              {PROVIDERS.map((item) => (
                <s-option key={item.id} value={item.id}>
                  {item.label}
                </s-option>
              ))}
            </s-select>
            <s-paragraph tone="neutral">
              Save after changing provider. Fill the matching credentials below.
            </s-paragraph>

            <s-heading>Twilio</s-heading>
            <s-text-field name="accountSid" label="Twilio Account SID" placeholder={data.accountSid || "ACxxxxxxxx"} />
            <s-password-field name="authToken" label="Twilio Auth Token / MSG91 auth key" placeholder={data.authToken || "Secret"} />
            <s-text-field
              name="fromNumber"
              label="Twilio from number"
              value={data.fromNumber}
              details="E.164 number from your Twilio console, e.g. +14155552671."
            />

            <s-heading>MSG91</s-heading>
            <s-text-field
              name="senderId"
              label="Sender ID"
              value={data.senderId}
              details="6-character DLT sender ID for India, or alphanumeric sender where supported."
            />

            <s-heading>Custom HTTP</s-heading>
            <s-url-field name="httpUrl" label="Webhook URL" value={data.httpUrl} />
            <s-password-field
              name="httpAuthHeader"
              label="Authorization header (optional)"
              placeholder={data.httpAuthHeader || "Bearer …"}
            />
            <s-paragraph tone="neutral">
              Archi POSTs JSON: {"{ to, body, from, senderId }"}.
            </s-paragraph>

            <s-text-field
              name="countryCode"
              label="Default country"
              value={data.countryCode}
              details="Used to turn 10-digit numbers into E.164. Use IN for India."
            />
            <s-text-field name="timezone" label="Timezone" value={data.timezone} />
            <s-checkbox
              name="quietHoursEnabled"
              label="Pause sending during quiet hours"
              checked={data.quietHoursEnabled || undefined}
            />
            <s-stack direction="inline" gap="base">
              <s-text-field name="quietHoursStart" label="Quiet hours start" value={data.quietHoursStart} />
              <s-text-field name="quietHoursEnd" label="Quiet hours end" value={data.quietHoursEnd} />
            </s-stack>
            <s-checkbox
              name="addOrderNote"
              label="Tag orders after a confirmation SMS is sent"
              checked={data.addOrderNote || undefined}
            />
            <s-checkbox
              name="includeOptOutText"
              label="Append “Reply STOP to opt out”"
              checked={data.includeOptOutText || undefined}
            />
            <s-button type="submit" variant="primary" {...(isSaving ? { loading: true } : {})}>
              Save settings
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Send a test">
        <s-paragraph>
          Uses the Order confirmed template. A successful test marks setup complete.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="test" />
          <s-stack direction="block" gap="base">
            <s-text-field name="testPhone" label="Your phone number" placeholder="+91XXXXXXXXXX" />
            <s-button type="submit" variant="secondary">
              Send test SMS
            </s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
