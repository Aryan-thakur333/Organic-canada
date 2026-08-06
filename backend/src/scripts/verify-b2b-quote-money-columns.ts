import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const REQUIRED_COLUMNS = [
  "original_total",
  "negotiated_total",
  "quote_adjustment_total",
  "payment_state",
  "payment_terms",
  "payment_due_date",
  "offer_version",
  "expires_at",
  "accepted_at",
  "paid_at",
  "settlement_mode",
  "payment_reference",
  "payment_collection_id",
  "selected_payment_provider_id",
]

export default async function verifyB2BQuoteMoneyColumns({ container }: ExecArgs) {
  const connection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const result = await connection.raw(
    `
      select column_name, data_type
      from information_schema.columns
      where table_name = 'b2b_quote'
        and column_name = any(?)
      order by column_name
    `,
    [REQUIRED_COLUMNS]
  )
  const rows = result?.rows || []
  const found = new Set(rows.map((row: any) => row.column_name))
  const missing = REQUIRED_COLUMNS.filter((column) => !found.has(column))

  console.log("[B2B_QUOTE_MONEY_COLUMNS]")
  for (const row of rows) {
    console.log(`${row.column_name}: ${row.data_type}`)
  }

  if (missing.length) {
    throw new Error(`Missing b2b_quote columns: ${missing.join(", ")}`)
  }
}
