import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const REQUIRED_COLUMNS = {
  commission_setting: [
    "id",
    "account_type",
    "fee_type",
    "fee_value",
    "is_active",
    "metadata",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  commission_record: [
    "id",
    "order_id",
    "account_type",
    "base_amount",
    "fee_type",
    "fee_value",
    "commission_amount",
    "status",
    "metadata",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
} as const

function rows(result: any) {
  return result?.rows || result || []
}

export default async function verifyCommissionSchema({ container }: ExecArgs) {
  const connection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  let hasMissing = false

  try {
    const tableResult = await connection.raw(`
      SELECT
        to_regclass('public.commission_setting') AS commission_setting,
        to_regclass('public.commission_record') AS commission_record
    `)
    const tables = rows(tableResult)[0] || {}

    for (const table of Object.keys(REQUIRED_COLUMNS) as Array<keyof typeof REQUIRED_COLUMNS>) {
      if (!tables[table]) {
        console.log(`[COMMISSION_SCHEMA_MISSING] ${table}`)
        hasMissing = true
      }
    }

    for (const [table, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
      if (!tables[table]) {
        continue
      }

      const columnResult = await connection.raw(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = ?
        `,
        [table]
      )
      const existingColumns = new Set(rows(columnResult).map((row: any) => row.column_name))

      for (const column of requiredColumns) {
        if (!existingColumns.has(column)) {
          console.log(`[COMMISSION_SCHEMA_MISSING_COLUMN] ${table}.${column}`)
          hasMissing = true
        }
      }
    }

    if (!hasMissing) {
      console.log("[COMMISSION_SCHEMA_OK]")
    }
  } catch (error: any) {
    console.error(`[COMMISSION_SCHEMA_ERROR] ${error?.message || error}`)
    process.exit(1)
  }
}
