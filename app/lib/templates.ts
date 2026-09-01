import {
  DEFAULT_TEMPLATES,
  EVENT_TYPES,
  type EventType,
} from "./constants";

export type TemplateVars = {
  shop_name?: string;
  customer_first_name?: string;
  customer_name?: string;
  order_name?: string;
  order_total?: string;
  order_status?: string;
  tracking_number?: string;
  tracking_url?: string;
  shipping_city?: string;
};

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export function renderTemplate(body: string, vars: TemplateVars): string {
  const values: Record<string, string> = {
    shop_name: vars.shop_name || "our store",
    customer_first_name: vars.customer_first_name || "there",
    customer_name: vars.customer_name || vars.customer_first_name || "there",
    order_name: vars.order_name || "your order",
    order_total: vars.order_total || "",
    order_status: vars.order_status || "",
    tracking_number: vars.tracking_number || "",
    tracking_url: vars.tracking_url || vars.tracking_number || "",
    shipping_city: vars.shipping_city || "",
  };

  return body
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
      return values[key] ?? "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function defaultTemplate(eventType: EventType): string {
  return DEFAULT_TEMPLATES[eventType];
}

export const SAMPLE_VARS: TemplateVars = {
  shop_name: "Archi Store",
  customer_first_name: "Asha",
  customer_name: "Asha Patel",
  order_name: "#1001",
  order_total: "₹1,499.00",
  order_status: "paid",
  tracking_number: "DTDC123456",
  tracking_url: "https://track.example.com/DTDC123456",
  shipping_city: "Nagpur",
};
