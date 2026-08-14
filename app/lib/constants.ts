export const STARTER_PLAN = "Starter";
export const GROWTH_PLAN = "Growth";
export const PRO_PLAN = "Pro";

export const PAID_PLANS = [STARTER_PLAN, GROWTH_PLAN, PRO_PLAN] as const;

export type PaidPlan = (typeof PAID_PLANS)[number];
export type PlanId = "free" | "starter" | "growth" | "pro";

export const PLAN_LIMITS: Record<PlanId, number> = {
  free: 50,
  starter: 500,
  growth: 2500,
  pro: 10000,
};

export const PLAN_DETAILS: {
  id: PlanId;
  name: string;
  price: string;
  sms: number;
  blurb: string;
  shopifyPlan?: PaidPlan;
}[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    sms: 50,
    blurb: "Try order SMS on a live store. Enough to prove fewer WISMO tickets.",
  },
  {
    id: "starter",
    name: STARTER_PLAN,
    price: "$9",
    sms: 500,
    blurb: "For growing stores that confirm every order by SMS.",
    shopifyPlan: STARTER_PLAN,
  },
  {
    id: "growth",
    name: GROWTH_PLAN,
    price: "$29",
    sms: 2500,
    blurb: "Shipping and COD updates at volume, with room to scale.",
    shopifyPlan: GROWTH_PLAN,
  },
  {
    id: "pro",
    name: PRO_PLAN,
    price: "$79",
    sms: 10000,
    blurb: "High-volume stores and COD-heavy catalogs.",
    shopifyPlan: PRO_PLAN,
  },
];

export const EVENT_TYPES = [
  "order_confirmed",
  "order_cod",
  "order_shipped",
  "out_for_delivery",
  "order_delivered",
  "order_cancelled",
  "order_refunded",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABELS: Record<EventType, string> = {
  order_confirmed: "Order confirmed",
  order_cod: "Cash on delivery",
  order_shipped: "Order shipped",
  out_for_delivery: "Out for delivery",
  order_delivered: "Delivered",
  order_cancelled: "Order cancelled",
  order_refunded: "Refund issued",
};

export const EVENT_HELP: Record<EventType, string> = {
  order_confirmed: "Sent when a prepaid order is placed.",
  order_cod: "Sent instead of confirmation when the order is Cash on Delivery.",
  order_shipped: "Sent when a fulfillment with tracking is created.",
  out_for_delivery: "Sent when the carrier marks the package out for delivery.",
  order_delivered: "Sent when the carrier marks the package delivered.",
  order_cancelled: "Sent when the order is cancelled.",
  order_refunded: "Sent when a refund is issued.",
};

export const DEFAULT_TEMPLATES: Record<EventType, string> = {
  order_confirmed:
    "Hi {{customer_first_name}}, your order {{order_name}} at {{shop_name}} is confirmed. Total {{order_total}}. Thank you!",
  order_cod:
    "Hi {{customer_first_name}}, {{order_name}} is Cash on Delivery. Please keep {{order_total}} ready. — {{shop_name}}",
  order_shipped:
    "Good news {{customer_first_name}}! {{order_name}} has shipped. Track: {{tracking_url}}",
  out_for_delivery:
    "{{order_name}} is out for delivery today. Please keep your phone handy. — {{shop_name}}",
  order_delivered:
    "{{order_name}} was delivered. Thanks for shopping at {{shop_name}}!",
  order_cancelled:
    "{{order_name}} at {{shop_name}} has been cancelled. Message us if you need help.",
  order_refunded:
    "A refund for {{order_name}} ({{order_total}}) has been issued by {{shop_name}}.",
};

export const TEMPLATE_VARS = [
  { key: "{{shop_name}}", label: "Store name" },
  { key: "{{customer_first_name}}", label: "Customer first name" },
  { key: "{{customer_name}}", label: "Customer full name" },
  { key: "{{order_name}}", label: "Order number, e.g. #1001" },
  { key: "{{order_total}}", label: "Order total with currency" },
  { key: "{{order_status}}", label: "Financial / fulfillment status" },
  { key: "{{tracking_number}}", label: "Tracking number" },
  { key: "{{tracking_url}}", label: "Tracking URL" },
  { key: "{{shipping_city}}", label: "Shipping city" },
] as const;

export const PROVIDERS = [
  { id: "twilio", label: "Twilio" },
  { id: "msg91", label: "MSG91" },
  { id: "http", label: "Custom HTTP" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];
