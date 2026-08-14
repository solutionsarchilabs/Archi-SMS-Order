import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { planIdFromName } from "../lib/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const subscription = payload as {
    app_subscription?: { name?: string; status?: string };
    name?: string;
    status?: string;
  };
  const name = subscription.app_subscription?.name || subscription.name || "free";
  const status = (subscription.app_subscription?.status || subscription.status || "").toUpperCase();
  const plan = status === "ACTIVE" ? planIdFromName(name) : "free";

  await db.smsSetting.updateMany({
    where: { shop },
    data: { plan },
  });

  return new Response();
};
