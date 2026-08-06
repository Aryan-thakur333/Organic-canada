import { createHash } from "node:crypto"

export const SUBSCRIPTION_INTERVALS = ["WEEK", "MONTH", "QUARTER", "YEAR"] as const
export type SubscriptionInterval = typeof SUBSCRIPTION_INTERVALS[number]

export const INTERVAL_TO_PLAN: Record<SubscriptionInterval, "weekly" | "monthly" | "quarterly" | "yearly"> = {
  WEEK: "weekly",
  MONTH: "monthly",
  QUARTER: "quarterly",
  YEAR: "yearly",
}

export function createSubscriptionFingerprint(input: {
  customerId: string
  cartId: string
  interval: SubscriptionInterval
  intervalCount: number
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

export function calculateSubscriptionUnitPrice(
  unitPrice: number,
  config: { discount_type?: string; discount_value?: number }
): number {
  if (!Number.isInteger(unitPrice) || unitPrice < 0) throw new Error("Invalid calculated unit price")
  const value = Number(config.discount_value || 0)
  if (config.discount_type === "percentage") {
    if (!Number.isFinite(value) || value < 0 || value > 10000) throw new Error("Invalid subscription percentage")
    return Math.max(0, Math.round(unitPrice * (1 - value / 10000)))
  }
  if (config.discount_type === "fixed") {
    if (!Number.isInteger(value) || value < 0) throw new Error("Invalid subscription adjustment")
    return Math.max(0, unitPrice - value)
  }
  return unitPrice
}

export const LEGAL_SUBSCRIPTION_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["active", "cancelled", "expired"],
  trialing: ["active", "past_due", "cancelled", "expired"],
  active: ["paused", "past_due", "cancelled", "expired"],
  paused: ["active", "cancelled", "expired"],
  past_due: ["active", "cancelled", "expired"],
  cancelled: [],
  expired: [],
}

export function canTransitionSubscription(from: string, to: string): boolean {
  return from === to || Boolean(LEGAL_SUBSCRIPTION_TRANSITIONS[from]?.includes(to))
}

