import type { SmsSetting } from "@prisma/client";
import {
  GROWTH_PLAN,
  PAID_PLANS,
  PLAN_DETAILS,
  PLAN_LIMITS,
  PRO_PLAN,
  STARTER_PLAN,
  type PlanId,
} from "./constants";

export function planIdFromName(name: string | null | undefined): PlanId {
  const value = (name || "free").toLowerCase();
  if (value.includes("pro")) return "pro";
  if (value.includes("growth")) return "growth";
  if (value.includes("starter")) return "starter";
  return "free";
}

export function shopifyPlanName(planId: PlanId) {
  if (planId === "starter") return STARTER_PLAN;
  if (planId === "growth") return GROWTH_PLAN;
  if (planId === "pro") return PRO_PLAN;
  return null;
}

export function periodNeedsReset(periodStart: Date, now = new Date()) {
  return now.getTime() - periodStart.getTime() > 30 * 24 * 60 * 60 * 1000;
}

export function planLimit(plan: string): number {
  return PLAN_LIMITS[planIdFromName(plan)];
}

export function remainingSms(settings: Pick<SmsSetting, "plan" | "smsUsedThisPeriod">) {
  return Math.max(0, planLimit(settings.plan) - settings.smsUsedThisPeriod);
}

export function planLabel(plan: string) {
  const id = planIdFromName(plan);
  return PLAN_DETAILS.find((item) => item.id === id)?.name ?? "Free";
}

export { PAID_PLANS };
