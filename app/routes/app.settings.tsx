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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await db.smsSetting.findUnique({
    where: { shop: session.shop },
  });

  return {
    enabled: settings?.enabled ?? false,
    senderId: settings?.senderId ?? "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const enabled = formData.get("enabled") === "on";
  const senderId = String(formData.get("senderId") || "").trim();

  await db.smsSetting.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, enabled, senderId },
    update: { enabled, senderId },
  });

  return { ok: true };
};

export default function SettingsPage() {
  const { enabled, senderId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show("SMS settings saved");
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="SMS settings">
      <s-section heading="Notifications">
        <s-paragraph>
          Turn on SMS for new orders. Provider credentials (Twilio, MSG91, or
          similar) will be added as environment variables — do not commit
          secrets to git.
        </s-paragraph>
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-checkbox
              name="enabled"
              label="Send SMS when an order is created"
              defaultChecked={enabled}
            />
            <s-text-field
              name="senderId"
              label="Sender ID / from name"
              value={senderId}
              details="Shown as the SMS sender where the provider supports it."
            />
            <s-button type="submit" variant="primary" {...(isSaving ? { loading: true } : {})}>
              Save settings
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
