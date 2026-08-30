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

export type SettingsPatch = {
  enabled?: boolean;
  storeName?: string;
  provider?: string;
  fromNumber?: string;
  senderId?: string;
  countryCode?: string;
  timezone?: string;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  addOrderNote?: boolean;
  includeOptOutText?: boolean;
  accountSid?: string;
  authToken?: string;
  httpUrl?: string;
  httpAuthHeader?: string;
};

export async function saveShopSettings(shop: string, patch: SettingsPatch) {
  await ensureShopSetup(shop);
  const existing = await db.smsSetting.findUnique({ where: { shop } });
  const current = parseCredentials(existing?.encryptedCredentials || "");
  const credentials = {
    accountSid: patch.accountSid?.trim() || current.accountSid || "",
    authToken: patch.authToken?.trim() || current.authToken || "",
    httpUrl: patch.httpUrl?.trim() || current.httpUrl || "",
    httpAuthHeader: patch.httpAuthHeader?.trim() || current.httpAuthHeader || "",
  };

  return db.smsSetting.upsert({
    where: { shop },
    create: {
      shop,
      enabled: patch.enabled ?? false,
      storeName: patch.storeName?.trim() || existing?.storeName || "",
      provider: patch.provider || existing?.provider || "twilio",
      encryptedCredentials: serializeCredentials(credentials),
      fromNumber: patch.fromNumber?.trim() || "",
      senderId: patch.senderId?.trim() || "",
      countryCode: patch.countryCode?.trim() || "IN",
      timezone: patch.timezone?.trim() || existing?.timezone || "Asia/Kolkata",
      quietHoursEnabled: patch.quietHoursEnabled ?? false,
      quietHoursStart: patch.quietHoursStart || "21:00",
      quietHoursEnd: patch.quietHoursEnd || "08:00",
      addOrderNote: patch.addOrderNote ?? true,
      includeOptOutText: patch.includeOptOutText ?? true,
    },
    update: {
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.storeName !== undefined ? { storeName: patch.storeName.trim() } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      encryptedCredentials: serializeCredentials(credentials),
      ...(patch.fromNumber !== undefined ? { fromNumber: patch.fromNumber.trim() } : {}),
      ...(patch.senderId !== undefined ? { senderId: patch.senderId.trim() } : {}),
      ...(patch.countryCode !== undefined ? { countryCode: patch.countryCode.trim() || "IN" } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone.trim() } : {}),
      ...(patch.quietHoursEnabled !== undefined ? { quietHoursEnabled: patch.quietHoursEnabled } : {}),
      ...(patch.quietHoursStart !== undefined ? { quietHoursStart: patch.quietHoursStart } : {}),
      ...(patch.quietHoursEnd !== undefined ? { quietHoursEnd: patch.quietHoursEnd } : {}),
      ...(patch.addOrderNote !== undefined ? { addOrderNote: patch.addOrderNote } : {}),
      ...(patch.includeOptOutText !== undefined ? { includeOptOutText: patch.includeOptOutText } : {}),
    },
  });
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
