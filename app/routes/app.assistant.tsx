import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  isAiConfigured,
  runAssistant,
  welcomeMessage,
} from "../lib/assistant.server";
import { runHealthCheck } from "../lib/health.server";
import styles from "../styles/assistant.module.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const health = await runHealthCheck(session.shop);
  return {
    usedAi: isAiConfigured(),
    nextStep: health.checks.find((item) => !item.ok)?.label || "Ready",
    welcome: welcomeMessage(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  let history: ChatMessage[] = [];
  try {
    history = JSON.parse(String(formData.get("history") || "[]")) as ChatMessage[];
  } catch {
    history = [];
  }
  const message = String(formData.get("message") || "").trim();
  if (!message) {
    return { error: "Type what you want to do." };
  }
  const messages: ChatMessage[] = [...history.slice(-18), { role: "user", content: message }];
  const result = await runAssistant(session.shop, messages);
  return {
    reply: result.reply,
    usedAi: result.usedAi,
  };
};

const SUGGESTIONS = [
  "Set up the app for me",
  "Enable SMS",
  "Send a test SMS",
  "Why didn’t an order get a text?",
  "Explain COD messages",
];

export default function AssistantPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: data.welcome },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingUser = useRef<string | null>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if ("error" in fetcher.data && fetcher.data.error && !("reply" in fetcher.data)) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: String(fetcher.data?.error) },
      ]);
      pendingUser.current = null;
      return;
    }
    if ("reply" in fetcher.data && fetcher.data.reply) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: fetcher.data!.reply as string },
      ]);
      pendingUser.current = null;
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, fetcher.state]);

  const sending = fetcher.state !== "idle";

  function send(text: string) {
    const value = text.trim();
    if (!value || sending) return;
    pendingUser.current = value;
    setMessages((current) => [...current, { role: "user", content: value }]);
    setInput("");
    fetcher.submit(
      { message: value, history: JSON.stringify(messages) },
      { method: "post" },
    );
  }

  return (
    <s-page heading="AI assistant">
      <s-banner
        heading={data.usedAi ? "Archi can change settings for you" : "Guided setup is on"}
        tone="info"
      >
        {data.usedAi
          ? "Ask in plain language. I can connect a provider, enable SMS, edit templates, and send a test."
          : "I can still set up the app from short commands. Add OPENAI_API_KEY or GROQ_API_KEY on the server for fuller AI chat."}{" "}
        Next: {data.nextStep}.
      </s-banner>

      <s-section heading="What do you want to do?">
        <s-stack direction="inline" gap="small">
          {SUGGESTIONS.map((item) => (
            <s-button
              key={item}
              variant="secondary"
              disabled={sending || undefined}
              onClick={() => send(item)}
            >
              {item}
            </s-button>
          ))}
        </s-stack>

        <div className={styles.thread}>
          {messages.map((item, index) => (
            <div
              key={`${item.role}-${index}`}
              className={item.role === "user" ? styles.user : styles.assistant}
            >
              <div className={styles.bubble}>{item.content}</div>
            </div>
          ))}
          {sending ? <div className={styles.assistant}><div className={styles.bubble}>Working…</div></div> : null}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
        >
          <s-stack direction="block" gap="base">
            <s-text-area
              name="message"
              label="Message"
              rows={3}
              value={input}
              placeholder="e.g. Use MSG91, auth key …, sender ARCHIS, then enable SMS and test +91…"
              onInput={(event: { currentTarget: { value: string } }) => {
                setInput(event.currentTarget.value);
              }}
            />
            <s-button type="submit" variant="primary" disabled={sending || undefined}>
              Send
            </s-button>
          </s-stack>
        </form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
