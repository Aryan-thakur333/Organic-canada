/**
 * Commission Calculation Utility
 *
 * Pure, deterministic standalone functions for computing commission amounts.
 * No side effects. Safe to call from any context (subscribers, workflows, tests).
 *
 * All monetary values are in MINOR UNITS (cents).
 * Percentage fee_value is an integer 0–100.
 */

export type FeeType = "percentage" | "fixed"

export interface CommissionInput {
  fee_type: FeeType
  fee_value: number
}

export interface CommissionResult {
  /** Platform commission in minor units */
  commission_amount: number
  /** Amount payable to vendor in minor units */
  vendor_payout: number
}

/**
 * Calculate commission amount and vendor payout in minor units (cents).
 *
 * @param rule        Active commission rule (or a frozen snapshot of one)
 * @param baseAmount  Order total or vendor-bucket total in minor units
 * @returns           commission_amount and vendor_payout in minor units
 *
 * Guarantees:
 *   ✓ Safe rounding (Math.round)
 *   ✓ Commission never exceeds baseAmount
 *   ✓ All results are non-negative integers
 *
 * @example
 *   calculateCommission({ fee_type: "percentage", fee_value: 10 }, 39950)
 *   // → { commission_amount: 3995, vendor_payout: 35955 }
 *
 * @example
 *   calculateCommission({ fee_type: "fixed", fee_value: 500 }, 10000)
 *   // → { commission_amount: 500, vendor_payout: 9500 }
 */
export function calculateCommission(
  rule: CommissionInput,
  baseAmount: number
): CommissionResult {
  if (!rule || !Number.isFinite(baseAmount) || baseAmount <= 0) {
    return { commission_amount: 0, vendor_payout: 0 }
  }

  let commission: number

  if (rule.fee_type === "percentage") {
    if (rule.fee_value < 0 || rule.fee_value > 100) {
      throw new Error(
        `Percentage fee_value must be 0–100, got ${rule.fee_value}`
      )
    }
    commission = Math.round((baseAmount * rule.fee_value) / 100)
  } else if (rule.fee_type === "fixed") {
    if (rule.fee_value < 0) {
      throw new Error(
        `Fixed fee_value cannot be negative, got ${rule.fee_value}`
      )
    }
    commission = Math.round(rule.fee_value)
  } else {
    return { commission_amount: 0, vendor_payout: 0 }
  }

  // Protection: commission cannot exceed the base amount
  commission = Math.max(0, Math.min(commission, baseAmount))

  return {
    commission_amount: commission,
    vendor_payout: Math.max(0, baseAmount - commission),
  }
}

/**
 * Format a percentage value for display.
 * @example formatPercentage(10) → "10%"
 */
export function formatPercentage(value: number): string {
  return `${value}%`
}

/**
 * Convert minor units to a display decimal string.
 * @example minorToDisplay(39950, "cad") → "399.50"
 */
export function minorToDisplay(
  minorUnits: number,
  currencyCode = "cad"
): string {
  const divisor = getMinorUnitDivisor(currencyCode)
  return (minorUnits / divisor).toFixed(2)
}

/**
 * Returns the minor unit divisor for a currency.
 * Most currencies use 100 (cents); some use 1 (JPY, KRW, etc.).
 */
function getMinorUnitDivisor(currencyCode: string): number {
  const zeroCurrencies = [
    "jpy", "krw", "clp", "gnf", "mga",
    "pyg", "rwf", "ugx", "vnd", "xaf", "xof",
  ]
  return zeroCurrencies.includes(currencyCode.toLowerCase()) ? 1 : 100
}
