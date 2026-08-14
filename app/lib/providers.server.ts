import type { ProviderId } from "./constants";
import { toProviderNumber } from "./phone.server";

export type ProviderCredentials = {
  accountSid?: string;
  authToken?: string;
  httpUrl?: string;
  httpAuthHeader?: string;
};

export type SendSmsInput = {
  provider: ProviderId | string;
  toE164: string;
  body: string;
  fromNumber?: string;
  senderId?: string;
  credentials: ProviderCredentials;
};

export type SendSmsResult = {
  ok: boolean;
  simulated?: boolean;
  providerId?: string;
  error?: string;
};

function connected(input: SendSmsInput) {
  if (input.provider === "twilio") {
    return Boolean(input.credentials.accountSid && input.credentials.authToken && input.fromNumber);
  }
  if (input.provider === "msg91") {
    return Boolean(input.credentials.authToken && input.senderId);
  }
  if (input.provider === "http") {
    return Boolean(input.credentials.httpUrl);
  }
  return false;
}

export function providerConnected(
  provider: string,
  credentials: ProviderCredentials,
  fromNumber: string,
  senderId: string,
) {
  return connected({
    provider,
    toE164: "+10000000000",
    body: "test",
    fromNumber,
    senderId,
    credentials,
  });
}

export async function sendViaProvider(input: SendSmsInput): Promise<SendSmsResult> {
  if (!connected(input)) {
    return {
      ok: true,
      simulated: true,
      error: "Provider not connected — message logged only",
    };
  }

  try {
    if (input.provider === "twilio") {
      return await sendTwilio(input);
    }
    if (input.provider === "msg91") {
      return await sendMsg91(input);
    }
    return await sendHttp(input);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "SMS send failed",
    };
  }
}

async function sendTwilio(input: SendSmsInput): Promise<SendSmsResult> {
  const sid = input.credentials.accountSid!;
  const token = input.credentials.authToken!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const body = new URLSearchParams({
    To: input.toE164,
    From: input.fromNumber || input.senderId || "",
    Body: input.body,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json()) as { sid?: string; message?: string; error_message?: string };

  if (!response.ok) {
    return { ok: false, error: json.error_message || json.message || `Twilio ${response.status}` };
  }
  return { ok: true, providerId: json.sid };
}

async function sendMsg91(input: SendSmsInput): Promise<SendSmsResult> {
  const response = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: {
      accept: "application/json",
      authkey: input.credentials.authToken!,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: input.senderId,
      short_url: "0",
      mobiles: toProviderNumber(input.toE164, "msg91"),
      sms: input.body,
    }),
  });

  if (!response.ok) {
    const fallback = await sendMsg91Http(input);
    if (fallback.ok) return fallback;
    const text = await response.text();
    return { ok: false, error: text.slice(0, 300) || `MSG91 ${response.status}` };
  }

  const json = (await response.json().catch(() => ({}))) as { request_id?: string; type?: string; message?: string };
  if (json.type === "error") {
    return sendMsg91Http(input);
  }
  return { ok: true, providerId: json.request_id || json.message };
}

async function sendMsg91Http(input: SendSmsInput): Promise<SendSmsResult> {
  const params = new URLSearchParams({
    authkey: input.credentials.authToken!,
    mobiles: toProviderNumber(input.toE164, "msg91"),
    message: input.body,
    sender: input.senderId || "ARCHIS",
    route: "4",
    country: "91",
  });
  const response = await fetch(`https://api.msg91.com/api/sendhttp.php?${params.toString()}`);
  const text = await response.text();
  if (!response.ok) return { ok: false, error: text.slice(0, 300) };
  return { ok: true, providerId: text.slice(0, 80) };
}

async function sendHttp(input: SendSmsInput): Promise<SendSmsResult> {
  const response = await fetch(input.credentials.httpUrl!, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.credentials.httpAuthHeader
        ? { Authorization: input.credentials.httpAuthHeader }
        : {}),
    },
    body: JSON.stringify({
      to: input.toE164,
      body: input.body,
      from: input.fromNumber,
      senderId: input.senderId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text.slice(0, 300) || `HTTP ${response.status}` };
  }
  return { ok: true, providerId: `http-${Date.now()}` };
}
