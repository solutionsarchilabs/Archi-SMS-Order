import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await db.smsLog.deleteMany({ where: { shop } });
  await db.smsSetting.deleteMany({ where: { shop } });

  return new Response();
};
