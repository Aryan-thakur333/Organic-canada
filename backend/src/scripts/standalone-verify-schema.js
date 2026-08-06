const { Client } = require("pg");
const dotenv = require("dotenv");
const path = require("path");

// Load .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const REQUIRED_TABLES = [
  "vendor_order",
  "vendor_order_item",
  "vendor_order_activity",
  "vendor_earning",
];

const REQUIRED_COLUMNS = {
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
};

async function run() {
  console.log("[MARKETPLACE_SCHEMA_VERIFY] Starting schema verification...");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("[MARKETPLACE_SCHEMA_ERROR] DATABASE_URL not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const dbContext = await client.query("SELECT current_database() as db, current_schema() as schema, current_user as user");
    console.log(`[MARKETPLACE_SCHEMA_DATABASE] ${dbContext.rows[0].db} (Schema: ${dbContext.rows[0].schema}, User: ${dbContext.rows[0].user})`);

    let allOk = true;

    for (const table of REQUIRED_TABLES) {
      const tableCheck = await client.query(
        `SELECT to_regclass('public.${table}') AS exists`
      );
      const exists = tableCheck.rows[0].exists !== null;

      if (exists) {
        console.log(`[MARKETPLACE_SCHEMA_TABLE_OK] ${table}`);
      } else {
        console.error(`[MARKETPLACE_SCHEMA_MISSING_TABLE] ${table}`);
        allOk = false;
        continue;
      }

      const colResult = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      const existingCols = new Set(colResult.rows.map(r => r.column_name));

      for (const col of REQUIRED_COLUMNS[table] || []) {
        if (!existingCols.has(col)) {
          console.error(`[MARKETPLACE_SCHEMA_MISSING_COLUMN] ${table}.${col}`);
          allOk = false;
        }
      }
    }

    if (allOk) {
      console.log("[MARKETPLACE_SCHEMA_OK] All required tables and columns verified ✓");
    } else {
      console.error(
        "[MARKETPLACE_SCHEMA_FAIL] Schema is incomplete.\n" +
        "→ Run: node ./src/scripts/standalone-repair-schema.js"
      );
    }

  } finally {
    await client.end();
  }
}

run().catch(console.error);
