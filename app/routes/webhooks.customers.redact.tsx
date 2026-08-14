import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { normalizePhone } from "../lib/phone.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customer = (payload as { customer?: { phone?: string } }).customer;
  const phone = normalizePhone(customer?.phone);
  if (phone) {
    await db.smsLog.deleteMany({ where: { shop, to: phone } });
    await db.smsOptOut.deleteMany({ where: { shop, phone } });
  }

  return new Response();
};
