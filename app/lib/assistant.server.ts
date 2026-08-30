import db from "../db.server";
import { EVENT_LABELS, EVENT_TYPES, type EventType } from "./constants";
import { maskSecret } from "./crypto.server";
import { runHealthCheck } from "./health.server";
import { parseCredentials, saveShopSettings, type SettingsPatch } from "./shop.server";
import { sendShopSms } from "./sms.server";
import { isEventType, SAMPLE_VARS } from "./templates.server";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ToolResult = Record<string, unknown>;

const SYSTEM_PROMPT = `You are Archi, the in-app assistant for Archi SMS Order, a Shopify app that sends transactional SMS for orders (confirmation, COD, shipped, out for delivery, delivered, cancelled, refunded).

Your job:
- Ask what the merchant wants to do if they are vague.
- Set up the app for them using tools (provider, enable sending, templates, test SMS).
- Answer questions about how it works, why a message failed, billing, India DLT, quiet hours, and opt-outs.
- Never invent credentials. If a secret is missing, ask for it.
- Never send marketing blasts. This app is only for people who already placed an order.
- Do not reveal full API keys; they are stored encrypted.
- Prefer short, practical steps. After a tool runs, explain what changed and what to do next.
- If SMS is simulated, explain that a live provider is not connected yet — the flow still logged.

When they want setup, gather: provider (twilio | msg91 | http), credentials, then enable SMS, then offer a test SMS.`;

const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_status",
      description: "Read current shop SMS setup, health, and last logs. Call this first when helping.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_settings",
      description: "Save SMS settings or provider credentials. Only send fields the merchant provided.",
      parameters: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          storeName: { type: "string" },
          provider: { type: "string", enum: ["twilio", "msg91", "http"] },
          fromNumber: { type: "string" },
          senderId: { type: "string" },
          countryCode: { type: "string" },
          timezone: { type: "string" },
          quietHoursEnabled: { type: "boolean" },
          quietHoursStart: { type: "string" },
          quietHoursEnd: { type: "string" },
          addOrderNote: { type: "boolean" },
          includeOptOutText: { type: "boolean" },
          accountSid: { type: "string", description: "Twilio Account SID" },
          authToken: { type: "string", description: "Twilio auth token or MSG91 auth key" },
          httpUrl: { type: "string" },
          httpAuthHeader: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_template",
      description: "Enable/disable or rewrite an SMS template for an order event.",
      parameters: {
        type: "object",
        properties: {
          eventType: {
            type: "string",
            enum: [...EVENT_TYPES],
          },
          enabled: { type: "boolean" },
          body: { type: "string" },
        },
        required: ["eventType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_test_sms",
      description: "Send a test order-confirmed SMS to a phone number the merchant provides.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string" },
        },
        required: ["phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_logs",
      description: "Fetch recent SMS logs, optionally filtered by status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
        },
      },
    },
  },
];

export async function runAssistant(shop: string, messages: ChatMessage[]) {
  const trimmed = messages.slice(-20).filter((item) => item.content.trim());
  if (trimmed.length === 0) {
    return {
      reply: welcomeMessage(),
      usedAi: false,
    };
  }

  const hasLlm = Boolean(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
  if (hasLlm) {
    try {
      return await runLlmAssistant(shop, trimmed);
    } catch (error) {
      console.warn("AI provider failed, using guided assistant", error);
    }
  }

  return {
    reply: await runGuidedAssistant(shop, trimmed),
    usedAi: false,
  };
}

export function welcomeMessage() {
  return [
    "Hi, I’m Archi — I can set up this app with you.",
    "",
    "What do you want to do?",
    "• Set up SMS (Twilio, MSG91, or your own gateway)",
    "• Turn sending on or off",
    "• Change a template",
    "• Send a test text to your phone",
    "• Check why an order didn’t SMS",
    "• Explain billing or COD messages",
  ].join("\n");
}

export function isAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY);
}

async function executeTool(shop: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case "get_status":
      return getStatusSnapshot(shop);
    case "update_settings":
      return updateSettingsTool(shop, args as SettingsPatch);
    case "update_template":
      return updateTemplateTool(shop, args);
    case "send_test_sms":
      return sendTestTool(shop, String(args.phone || ""));
    case "get_logs":
      return getLogsTool(shop, args.status ? String(args.status) : undefined);
    default:
      return { error: `Unknown tool ${name}` };
  }
}

async function getStatusSnapshot(shop: string) {
  const health = await runHealthCheck(shop);
  const settings = await db.smsSetting.findUnique({ where: { shop } });
  const credentials = parseCredentials(settings?.encryptedCredentials || "");
  return {
    ...health,
    storeName: settings?.storeName || "",
    countryCode: settings?.countryCode || "IN",
    timezone: settings?.timezone || "",
    quietHoursEnabled: Boolean(settings?.quietHoursEnabled),
    quietHoursStart: settings?.quietHoursStart,
    quietHoursEnd: settings?.quietHoursEnd,
    senderId: settings?.senderId || "",
    fromNumber: settings?.fromNumber || "",
    accountSid: maskSecret(credentials.accountSid || ""),
    hasAuthToken: Boolean(credentials.authToken),
    httpUrl: credentials.httpUrl || "",
    nextStep: nextSetupStep(health.checks),
  };
}

function nextSetupStep(checks: { id: string; ok: boolean }[]) {
  const order = ["provider", "enabled", "test"];
  const missing = order.find((id) => checks.find((item) => item.id === id && !item.ok));
  if (missing === "provider") return "Connect Twilio, MSG91, or HTTP credentials.";
  if (missing === "enabled") return "Turn on order SMS.";
  if (missing === "test") return "Send a test SMS to the merchant’s phone.";
  return "Setup looks complete. Place a real order with a phone number to confirm live sending.";
}

async function updateSettingsTool(shop: string, patch: SettingsPatch) {
  const settings = await saveShopSettings(shop, patch);
  const health = await runHealthCheck(shop);
  return {
    ok: true,
    enabled: settings.enabled,
    provider: settings.provider,
    providerReady: health.providerReady,
    nextStep: nextSetupStep(health.checks),
  };
}

async function updateTemplateTool(shop: string, args: Record<string, unknown>) {
  const eventType = String(args.eventType || "");
  if (!isEventType(eventType)) {
    return { ok: false, error: `Unknown event. Use one of: ${EVENT_TYPES.join(", ")}` };
  }
  await db.smsTemplate.upsert({
    where: { shop_eventType: { shop, eventType } },
    create: {
      shop,
      eventType,
      enabled: args.enabled === undefined ? true : Boolean(args.enabled),
      body: String(args.body || ""),
    },
    update: {
      ...(args.enabled !== undefined ? { enabled: Boolean(args.enabled) } : {}),
      ...(args.body !== undefined ? { body: String(args.body) } : {}),
    },
  });
  const template = await db.smsTemplate.findUnique({
    where: { shop_eventType: { shop, eventType } },
  });
  return {
    ok: true,
    eventType,
    label: EVENT_LABELS[eventType as EventType],
    enabled: template?.enabled,
    body: template?.body,
  };
}

async function sendTestTool(shop: string, phone: string) {
  const result = await sendShopSms({
    shop,
    eventType: "order_confirmed",
    to: phone,
    vars: { ...SAMPLE_VARS },
    orderName: "TEST",
    dedupeKey: `test:${Date.now()}`,
    force: true,
  });
  if (result.status === "sent" || result.status === "simulated") {
    await db.smsSetting.updateMany({
      where: { shop },
      data: { testSent: true },
    });
  }
  return {
    ok: result.status === "sent" || result.status === "simulated" || result.status === "scheduled",
    status: result.status,
    error: "error" in result ? result.error : undefined,
    hint:
      result.status === "simulated"
        ? "Logged only. Connect a provider to send a real SMS."
        : result.status === "sent"
          ? "Check the phone. If it arrived, the app is working."
          : undefined,
  };
}

async function getLogsTool(shop: string, status?: string) {
  const logs = await db.smsLog.findMany({
    where: { shop, ...(status && status !== "all" ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return {
    logs: logs.map((log) => ({
      eventType: log.eventType,
      status: log.status,
      to: log.to,
      orderName: log.orderName,
      error: log.error,
      createdAt: log.createdAt.toISOString(),
      body: log.body,
    })),
  };
}

async function runLlmAssistant(shop: string, messages: ChatMessage[]) {
  const url = `${(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;
  const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || "";
  const model =
    process.env.OPENAI_MODEL ||
    (process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY
      ? "llama-3.3-70b-versatile"
      : "gpt-4o-mini");

  type LlmMessage =
    | { role: "system" | "user" | "assistant"; content: string }
    | {
        role: "assistant";
        content: string | null;
        tool_calls: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      }
    | { role: "tool"; tool_call_id: string; content: string };

  const llmMessages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((item) => ({ role: item.role, content: item.content })),
  ];

  for (let i = 0; i < 6; i += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: llmMessages,
        tools: OPENAI_TOOLS,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text.slice(0, 400) || `LLM ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };
    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("Empty AI response");

    if (message.tool_calls?.length) {
      llmMessages.push({
        role: "assistant",
        content: message.content || null,
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = await executeTool(shop, call.function.name, args);
        llmMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    return {
      reply: (message.content || "").trim() || "Done. Ask me anything else about Archi SMS Order.",
      usedAi: true,
    };
  }

  return {
    reply: "I hit a loop while setting that up. Try again, or open Settings to finish manually.",
    usedAi: true,
  };
}

async function runGuidedAssistant(shop: string, messages: ChatMessage[]) {
  const last = messages[messages.length - 1]?.content || "";
  const text = last.toLowerCase();
  const status = await getStatusSnapshot(shop);
  const phone = extractPhone(last);

  if (looksLike(text, ["enable", "turn on", "start sending"])) {
    await executeTool(shop, "update_settings", { enabled: true });
    return "Order SMS is now on. New orders with a phone number will notify the customer. Want me to send a test to your phone?";
  }
  if (looksLike(text, ["disable", "turn off", "pause", "stop sending"])) {
    await executeTool(shop, "update_settings", { enabled: false });
    return "Sending is paused. Existing logs stay. Say “enable SMS” when you want it live again.";
  }

  if (looksLike(text, ["test", "send me", "try sms", "try a message"]) || (phone && looksLike(text, ["send", "text", "sms"]))) {
    if (!phone) {
      return "I’ll send a test. What’s your phone number? Example: +919876543210";
    }
    const result = (await executeTool(shop, "send_test_sms", { phone })) as {
      status?: string;
      error?: string;
      hint?: string;
    };
    return [
      `Test result: ${result.status}.`,
      result.hint,
      result.error,
      "If the phone got it, live orders will work the same way (when SMS is enabled).",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (looksLike(text, ["twilio", "msg91", "http", "gateway", "auth token", "account sid", "sender"])) {
    return await applyCredentialMessage(shop, last, text);
  }

  if (looksLike(text, ["template", "message text", "wording"])) {
    return [
      "Templates live under Templates in the nav. Events:",
      EVENT_TYPES.map((event) => `• ${event} — ${EVENT_LABELS[event]}`).join("\n"),
      "Tell me the event and the new text, e.g. “change order_confirmed to Hi {{customer_first_name}}, we got {{order_name}}.”",
    ].join("\n");
  }

  const templateMatch = last.match(/\b(order_confirmed|order_cod|order_shipped|out_for_delivery|order_delivered|order_cancelled|order_refunded)\b/i);
  if (templateMatch && looksLike(text, ["change", "set", "update", "use"])) {
    const eventType = templateMatch[1].toLowerCase();
    const body = last.replace(/^[\s\S]*?(?:to|:)\s*/i, "").trim();
    if (body.length > 10 && isEventType(eventType)) {
      await executeTool(shop, "update_template", { eventType, body });
      return `Updated the ${EVENT_LABELS[eventType]} template. Review it on the Templates page if you want.`;
    }
  }

  if (looksLike(text, ["log", "failed", "didn't send", "did not send", "why", "skipped", "not working"])) {
    const logs = (await executeTool(shop, "get_logs", {})) as { logs: Array<{ status: string; error?: string | null; orderName?: string | null }> };
    if (!logs.logs?.length) {
      return "No SMS events yet. Enable SMS, then place a test order with a phone number — or send a test from here.";
    }
    const latest = logs.logs[0];
    return [
      `Latest: ${latest.status} for ${latest.orderName || "a message"}${latest.error ? ` (${latest.error})` : ""}.`,
      "Common causes: no phone on the order, SMS still off, provider not connected (simulated), plan limit, or the number is blocked in Logs.",
      `Setup next step: ${status.nextStep}`,
    ].join("\n");
  }

  if (looksLike(text, ["cod", "cash on delivery"])) {
    return "If Shopify marks the order as Cash on Delivery (gateway/tags contain COD), we send the COD template instead of the prepaid confirmation, so the customer knows to keep cash ready.";
  }

  if (looksLike(text, ["bill", "plan", "price", "upgrade", "free"])) {
    return "The app plan (Free 50 / Starter $9 / Growth $29 / Pro $79) is for Archi’s automation. SMS credits are billed by Twilio or MSG91. Open Billing in the nav to upgrade.";
  }

  if (looksLike(text, ["setup", "set up", "onboard", "configure", "start", "help me"])) {
    return [
      `Here’s where you are: ${status.nextStep}`,
      "",
      "To connect a provider, send something like:",
      "• “Use Twilio, SID ACxxxx, token xxxx, from +14155552671, then enable SMS”",
      "• “Use MSG91, auth key xxxx, sender ARCHIS, enable SMS”",
      "",
      "Then give me your phone number and I’ll send a test.",
    ].join("\n");
  }

  if (looksLike(text, ["how", "what is", "explain", "variable", "dlt", "quiet"])) {
    return [
      "Archi watches Shopify orders and texts the customer. You bring Twilio, MSG91, or HTTP.",
      "Variables: {{shop_name}}, {{customer_first_name}}, {{order_name}}, {{order_total}}, {{tracking_url}}.",
      "India: MSG91 needs a DLT sender ID. Quiet hours delay sends until morning.",
      `Right now: ${status.nextStep}`,
    ].join("\n");
  }

  return [
    welcomeMessage(),
    "",
    `Current next step: ${status.nextStep}`,
    status.aiConfigured
      ? ""
      : "(Add OPENAI_API_KEY or GROQ_API_KEY on the server for fuller AI chat. I can still set the app up from these commands.)",
  ]
    .filter(Boolean)
    .join("\n");
}

async function applyCredentialMessage(shop: string, original: string, text: string) {
  const patch: SettingsPatch = {};
  if (text.includes("msg91")) patch.provider = "msg91";
  else if (text.includes("http") || text.includes("webhook")) patch.provider = "http";
  else if (text.includes("twilio")) patch.provider = "twilio";

  const sid = original.match(/AC[a-zA-Z0-9]{8,}/);
  if (sid) patch.accountSid = sid[0];

  const from = original.match(/\+\d{10,15}/);
  if (from && (text.includes("from") || text.includes("twilio"))) patch.fromNumber = from[0];

  const sender = original.match(/\bsender(?:\s*id)?\s*[:\-is]*\s*([A-Za-z0-9]{3,8})\b/i);
  if (sender) patch.senderId = sender[1];

  const url = original.match(/https?:\/\/\S+/);
  if (url) patch.httpUrl = url[0];

  const token =
    original.match(/\b(?:token|auth(?:\s*key)?|key)\s*[:\-is]*\s*([A-Za-z0-9_\-]{8,})\b/i) ||
    original.match(/\b([a-f0-9]{32,})\b/i);
  if (token) patch.authToken = token[1];

  if (looksLike(text, ["enable"])) patch.enabled = true;

  const hasSomething = Object.keys(patch).length > 0;
  if (!hasSomething) {
    return "Tell me the provider and credentials. Example: “Twilio SID ACxxx token xxxx from +14155552671, enable SMS”.";
  }

  const result = (await executeTool(shop, "update_settings", patch)) as {
    providerReady?: boolean;
    nextStep?: string;
    provider?: string;
  };
  return [
    `Saved ${result.provider || "provider"} settings.`,
    result.providerReady ? "Provider looks connected." : "I still need the remaining credentials to send live SMS.",
    result.nextStep,
  ].join(" ");
}

function looksLike(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function extractPhone(text: string) {
  const match = text.match(/\+?\d[\d\s-]{8,}\d/);
  return match?.[0]?.replace(/[\s-]/g, "") || null;
}
