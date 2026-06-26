export const normalizeSubscriptionPlan = (plan: any) => {
  const metadata = plan?.metadata || {}
  const interval = metadata.interval || (plan.plan === "weekly" ? "week" : plan.plan === "yearly" ? "year" : "month")
  const period = Number(metadata.period || (plan.plan === "quarterly" ? 3 : 1))
  return {
    ...plan,
    name: plan.title,
    interval,
    period,
    display: metadata.display || plan.title,
    price: plan.amount,
    currency_code: plan.currency,
    status: plan.is_active ? "active" : "inactive",
    metadata,
  }
}

export const planModelInput = (input: any) => {
  const interval = input.interval || input.metadata?.interval ||
    (input.plan === "weekly" ? "week" : input.plan === "yearly" ? "year" : "month")
  const period = Number(input.period || input.metadata?.period || 1)
  const legacyPlan = input.plan || (interval === "week" ? "weekly" : interval === "year" ? "yearly" : "monthly")
  return {
    title: input.name || input.title,
    description: input.description ?? null,
    plan: legacyPlan,
    amount: Math.round(Number(input.price ?? input.amount)),
    currency: String(input.currency_code || input.currency || "cad").toLowerCase(),
    is_active: input.status ? input.status === "active" : input.is_active !== false,
    sort_order: Number(input.sort_order || 0),
    metadata: {
      ...(input.metadata || {}),
      interval,
      period,
      display: input.display || input.metadata?.display || input.name || input.title,
    },
  }
}

export const addPlanPeriod = (date: Date, interval: string, period: number) => {
  const result = new Date(date)
  if (interval === "week") result.setDate(result.getDate() + 7 * period)
  else if (interval === "year") result.setFullYear(result.getFullYear() + period)
  else result.setMonth(result.getMonth() + period)
  return result
}
