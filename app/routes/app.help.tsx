import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { TEMPLATE_VARS } from "../lib/constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function HelpPage() {
  return (
    <s-page heading="Help">
      <s-section heading="How Archi SMS Order works">
        <s-ordered-list>
          <s-list-item>Connect Twilio, MSG91, or a custom HTTP SMS gateway.</s-list-item>
          <s-list-item>Turn on sending and customize templates.</s-list-item>
          <s-list-item>
            Shopify notifies the app on new orders, COD, shipping, delivery, cancellations, and
            refunds.
          </s-list-item>
          <s-list-item>We render the template, respect quiet hours and opt-outs, then send.</s-list-item>
        </s-ordered-list>
      </s-section>

      <s-section heading="Template variables">
        <s-unordered-list>
          {TEMPLATE_VARS.map((item) => (
            <s-list-item key={item.key}>
              <s-text type="strong">{item.key}</s-text> — {item.label}
            </s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <s-section heading="India / DLT">
        <s-paragraph>
          MSG91 and other Indian providers require a registered DLT sender ID and templates. Use
          the 6-character sender ID in Settings. Keep Shopify templates aligned with your DLT
          approved text where required.
        </s-paragraph>
      </s-section>

      <s-section heading="Privacy">
        <s-paragraph>
          We store shop settings, message templates, phone numbers, and SMS logs so you can audit
          what was sent. Data is deleted when the shop is redacted or the app is uninstalled.
          Customer redaction removes logs and opt-outs for that phone. We do not sell customer
          data. Provider API keys are encrypted at rest.
        </s-paragraph>
      </s-section>

      <s-section heading="Compliance">
        <s-paragraph>
          Transactional order SMS is for customers who already placed an order. Do not use this
          app for marketing blasts. Honor opt-outs from the Logs page. Append STOP language when
          your region requires it.
        </s-paragraph>
      </s-section>

      <s-section heading="Need help?">
        <s-paragraph>
          Open the <s-link href="/app/assistant">AI assistant</s-link> and say what you want
          (“set up MSG91”, “why didn’t order #1001 text”, “send a test”). Or email{" "}
          <s-link href="mailto:hello@solutionsarchilabs.com">hello@solutionsarchilabs.com</s-link>
          .
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
