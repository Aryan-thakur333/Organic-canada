/**
 * Emergency Marketplace Schema Repair
 * 
 * Use ONLY if `npm exec -- medusa db:migrate` does not create the marketplace tables.
 * Executes safe additive SQL using the Medusa DB connection.
 * 
 * Run with:
 *   npx medusa exec ./src/scripts/repair-marketplace-schema.ts
 */

import { MedusaContainer } from "@medusajs/framework"

export default async function repairMarketplaceSchema({
  container,
}: {
  container: MedusaContainer
}) {
  console.log("[MARKETPLACE_REPAIR_START] Starting emergency schema repair...")

  const { Client } = await import("pg")
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error("[MARKETPLACE_REPAIR_ERROR] DATABASE_URL not set.")
    return
  }

  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  try {
    const dbResult = await client.query("SELECT current_database()")
    console.log(`[MARKETPLACE_REPAIR_DATABASE] ${dbResult.rows[0].current_database}`)

    // ── Create vendor_order ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "vendor_order" (
        "id"                  TEXT        NOT NULL,
        "vendor_id"           TEXT        NOT NULL,
        "order_id"            TEXT        NOT NULL,
        "display_id"          INTEGER     NULL,
        "status"              TEXT        NOT NULL DEFAULT 'pending'
          CHECK ("status" IN (
            'pending','accepted','rejected','processing',
            'prepared','ready_to_ship',
            'shipped','delivered','cancelled'
          )),
        "payment_status"      TEXT        NOT NULL DEFAULT 'awaiting_payment'
          CHECK ("payment_status" IN (
            'awaiting_payment','captured','refunded','partially_refunded'
          )),
        "fulfillment_status"  TEXT        NOT NULL DEFAULT 'not_fulfilled'
          CHECK ("fulfillment_status" IN (
            'not_fulfilled','allocated','preparing',
            'partially_fulfilled','fulfilled',
            'shipped','delivered','cancelled'
          )),
        "currency_code"       TEXT        NOT NULL DEFAULT 'cad',
        "item_subtotal"       BIGINT      NOT NULL DEFAULT 0,
        "shipping_total"      BIGINT      NOT NULL DEFAULT 0,
        "tax_total"           BIGINT      NOT NULL DEFAULT 0,
        "discount_total"      BIGINT      NOT NULL DEFAULT 0,
        "commission_total"    BIGINT      NOT NULL DEFAULT 0,
        "vendor_net_total"    BIGINT      NOT NULL DEFAULT 0,
        "accepted_at"         TIMESTAMPTZ NULL,
        "rejected_at"         TIMESTAMPTZ NULL,
        "rejection_reason"    TEXT        NULL,
        "processing_at"       TIMESTAMPTZ NULL,
        "shipped_at"          TIMESTAMPTZ NULL,
        "delivered_at"        TIMESTAMPTZ NULL,
        "cancelled_at"        TIMESTAMPTZ NULL,
        "metadata"            JSONB       NULL,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"          TIMESTAMPTZ NULL,
        CONSTRAINT "vendor_order_pkey" PRIMARY KEY ("id")
      )
    `)
    console.log("[MARKETPLACE_REPAIR_TABLES_OK] vendor_order")

    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_vendor_id"
      ON "vendor_order" ("vendor_id") WHERE "deleted_at" IS NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_order_id"
      ON "vendor_order" ("order_id") WHERE "deleted_at" IS NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_status"
      ON "vendor_order" ("status") WHERE "deleted_at" IS NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_created_at"
      ON "vendor_order" ("created_at" DESC) WHERE "deleted_at" IS NULL`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_order_order_vendor_unique"
      ON "vendor_order" ("order_id", "vendor_id") WHERE "deleted_at" IS NULL`)

    // ── Create vendor_order_item ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "vendor_order_item" (
        "id"                TEXT        NOT NULL,
        "vendor_order_id"   TEXT        NOT NULL
          REFERENCES "vendor_order" ("id") ON DELETE CASCADE,
        "vendor_id"         TEXT        NOT NULL,
        "order_id"          TEXT        NOT NULL,
        "order_item_id"     TEXT        NULL,
        "line_item_id"      TEXT        NULL,
        "product_id"        TEXT        NULL,
        "variant_id"        TEXT        NULL,
        "title"             TEXT        NOT NULL,
        "sku"               TEXT        NULL,
        "quantity"          INTEGER     NOT NULL DEFAULT 1,
        "unit_price"        BIGINT      NOT NULL DEFAULT 0,
        "subtotal"          BIGINT      NOT NULL DEFAULT 0,
        "commission_amount" BIGINT      NOT NULL DEFAULT 0,
        "vendor_net_amount" BIGINT      NOT NULL DEFAULT 0,
        "requires_shipping" BOOLEAN     NOT NULL DEFAULT TRUE,
        "inventory_item_id" TEXT        NULL,
        "metadata"          JSONB       NULL,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"        TIMESTAMPTZ NULL,
        CONSTRAINT "vendor_order_item_pkey" PRIMARY KEY ("id")
      )
    `)
    console.log("[MARKETPLACE_REPAIR_TABLES_OK] vendor_order_item")

    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_item_vendor_order_id"
      ON "vendor_order_item" ("vendor_order_id") WHERE "deleted_at" IS NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_item_vendor_id"
      ON "vendor_order_item" ("vendor_id") WHERE "deleted_at" IS NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_item_line_item_id"
      ON "vendor_order_item" ("line_item_id") WHERE "deleted_at" IS NULL`)

    // ── Create vendor_order_activity ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "vendor_order_activity" (
        "id"              TEXT        NOT NULL,
        "vendor_order_id" TEXT        NOT NULL
          REFERENCES "vendor_order" ("id") ON DELETE CASCADE,
        "vendor_id"       TEXT        NOT NULL,
        "type"            TEXT        NOT NULL,
        "title"           TEXT        NOT NULL,
        "description"     TEXT        NULL,
        "actor_type"      TEXT        NOT NULL DEFAULT 'system'
          CHECK ("actor_type" IN ('system','vendor','admin','customer')),
        "actor_id"        TEXT        NULL,
        "metadata"        JSONB       NULL,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"      TIMESTAMPTZ NULL,
        CONSTRAINT "vendor_order_activity_pkey" PRIMARY KEY ("id")
      )
    `)

    await client.query(`
      ALTER TABLE "vendor_order_activity" DROP CONSTRAINT IF EXISTS "vendor_order_activity_type_check";
    `)
    await client.query(`
      ALTER TABLE "vendor_order_activity" ADD CONSTRAINT "vendor_order_activity_type_check" 
      CHECK ("type" IN (
        'order_received','order_accepted','order_rejected',
        'inventory_allocated','processing_started','order_prepared',
        'fulfillment_created','shipment_created','tracking_updated',
        'order_shipped','order_delivered','order_cancelled',
        'payment_authorized','payment_captured','payment_refunded',
        'note_added','delivered','admin_note','customer_cancellation_requested'
      ));
    `)
    console.log("[MARKETPLACE_REPAIR_TABLES_OK] vendor_order_activity")

    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_activity_vendor_order_id"
      ON "vendor_order_activity" ("vendor_order_id") WHERE "deleted_at" IS NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_activity_created_at"
      ON "vendor_order_activity" ("created_at" DESC) WHERE "deleted_at" IS NULL`)

    // ── Create vendor_earning ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "vendor_earning" (
        "id"                TEXT        NOT NULL,
        "vendor_id"         TEXT        NOT NULL,
        "vendor_order_id"   TEXT        NOT NULL
          REFERENCES "vendor_order" ("id") ON DELETE CASCADE,
        "order_id"          TEXT        NOT NULL,
        "gross_amount"      BIGINT      NOT NULL DEFAULT 0,
        "commission_amount" BIGINT      NOT NULL DEFAULT 0,
        "net_amount"        BIGINT      NOT NULL DEFAULT 0,
        "status"            TEXT        NOT NULL DEFAULT 'pending'
          CHECK ("status" IN ('pending','locked','available','paid','reversed')),
        "available_at"      TIMESTAMPTZ NULL,
        "paid_at"           TIMESTAMPTZ NULL,
        "payout_reference"  TEXT        NULL,
        "metadata"          JSONB       NULL,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at"        TIMESTAMPTZ NULL,
        CONSTRAINT "vendor_earning_pkey" PRIMARY KEY ("id")
      )
    `)
    console.log("[MARKETPLACE_REPAIR_TABLES_OK] vendor_earning")

    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_earning_vendor_id"
      ON "vendor_earning" ("vendor_id") WHERE "deleted_at" IS NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_earning_vendor_order_id"
      ON "vendor_earning" ("vendor_order_id") WHERE "deleted_at" IS NULL`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_earning_vendor_order_id_unique"
      ON "vendor_earning" ("vendor_order_id") WHERE "deleted_at" IS NULL`)

    // Final verify
    const tables = ["vendor_order", "vendor_order_item", "vendor_order_activity", "vendor_earning"]
    let ok = true
    for (const t of tables) {
      const res = await client.query(`SELECT to_regclass('public.${t}') AS exists`)
      if (!res.rows[0].exists) ok = false
    }

    if (ok) {
      console.log("[MARKETPLACE_SCHEMA_OK] Schema repair successful ✓")
    } else {
      console.error("[MARKETPLACE_SCHEMA_FAIL] Repair incomplete")
    }
    
    console.log("[MARKETPLACE_REPAIR_DONE]")
  } finally {
    await client.end()
  }
}
