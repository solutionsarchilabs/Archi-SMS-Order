import db from "../db.server";
import { remainingSms } from "./billing.server";
import type { EventType } from "./constants";
import { normalizePhone } from "./phone.server";
import { sendViaProvider } from "./providers.server";
import { inQuietHours, isProviderReady, parseCredentials } from "./shop.server";
import { renderTemplate, type TemplateVars } from "./templates";

type SendArgs = {
  shop: string;
  eventType: EventType;
  to: string | null;
  vars: TemplateVars;
  orderId?: string | null;
  orderName?: string | null;
  dedupeKey: string;
  force?: boolean;
};

export async function sendShopSms({
  shop,
  eventType,
  to,
  vars,
  orderId,
  orderName,
  dedupeKey,
  force = false,
}: SendArgs) {
  const settings = await db.smsSetting.findUnique({ where: { shop } });
  if (!settings) {
    return { status: "skipped", error: "Shop is not set up" };
  }
  if (!settings.enabled && !force) {
    return { status: "skipped", error: "SMS is disabled" };
  }

  const template = await db.smsTemplate.findUnique({
    where: { shop_eventType: { shop, eventType } },
  });
  if (!template?.enabled && !force) {
    return { status: "skipped", error: "Template is disabled" };
  }

  const phone = normalizePhone(to, settings.countryCode);
  if (!phone) {
    await writeLog({
      shop,
      eventType,
      orderId,
      orderName,
      to: to || "",
      body: "Skipped: no valid phone number",
      status: "skipped",
      error: "no_phone",
      dedupeKey: `${dedupeKey}:nophone`,
    });
    return { status: "skipped", error: "No valid phone number" };
  }

  const optedOut = await db.smsOptOut.findUnique({
    where: { shop_phone: { shop, phone } },
  });
  if (optedOut && !force) {
    return { status: "skipped", error: "Customer opted out" };
  }

  if (remainingSms(settings) <= 0 && !force) {
    await writeLog({
      shop,
      eventType,
      orderId,
      orderName,
      to: phone,
      body: "Skipped: monthly plan limit reached",
      status: "skipped",
      error: "plan_limit",
      dedupeKey: `${dedupeKey}:limit`,
    });
    return { status: "skipped", error: "Monthly SMS limit reached. Upgrade your plan." };
  }

  let body = renderTemplate(template?.body || "", vars);
  if (settings.includeOptOutText && !/stop/i.test(body)) {
    body = `${body} Reply STOP to opt out.`.trim();
  }

  const existing = await db.smsLog.findUnique({
    where: { shop_dedupeKey: { shop, dedupeKey } },
  });
  if (existing && !force) {
    return { status: "duplicate", id: existing.id };
  }

  const sendAt = !force && inQuietHours(settings) ? nextQuietEnd(settings) : new Date();
  const scheduled = sendAt.getTime() > Date.now() + 60_000;

  const log = await db.smsLog.create({
    data: {
      shop,
      eventType,
      orderId: orderId || null,
      orderName: orderName || null,
      to: phone,
      body,
      status: scheduled ? "scheduled" : "queued",
      dedupeKey,
      sendAt,
      provider: settings.provider,
    },
  });

  if (scheduled) {
    return { status: "scheduled", id: log.id, sendAt };
  }

  return deliverLog(log.id);
}

export async function deliverLog(id: string) {
  const log = await db.smsLog.findUnique({ where: { id } });
  if (!log) return { status: "skipped", error: "Log not found" };

  const settings = await db.smsSetting.findUnique({ where: { shop: log.shop } });
  if (!settings) return { status: "skipped", error: "Shop is not set up" };

  const credentials = parseCredentials(settings.encryptedCredentials);
  const result = await sendViaProvider({
    provider: settings.provider,
    toE164: log.to,
    body: log.body,
    fromNumber: settings.fromNumber,
    senderId: settings.senderId,
    credentials,
  });

  const status = result.ok ? (result.simulated ? "simulated" : "sent") : "failed";
  await db.smsLog.update({
    where: { id: log.id },
    data: {
      status,
      provider: settings.provider,
      providerId: result.providerId || null,
      error: result.error || null,
    },
  });

  if (result.ok) {
    await db.smsSetting.update({
      where: { shop: log.shop },
      data: { smsUsedThisPeriod: { increment: 1 } },
    });
  }

  return { status, id: log.id, error: result.error, simulated: result.simulated };
}

export async function flushScheduled(shop?: string) {
  const due = await db.smsLog.findMany({
    where: {
      status: "scheduled",
      sendAt: { lte: new Date() },
      ...(shop ? { shop } : {}),
    },
    take: 25,
  });

  for (const log of due) {
    await deliverLog(log.id);
  }
  return due.length;
}

function nextQuietEnd(settings: { timezone: string; quietHoursEnd: string }) {
  const now = new Date();
  const [hours, minutes] = (settings.quietHoursEnd || "08:00").split(":").map(Number);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = formatter.format(now);
  const local = new Date(`${day}T${String(hours).padStart(2, "0")}:${String(minutes || 0).padStart(2, "0")}:00`);
  if (Number.isNaN(local.getTime()) || local <= now) {
    return new Date(now.getTime() + 8 * 60 * 60 * 1000);
  }
  return local;
}

async function writeLog(data: {
  shop: string;
  eventType: string;
  orderId?: string | null;
  orderName?: string | null;
  to: string;
  body: string;
  status: string;
  error?: string;
  dedupeKey: string;
}) {
  try {
    await db.smsLog.create({
      data: {
        ...data,
        orderId: data.orderId || null,
        orderName: data.orderName || null,
      },
    });
  } catch {
    // Dedupe collisions are expected on webhook retries.
  }
}

export { isProviderReady };
