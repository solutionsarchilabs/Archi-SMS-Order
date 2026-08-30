import db from "../db.server";
import { planLabel, remainingSms } from "./billing.server";
import { EVENT_TYPES } from "./constants";
import { isProviderReady, parseCredentials } from "./shop.server";

export type HealthCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export async function runHealthCheck(shop: string) {
  const settings = await db.smsSetting.findUnique({ where: { shop } });
  const credentials = parseCredentials(settings?.encryptedCredentials || "");
  const providerReady = settings ? isProviderReady(settings, credentials) : false;
  const templates = await db.smsTemplate.findMany({ where: { shop } });
  const logs = await db.smsLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const failed = await db.smsLog.count({ where: { shop, status: "failed" } });
  const sent = await db.smsLog.count({
    where: { shop, status: { in: ["sent", "simulated"] } },
  });

  const checks: HealthCheck[] = [
    {
      id: "shop",
      label: "Shop is set up",
      ok: Boolean(settings),
      detail: settings ? `${settings.storeName || shop}` : "Open the app once to create shop settings.",
    },
    {
      id: "provider",
      label: "SMS provider connected",
      ok: providerReady,
      detail: providerReady
        ? `${settings?.provider} is ready`
        : "Connect Twilio, MSG91, or HTTP in Settings or ask the AI assistant.",
    },
    {
      id: "enabled",
      label: "Order SMS is turned on",
      ok: Boolean(settings?.enabled),
      detail: settings?.enabled
        ? "New orders will trigger SMS"
        : "Turn sending on in Settings, or tell the assistant “enable SMS”.",
    },
    {
      id: "templates",
      label: "Message templates ready",
      ok: templates.length >= EVENT_TYPES.length,
      detail: `${templates.filter((item) => item.enabled).length} of ${EVENT_TYPES.length} events enabled`,
    },
    {
      id: "quota",
      label: "Plan has remaining SMS",
      ok: settings ? remainingSms(settings) > 0 : false,
      detail: settings
        ? `${remainingSms(settings)} left on ${planLabel(settings.plan)} this period`
        : "No plan loaded yet",
    },
    {
      id: "test",
      label: "Test SMS sent",
      ok: Boolean(settings?.testSent),
      detail: settings?.testSent
        ? "A test message was logged"
        : "Send a test from Test, Settings, or the assistant.",
    },
  ];

  const ready = checks.filter((item) => ["shop", "provider", "enabled", "templates"].includes(item.id)).every((item) => item.ok);

  return {
    ready,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY),
    provider: settings?.provider || "twilio",
    enabled: Boolean(settings?.enabled),
    providerReady,
    plan: settings ? planLabel(settings.plan) : "Free",
    remaining: settings ? remainingSms(settings) : 0,
    sent,
    failed,
    lastLogs: logs.map((log) => ({
      id: log.id,
      eventType: log.eventType,
      status: log.status,
      to: log.to,
      error: log.error,
      createdAt: log.createdAt.toISOString(),
      body: log.body,
    })),
    checks,
  };
}
