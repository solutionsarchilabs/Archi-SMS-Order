import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { normalizePhone } from "../lib/phone.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const customer = (payload as { customer?: { phone?: string; email?: string; id?: number } })
    .customer;
  const phone = normalizePhone(customer?.phone);
  const logs = phone
    ? await db.smsLog.findMany({
        where: { shop, to: phone },
        select: { createdAt: true, eventType: true, to: true, body: true, status: true },
      })
    : [];

  console.log(
    JSON.stringify({
      type: "customers/data_request",
      shop,
      customerId: customer?.id,
      email: customer?.email,
      smsRecords: logs.length,
    }),
  );

  return new Response(JSON.stringify({ sms_logs: logs }), {
    headers: { "Content-Type": "application/json" },
  });
};
