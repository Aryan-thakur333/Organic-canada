import { ExecArgs } from "@medusajs/framework/types"
import { runApprovedRegionalPriceImport } from "./import-approved-regional-prices.js"

// Uses the same guarded importer, but reads the storefront remediation approval file.
export default async function importApprovedStorefrontPrices(args: ExecArgs) {
  return runApprovedRegionalPriceImport(args, "merchant-storefront-price-remediation.csv")
}
