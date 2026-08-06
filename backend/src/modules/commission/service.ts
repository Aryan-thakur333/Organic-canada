import { MedusaService } from "@medusajs/framework/utils"
import CommissionSetting from "./models/commission-setting"
import CommissionRecord from "./models/commission-record"

// ── Public types ─────────────────────────────────────────────────────────────

export type FeeType = "percentage" | "fixed"

export interface CommissionCalculationResult {
  /** Platform commission in minor units (cents) */
  commission_amount: number
  /** Amount payable to vendor in minor units (cents) */
  vendor_payout: number
}

// ── Service ──────────────────────────────────────────────────────────────────

class CommissionModuleService extends MedusaService({
  CommissionSetting,
  CommissionRecord,
}) {
  /**
   * Pure, deterministic commission calculation.
   *
   * @param baseAmount  Order total or vendor-bucket total in minor units (cents)
   * @param feeType     "percentage" or "fixed"
   * @param feeValue    percentage → integer 0–100, fixed → minor units (cents)
   * @returns           commission_amount and vendor_payout in minor units
   */
  calculateCommission(
    baseAmount: number,
    feeType: FeeType,
    feeValue: number
  ): CommissionCalculationResult {
    // ── Validation ─────────────────────────────────────────────────────
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return { commission_amount: 0, vendor_payout: 0 }
    }

    if (feeType === "percentage") {
      if (!Number.isFinite(feeValue) || feeValue < 0 || feeValue > 100) {
        throw new Error(
          `Invalid percentage fee_value: ${feeValue}. Must be between 0 and 100.`
        )
      }
    } else if (feeType === "fixed") {
      if (!Number.isFinite(feeValue) || feeValue < 0) {
        throw new Error(
          `Invalid fixed fee_value: ${feeValue}. Cannot be negative.`
        )
      }
    } else {
      throw new Error(
        `Invalid fee_type: "${feeType}". Must be "percentage" or "fixed".`
      )
    }

    // ── Calculation ────────────────────────────────────────────────────
    let commission: number

    if (feeType === "percentage") {
      // fee_value is 0–100 (e.g. 10 = 10%)
      commission = Math.round((baseAmount * feeValue) / 100)
    } else {
      // fee_value is in minor units (cents)
      commission = Math.round(feeValue)
    }

    // ── Protection: commission must never exceed the base amount ──────
    commission = Math.max(0, Math.min(commission, baseAmount))

    const vendorPayout = Math.max(0, baseAmount - commission)

    return {
      commission_amount: commission,
      vendor_payout: vendorPayout,
    }
  }
}

export default CommissionModuleService
