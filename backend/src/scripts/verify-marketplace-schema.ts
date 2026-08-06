/**
 * Verify Marketplace Schema
 * 
 * Checks that all required Marketplace tables and critical columns exist.
 * Safe: read-only. Does not modify any data.
 * 
 * Run with:
 *   npx medusa exec ./src/scripts/verify-marketplace-schema.ts
 */

import { MedusaContainer } from "@medusajs/framework"
import { Modules } from "@medusajs/framework/utils"

const REQUIRED_TABLES = [
  "vendor_order",
  "vendor_order_item",
  "vendor_order_activity",
  "vendor_earning",
] as const

const REQUIRED_COLUMNS: Record<string, string[]> = {
  vendor_order: [
    "id", "vendor_id", "order_id", "display_id",
    "status", "payment_status", "fulfillment_status",
    "currency_code", "item_subtotal", "commission_total", "vendor_net_total",
    "created_at", "updated_at", "deleted_at",
  ],
  vendor_order_item: [
    "id", "vendor_order_id", "vendor_id", "order_id",
    "line_item_id", "title", "quantity", "unit_price", "subtotal",
    "commission_amount", "vendor_net_amount",
    "created_at", "updated_at", "deleted_at",
  ],
  vendor_earning: [
    "id", "vendor_id", "vendor_order_id", "order_id",
    "gross_amount", "commission_amount", "net_amount", "status",
    "created_at", "updated_at", "deleted_at",
  ],
  vendor_order_activity: [
    "id", "vendor_order_id", "vendor_id", "type", "title",
    "actor_type", "created_at", "updated_at", "deleted_at",
  ],
}

export default async function verifyMarketplaceSchema({
  container,
}: {
  container: MedusaContainer
}) {
  console.log("[MARKETPLACE_SCHEMA_VERIFY] Starting schema verification...")

  // Resolve the raw PostgreSQL connection via Medusa's database manager
  // Medusa v2 exposes the pg manager through the database key on the container
  let pgManager: any
  try {
    // Try multiple ways to get a raw DB connection
    const manager = container.resolve("__pg_connection__") as any
    pgManager = manager
  } catch {
    try {
      const dbManager = (container as any).pgConnection || (container as any)._db
      pgManager = dbManager
    } catch {
      // Fallback: use process.env.DATABASE_URL
    }
  }

  // If we still don't have a connection, use the node-postgres client directly
  const { Client } = await import("pg")
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error("[MARKETPLACE_SCHEMA_ERROR] DATABASE_URL not set")
    process.exit(1)
  }

  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  try {
    // 1. Print current database context
    const dbContext = await client.query("SELECT current_database() as db, current_schema() as schema, current_user as user")
    console.log(`[MARKETPLACE_SCHEMA_DATABASE] ${dbContext.rows[0].db} (Schema: ${dbContext.rows[0].schema}, User: ${dbContext.rows[0].user})`)

    let allOk = true

    // 2. Check each table
    for (const table of REQUIRED_TABLES) {
      const tableCheck = await client.query(
        `SELECT to_regclass('public.${table}') AS exists`
      )
      const exists = tableCheck.rows[0].exists !== null

      if (exists) {
        console.log(`[MARKETPLACE_SCHEMA_TABLE_OK] ${table}`)
      } else {
        console.error(`[MARKETPLACE_SCHEMA_MISSING_TABLE] ${table}`)
        allOk = false
        continue // skip column checks for missing table
      }

      // 3. Check required columns
      const colResult = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      )
      const existingCols = new Set(colResult.rows.map((r: any) => r.column_name))

      for (const col of REQUIRED_COLUMNS[table] || []) {
        if (existingCols.has(col)) {
          // Columns OK — only log missing ones
        } else {
          console.error(`[MARKETPLACE_SCHEMA_MISSING_COLUMN] ${table}.${col}`)
          allOk = false
        }
      }
    }

    // 4. Final verdict
    if (allOk) {
      console.log("[MARKETPLACE_SCHEMA_OK] All required tables and columns verified ✓")
    } else {
      console.error(
        "[MARKETPLACE_SCHEMA_FAIL] Schema is incomplete.\n" +
        "→ Run: npx medusa db:migrate\n" +
        "→ If that does not create the tables, run:\n" +
        "→   npx medusa exec ./src/scripts/repair-marketplace-schema.ts"
      )
    }

    return allOk
  } finally {
    await client.end()
  }
}
