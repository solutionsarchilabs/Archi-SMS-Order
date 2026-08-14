import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type OrderWebhookPayload = {
  id?: number | string;
  name?: string;
  phone?: string | null;
  customer?: { phone?: string | null } | null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const order = payload as OrderWebhookPayload;

  console.log(`Received ${topic} webhook for ${shop} order ${order?.name ?? order?.id}`);

  const settings = await db.smsSetting.findUnique({ where: { shop } });
  const to = order?.phone || order?.customer?.phone;

  if (!settings?.enabled) {
    return new Response();
  }

  if (!to) {
    await db.smsLog.create({
      data: {
        shop,
        orderId: order?.id != null ? String(order.id) : null,
        to: "",
        body: `Skipped ${order?.name ?? "order"}: no phone number`,
        status: "skipped",
      },
    });
    return new Response();
  }

  const sender = settings.senderId ? ` from ${settings.senderId}` : "";
  await db.smsLog.create({
    data: {
      shop,
      orderId: order?.id != null ? String(order.id) : null,
      to,
      body: `Thanks for your order ${order?.name ?? ""}${sender}.`.trim(),
      status: "queued",
    },
  });

  return new Response();
};
