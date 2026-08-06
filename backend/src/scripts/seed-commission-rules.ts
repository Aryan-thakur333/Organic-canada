import type { ExecArgs } from "@medusajs/framework/types"
import seedCommissionSettings from "./seed-commission-settings.js"

export default async function seedCommissionRules(args: ExecArgs) {
  console.log("[Seed] Routing legacy seedCommissionRules to seedCommissionSettings...")
  return seedCommissionSettings(args)
}
