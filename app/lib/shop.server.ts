import type { SmsSetting } from "@prisma/client";
import db from "../db.server";
import { DEFAULT_TEMPLATES, EVENT_TYPES } from "./constants";
import { decrypt, encrypt } from "./crypto.server";
import { periodNeedsReset } from "./billing.server";
import type { ProviderCredentials } from "./providers.server";
import { providerConnected } from "./providers.server";

export type ShopCredentials = ProviderCredentials;

export function parseCredentials(encrypted: string): ShopCredentials {
  if (!encrypted) return {};
  try {
    return JSON.parse(decrypt(encrypted)) as ShopCredentials;
  } catch {
    return {};
  }
}

export function serializeCredentials(credentials: ShopCredentials): string {
  return encrypt(JSON.stringify(credentials));
}

export function isProviderReady(settings: SmsSetting, credentials = parseCredentials(settings.encryptedCredentials)) {
  return providerConnected(
    settings.provider,
    credentials,
    settings.fromNumber,
    settings.senderId,
  );
}

export async function ensureShopSetup(shop: string, extras?: { storeName?: string; timezone?: string }) {
  const storeName =
    extras?.storeName ||
    shop.replace(".myshopify.com", "").replace(/-/g, " ");

  const existing = await db.smsSetting.findUnique({ where: { shop } });
  let settings: SmsSetting;

  if (!existing) {
    settings = await db.smsSetting.create({
      data: {
        shop,
        storeName,
        timezone: extras?.timezone || "Asia/Kolkata",
      },
    });
  } else {
    const patch: { storeName?: string; timezone?: string; smsUsedThisPeriod?: number; periodStart?: Date } = {};
    if (!existing.storeName && storeName) patch.storeName = storeName;
    if (extras?.timezone && existing.timezone === "Asia/Kolkata") patch.timezone = extras.timezone;
    if (periodNeedsReset(existing.periodStart)) {
      patch.smsUsedThisPeriod = 0;
      patch.periodStart = new Date();
    }
    settings =
      Object.keys(patch).length > 0
        ? await db.smsSetting.update({ where: { shop }, data: patch })
        : existing;
  }

  const templates = await db.smsTemplate.findMany({ where: { shop } });
  const have = new Set(templates.map((item) => item.eventType));
  const missing = EVENT_TYPES.filter((eventType) => !have.has(eventType));
  if (missing.length > 0) {
    await db.smsTemplate.createMany({
      data: missing.map((eventType) => ({
        shop,
        eventType,
        enabled: true,
        body: DEFAULT_TEMPLATES[eventType],
      })),
    });
  }

  return settings;
}

export async function deleteShopData(shop: string) {
  await db.smsLog.deleteMany({ where: { shop } });
  await db.smsTemplate.deleteMany({ where: { shop } });
  await db.smsOptOut.deleteMany({ where: { shop } });
  await db.smsSetting.deleteMany({ where: { shop } });
  await db.session.deleteMany({ where: { shop } });
}

export function inQuietHours(settings: SmsSetting, now = new Date()) {
  if (!settings.quietHoursEnabled) return false;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: settings.timezone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const current = formatter.format(now);
  const start = settings.quietHoursStart || "21:00";
  const end = settings.quietHoursEnd || "08:00";
  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}
