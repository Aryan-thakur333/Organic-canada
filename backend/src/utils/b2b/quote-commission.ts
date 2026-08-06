import { COMMISSION_MODULE } from "../../modules/commission"
import { calculateCommission } from "../commission/calculate"
import { storedMinor } from "./money"

export const B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE = "b2b_customer"
export const B2B_CUSTOMER_COMMISSION_POLICY = "customer_markup"

export type B2BQuoteCommissionSnapshot = {
  account_type: string
  policy: string
  base_amount: number
  fee_type: string
  fee_value: number
  commission_amount: number
  final_payable_total: number
  currency_code: string
  calculated_at?: string
}

function asNumber(value: any, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function zeroB2BQuoteCommissionSnapshot(
  baseAmount: number,
  currencyCode = "cad"
): B2BQuoteCommissionSnapshot {
  const base = storedMinor(baseAmount)
  return {
    account_type: B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE,
    policy: B2B_CUSTOMER_COMMISSION_POLICY,
    base_amount: base,
    fee_type: "none",
    fee_value: 0,
    commission_amount: 0,
    final_payable_total: base,
    currency_code: String(currencyCode || "cad").toLowerCase(),
  }
}

export function getQuoteCommissionSnapshot(quote: any): B2BQuoteCommissionSnapshot | null {
  const metadata = quote?.metadata || {}
  const snapshot = metadata.b2b_commission || metadata.quote_commission || null
  const baseAmount = snapshot?.base_amount ?? metadata.negotiated_subtotal ?? quote?.negotiated_total
  const commissionAmount = snapshot?.commission_amount ?? metadata.commission_amount
  const finalPayableTotal = snapshot?.final_payable_total ?? metadata.final_payable_total

  if (
    !Number.isFinite(Number(baseAmount)) &&
    !Number.isFinite(Number(commissionAmount)) &&
    !Number.isFinite(Number(finalPayableTotal))
  ) {
    return null
  }

  const base = storedMinor(baseAmount)
  const commission = storedMinor(commissionAmount)
  return {
    account_type: snapshot?.account_type || metadata.commission_account_type || B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE,
    policy: snapshot?.policy || metadata.commission_policy || B2B_CUSTOMER_COMMISSION_POLICY,
    base_amount: base,
    fee_type: snapshot?.fee_type || metadata.commission_type || "none",
    fee_value: asNumber(snapshot?.fee_value ?? metadata.commission_value, 0),
    commission_amount: commission,
    final_payable_total: storedMinor(finalPayableTotal, base + commission),
    currency_code: String(snapshot?.currency_code || quote?.currency_code || "cad").toLowerCase(),
    calculated_at: snapshot?.calculated_at || metadata.commission_snapshot_at || undefined,
  }
}

export function getQuoteNegotiatedSubtotalMinor(quote: any): number {
  const snapshot = getQuoteCommissionSnapshot(quote)
  return storedMinor(
    quote?.metadata?.negotiated_subtotal ??
      snapshot?.base_amount ??
      quote?.negotiated_total ??
      quote?.total ??
      quote?.requested_total ??
      quote?.subtotal ??
      0
  )
}

export function getQuoteFinalPayableTotalMinor(quote: any): number {
  const snapshot = getQuoteCommissionSnapshot(quote)
  if (snapshot) {
    return storedMinor(snapshot.final_payable_total)
  }

  return getQuoteNegotiatedSubtotalMinor(quote)
}

export function quoteCommissionResponseFields(quote: any) {
  const negotiatedSubtotal = getQuoteNegotiatedSubtotalMinor(quote)
  const snapshot =
    getQuoteCommissionSnapshot(quote) ||
    zeroB2BQuoteCommissionSnapshot(negotiatedSubtotal, quote?.currency_code)

  return {
    negotiated_subtotal: negotiatedSubtotal,
    commission_amount: snapshot.commission_amount,
    commission_type: snapshot.fee_type,
    commission_value: snapshot.fee_value,
    commission_policy: snapshot.policy,
    final_payable_total: snapshot.final_payable_total,
    commission: {
      account_type: snapshot.account_type,
      policy: snapshot.policy,
      base_amount: snapshot.base_amount,
      fee_type: snapshot.fee_type,
      fee_value: snapshot.fee_value,
      amount: snapshot.commission_amount,
      final_payable_total: snapshot.final_payable_total,
      currency_code: snapshot.currency_code,
      calculated_at: snapshot.calculated_at || null,
    },
  }
}

export async function calculateB2BQuoteCommissionSnapshot({
  container,
  baseAmount,
  currencyCode = "cad",
}: {
  container: any
  baseAmount: number
  currencyCode?: string
}): Promise<B2BQuoteCommissionSnapshot> {
  const base = storedMinor(baseAmount)

  let activeRule: any = null
  try {
    const commissionService: any = container.resolve(COMMISSION_MODULE)
    const settings = await commissionService.listCommissionSettings(
      {
        account_type: B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE,
        is_active: true,
      },
      { take: 1 }
    )
    activeRule = settings?.[0] || null
  } catch {
    activeRule = null
  }

  if (!activeRule || base <= 0) {
    return zeroB2BQuoteCommissionSnapshot(base, currencyCode)
  }

  const result = calculateCommission(
    {
      fee_type: activeRule.fee_type,
      fee_value: Number(activeRule.fee_value || 0),
    } as any,
    base
  )

  return {
    account_type: B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE,
    policy: B2B_CUSTOMER_COMMISSION_POLICY,
    base_amount: base,
    fee_type: activeRule.fee_type || "none",
    fee_value: Number(activeRule.fee_value || 0),
    commission_amount: result.commission_amount,
    final_payable_total: base + result.commission_amount,
    currency_code: String(currencyCode || "cad").toLowerCase(),
    calculated_at: new Date().toISOString(),
  }
}

export function quoteCommissionMetadata(
  existingMetadata: Record<string, any> | null | undefined,
  snapshot: B2BQuoteCommissionSnapshot
) {
  return {
    ...(existingMetadata || {}),
    negotiated_subtotal: snapshot.base_amount,
    commission_amount: snapshot.commission_amount,
    commission_type: snapshot.fee_type,
    commission_value: snapshot.fee_value,
    commission_account_type: snapshot.account_type,
    commission_policy: snapshot.policy,
    commission_snapshot_at: snapshot.calculated_at,
    final_payable_total: snapshot.final_payable_total,
    b2b_commission: snapshot,
  }
}
