import type { ExecArgs } from "@medusajs/framework/types"
import { COMMISSION_MODULE } from "../modules/commission/index.js"

/**
 * Seed script: creates one active commission setting per account_type.
 *
 * Run with:
 *   npx medusa exec ./src/scripts/seed-commission-settings.ts
 */
export default async function seedCommissionSettings({ container }: ExecArgs) {
  console.log("[COMMISSION_SEED_START]")

  const commissionService: any = container.resolve(COMMISSION_MODULE)

  const settings = [
    {
      account_type: "normal_customer" as const,
      fee_type: "percentage" as const,
      fee_value: 10,
      is_active: true,
    },
    {
      account_type: "b2b_customer" as const,
      fee_type: "percentage" as const,
      fee_value: 10,
      is_active: true,
    },
    {
      account_type: "vendor" as const,
      fee_type: "percentage" as const,
      fee_value: 8,
      is_active: true,
    },
  ]

  try {
    for (const s of settings) {
      let existing: any[] = []
      try {
        existing = await commissionService.listCommissionSettings({
          account_type: s.account_type,
          is_active: true,
        })
      } catch (err: any) {
        if (err.message.includes("relation") && err.message.includes("does not exist")) {
          throw new Error("Run npm exec -- medusa db:migrate first.")
        }
        throw err
      }

      for (const ex of existing) {
        await commissionService.updateCommissionSettings({
          id: ex.id,
          is_active: false,
        })
      }

      await commissionService.createCommissionSettings(s)
      console.log(`[COMMISSION_SEED_UPSERTED] ${s.account_type}`)
    }

    console.log("[COMMISSION_SEED_DONE]")
  } catch (error: any) {
    console.error(`[Seed Error] ${error.message}`)
    process.exit(1)
  }
}
