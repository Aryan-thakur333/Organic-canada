const { Client } = require("pg");
const dotenv = require("dotenv");
const path = require("path");

// Load .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  console.log("[MARKETPLACE_REPAIR_START] Starting standalone schema repair...");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[MARKETPLACE_REPAIR_ERROR] DATABASE_URL not set in .env. Cannot proceed.");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const dbContext = await client.query("SELECT current_database() as db, current_schema() as schema, current_user as user");
    console.log(`[MARKETPLACE_REPAIR_DATABASE] ${dbContext.rows[0].db} (Schema: ${dbContext.rows[0].schema}, User: ${dbContext.rows[0].user})`);

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
            'ready_to_ship','shipped','delivered','cancelled'
          )),
        "payment_status"      TEXT        NOT NULL DEFAULT 'awaiting_payment'
          CHECK ("payment_status" IN (
            'awaiting_payment','captured','refunded','partially_refunded'
          )),
        "fulfillment_status"  TEXT        NOT NULL DEFAULT 'not_fulfilled'
          CHECK ("fulfillment_status" IN (
            'not_fulfilled','allocated','partially_fulfilled',
            'fulfilled','shipped','delivered','cancelled'
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
    `);
    console.log("[MARKETPLACE_REPAIR_TABLE_OK] vendor_order");

    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_vendor_id"
      ON "vendor_order" ("vendor_id") WHERE "deleted_at" IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_order_id"
      ON "vendor_order" ("order_id") WHERE "deleted_at" IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_status"
      ON "vendor_order" ("status") WHERE "deleted_at" IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_created_at"
      ON "vendor_order" ("created_at" DESC) WHERE "deleted_at" IS NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_order_order_vendor_unique"
      ON "vendor_order" ("order_id", "vendor_id") WHERE "deleted_at" IS NULL`);

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
    `);
    console.log("[MARKETPLACE_REPAIR_TABLE_OK] vendor_order_item");

    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_item_vendor_order_id"
      ON "vendor_order_item" ("vendor_order_id") WHERE "deleted_at" IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_item_vendor_id"
      ON "vendor_order_item" ("vendor_id") WHERE "deleted_at" IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_item_line_item_id"
      ON "vendor_order_item" ("line_item_id") WHERE "deleted_at" IS NULL`);

    // ── Create vendor_order_activity ────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "vendor_order_activity" (
        "id"              TEXT        NOT NULL,
        "vendor_order_id" TEXT        NOT NULL
          REFERENCES "vendor_order" ("id") ON DELETE CASCADE,
        "vendor_id"       TEXT        NOT NULL,
        "type"            TEXT        NOT NULL
          CHECK ("type" IN (
            'order_received','order_accepted','order_rejected',
            'inventory_allocated','processing_started','fulfillment_created',
            'shipment_created','tracking_updated','delivered',
            'admin_note','customer_cancellation_requested'
          )),
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
    `);
    console.log("[MARKETPLACE_REPAIR_TABLE_OK] vendor_order_activity");

    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_activity_vendor_order_id"
      ON "vendor_order_activity" ("vendor_order_id") WHERE "deleted_at" IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_activity_created_at"
      ON "vendor_order_activity" ("created_at" DESC) WHERE "deleted_at" IS NULL`);

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
    `);
    console.log("[MARKETPLACE_REPAIR_TABLE_OK] vendor_earning");

    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_earning_vendor_id"
      ON "vendor_earning" ("vendor_id") WHERE "deleted_at" IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_vendor_earning_vendor_order_id"
      ON "vendor_earning" ("vendor_order_id") WHERE "deleted_at" IS NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_earning_vendor_order_id_unique"
      ON "vendor_earning" ("vendor_order_id") WHERE "deleted_at" IS NULL`);

    console.log("[MARKETPLACE_REPAIR_TABLES_OK] All 4 tables created/verified");

    // ── Final verification ──────────────────────────────────────────────────
    const tables = ["vendor_order", "vendor_order_item", "vendor_order_activity", "vendor_earning"];
    let allOk = true;
    for (const t of tables) {
      const r = await client.query(`SELECT to_regclass('public.${t}') AS exists`);
      if (r.rows[0].exists) {
        console.log(`[MARKETPLACE_SCHEMA_TABLE_OK] ${t}`);
      } else {
        console.error(`[MARKETPLACE_SCHEMA_MISSING_TABLE] ${t} — repair failed!`);
        allOk = false;
      }
    }

    if (allOk) {
      console.log("[MARKETPLACE_SCHEMA_OK] Schema repair successful ✓");
    } else {
      console.error("[MARKETPLACE_SCHEMA_FAIL] Some tables could not be created. Check PostgreSQL logs.");
    }

    console.log("[MARKETPLACE_REPAIR_DONE]");
  } catch (err) {
    console.error("[MARKETPLACE_REPAIR_ERROR]", err.message);
    console.error(err.stack);
    throw err;
  } finally {
    await client.end();
  }
}

run().catch(() => process.exit(1));
