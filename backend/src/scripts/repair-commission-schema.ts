import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const ACCOUNT_DEFAULTS = [
  ["commset_normal_customer", "normal_customer", "percentage", 10, true],
  ["commset_b2b_customer", "b2b_customer", "percentage", 10, true],
  ["commset_vendor", "vendor", "percentage", 8, true],
] as const

function rows(result: any) {
  return result?.rows || result || []
}

export default async function repairCommissionSchema({ container }: ExecArgs) {
  const connection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)

  console.log("[COMMISSION_REPAIR_START]")

  try {
    const dbResult = await connection.raw(`
      SELECT current_database() AS database, current_schema() AS schema, current_user AS "user"
    `)
    const db = rows(dbResult)[0] || {}
    console.log(`[COMMISSION_REPAIR_DATABASE] database=${db.database} schema=${db.schema} user=${db.user}`)

    await connection.raw(`
      CREATE TABLE IF NOT EXISTS "commission_setting" (
        "id" text NOT NULL,
        "account_type" text NOT NULL,
        "fee_type" text NOT NULL DEFAULT 'percentage',
        "fee_value" numeric NOT NULL DEFAULT 10,
        "is_active" boolean NOT NULL DEFAULT true,
        "metadata" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "commission_setting_pkey" PRIMARY KEY ("id")
      )
    `)

    await connection.raw(`ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "account_type" text`)
    await connection.raw(`ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "fee_type" text DEFAULT 'percentage'`)
    await connection.raw(`ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "fee_value" numeric DEFAULT 10`)
    await connection.raw(`ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true`)
    await connection.raw(`ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "metadata" jsonb NULL`)
    await connection.raw(`ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "created_at" timestamptz DEFAULT now()`)
    await connection.raw(`ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now()`)
    await connection.raw(`ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz NULL`)

    await connection.raw(`
      UPDATE "commission_setting"
      SET
        account_type = CASE id
          WHEN 'commset_normal_customer' THEN 'normal_customer'
          WHEN 'commset_b2b_customer' THEN 'b2b_customer'
          WHEN 'commset_vendor' THEN 'vendor'
          ELSE account_type
        END,
        fee_type = COALESCE(fee_type, 'percentage'),
        fee_value = COALESCE(fee_value, 10),
        is_active = COALESCE(is_active, true),
        created_at = COALESCE(created_at, now()),
        updated_at = COALESCE(updated_at, now())
      WHERE account_type IS NULL
      OR fee_type IS NULL
      OR fee_value IS NULL
      OR is_active IS NULL
      OR created_at IS NULL
      OR updated_at IS NULL
    `)

    await connection.raw(`
      WITH ranked AS (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY account_type
            ORDER BY deleted_at NULLS FIRST, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
          ) AS row_num
        FROM "commission_setting"
        WHERE account_type IS NOT NULL
        AND deleted_at IS NULL
      )
      UPDATE "commission_setting" setting
      SET deleted_at = now(), updated_at = now()
      FROM ranked
      WHERE setting.id = ranked.id
      AND ranked.row_num > 1
    `)

    await connection.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_commission_setting_account_type"
      ON "commission_setting" ("account_type")
      WHERE "deleted_at" IS NULL
    `)

    await connection.raw(`
      CREATE TABLE IF NOT EXISTS "commission_record" (
        "id" text NOT NULL,
        "order_id" text NULL,
        "account_type" text NOT NULL,
        "base_amount" bigint NOT NULL DEFAULT 0,
        "fee_type" text NOT NULL DEFAULT 'percentage',
        "fee_value" numeric NOT NULL DEFAULT 0,
        "commission_amount" bigint NOT NULL DEFAULT 0,
        "status" text NOT NULL DEFAULT 'pending',
        "metadata" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "commission_record_pkey" PRIMARY KEY ("id")
      )
    `)

    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "order_id" text NULL`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "customer_id" text NULL`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "vendor_id" text NULL`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "account_type" text`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "base_amount" bigint DEFAULT 0`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "fee_type" text DEFAULT 'percentage'`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "fee_value" numeric DEFAULT 0`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "commission_amount" bigint DEFAULT 0`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "vendor_payout" bigint NULL`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "currency_code" text DEFAULT 'cad'`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending'`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "adjusted_commission_amount" bigint NULL`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "adjustment_reason" text NULL`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "adjusted_at" timestamptz NULL`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "adjusted_by" text NULL`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "metadata" jsonb NULL`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "created_at" timestamptz DEFAULT now()`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now()`)
    await connection.raw(`ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz NULL`)

    await connection.raw(`
      UPDATE "commission_record"
      SET
        account_type = COALESCE(account_type, 'normal_customer'),
        base_amount = COALESCE(base_amount, 0),
        fee_type = COALESCE(fee_type, 'percentage'),
        fee_value = COALESCE(fee_value, 0),
        commission_amount = COALESCE(commission_amount, 0),
        currency_code = COALESCE(currency_code, 'cad'),
        status = COALESCE(status, 'pending'),
        created_at = COALESCE(created_at, now()),
        updated_at = COALESCE(updated_at, now())
      WHERE account_type IS NULL
      OR base_amount IS NULL
      OR fee_type IS NULL
      OR fee_value IS NULL
      OR commission_amount IS NULL
      OR currency_code IS NULL
      OR status IS NULL
      OR created_at IS NULL
      OR updated_at IS NULL
    `)

    await connection.raw(`CREATE INDEX IF NOT EXISTS "IDX_commission_record_account_type" ON "commission_record" ("account_type")`)
    await connection.raw(`CREATE INDEX IF NOT EXISTS "IDX_commission_record_order_id" ON "commission_record" ("order_id")`)
    await connection.raw(`CREATE INDEX IF NOT EXISTS "IDX_commission_record_status" ON "commission_record" ("status")`)

    console.log("[COMMISSION_REPAIR_TABLES_OK]")

    for (const [id, accountType, feeType, feeValue, isActive] of ACCOUNT_DEFAULTS) {
      await connection.raw(
        `
          INSERT INTO "commission_setting" (
            "id",
            "account_type",
            "fee_type",
            "fee_value",
            "is_active",
            "created_at",
            "updated_at"
          )
          SELECT ?, ?, ?, ?, ?, now(), now()
          WHERE NOT EXISTS (
            SELECT 1
            FROM "commission_setting"
            WHERE "account_type" = ?
            AND "deleted_at" IS NULL
          )
        `,
        [id, accountType, feeType, feeValue, isActive, accountType]
      )

      await connection.raw(
        `
          UPDATE "commission_setting"
          SET
            "fee_type" = COALESCE("fee_type", ?),
            "fee_value" = COALESCE("fee_value", ?),
            "is_active" = COALESCE("is_active", ?),
            "updated_at" = now()
          WHERE "account_type" = ?
          AND "deleted_at" IS NULL
        `,
        [feeType, feeValue, isActive, accountType]
      )
    }

    console.log("[COMMISSION_REPAIR_SEED_OK]")

    const verifyResult = await connection.raw(`
      SELECT
        to_regclass('public.commission_setting') AS commission_setting,
        to_regclass('public.commission_record') AS commission_record
    `)
    const verify = rows(verifyResult)[0] || {}
    if (!verify.commission_setting || !verify.commission_record) {
      throw new Error("Commission tables could not be verified after repair.")
    }

    console.log("[COMMISSION_REPAIR_DONE]")
  } catch (error: any) {
    console.error(`[COMMISSION_REPAIR_ERROR] ${error?.message || error}`)
    process.exit(1)
  }
}
