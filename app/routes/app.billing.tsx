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
import { planIdFromName, remainingSms } from "../lib/billing.server";
import { PAID_PLANS, PLAN_DETAILS, type PlanId } from "../lib/constants";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const settings = await db.smsSetting.findUnique({ where: { shop: session.shop } });

  let activePlan: string = settings?.plan || "free";
  try {
    const check = await billing.check({
      plans: [...PAID_PLANS],
      isTest: process.env.NODE_ENV !== "production",
    });
    if (check.hasActivePayment && check.appSubscriptions?.[0]?.name) {
      activePlan = planIdFromName(check.appSubscriptions[0].name);
      if (settings && settings.plan !== activePlan) {
        await db.smsSetting.update({
          where: { shop: session.shop },
          data: { plan: activePlan },
        });
      }
    }
  } catch {
    // Billing APIs are unavailable until the app is linked to a Partner app.
  }

  return {
    plan: activePlan,
    used: settings?.smsUsedThisPeriod ?? 0,
    remaining: settings ? remainingSms({ ...settings, plan: activePlan }) : 50,
    periodStart: settings?.periodStart?.toISOString() ?? new Date().toISOString(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan") || "");
  const shopifyPlan = PAID_PLANS.find((item) => item === plan);
  if (!shopifyPlan) return { ok: false, error: "Choose a paid plan" };

  await billing.request({
    plan: shopifyPlan,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
  });

  return { ok: true };
};

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const choosing = navigation.state === "submitting";

  useEffect(() => {
    if (actionData && "error" in actionData && actionData.error) {
      shopify.toast.show(actionData.error);
    }
  }, [actionData, shopify]);

  const current = data.plan as PlanId;

  return (
    <s-page heading="Billing">
      <s-banner heading={`${PLAN_DETAILS.find((item) => item.id === current)?.name || "Free"} plan`} tone="info">
        {data.used} SMS used this period · {data.remaining} remaining. Limits reset about every 30
        days. SMS credits are billed by Twilio or MSG91 — this plan is for the Archi automation
        app.
      </s-banner>

      <s-section heading="Plans that grow with order volume">
        <s-paragraph>
          Free is enough to prove the app on real orders. Upgrade when confirmation, COD, and
          shipping texts become part of how you run the store.
        </s-paragraph>
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {PLAN_DETAILS.map((plan) => (
            <s-box key={plan.id} padding="base" background="subdued" border="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-heading>
                  {plan.name} · {plan.price}/mo
                </s-heading>
                <s-paragraph>{plan.sms.toLocaleString()} SMS events / month</s-paragraph>
                <s-paragraph>{plan.blurb}</s-paragraph>
                {plan.id === current ? (
                  <s-badge tone="success">Current plan</s-badge>
                ) : plan.shopifyPlan ? (
                  <Form method="post">
                    <input type="hidden" name="plan" value={plan.shopifyPlan} />
                    <s-button
                      type="submit"
                      variant={plan.id === "growth" ? "primary" : "secondary"}
                      {...(choosing ? { loading: true } : {})}
                    >
                      Choose {plan.name}
                    </s-button>
                  </Form>
                ) : (
                  <s-badge>Included</s-badge>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-grid>
      </s-section>

      <s-section heading="How this makes money for the merchant">
        <s-unordered-list>
          <s-list-item>
            One recovered COD order often pays for months of the Starter plan.
          </s-list-item>
          <s-list-item>
            Fewer WISMO chats mean support can focus on refunds and upsells, not tracking links.
          </s-list-item>
          <s-list-item>
            You keep your own SMS rates. Archi does not markup per-message cost.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
