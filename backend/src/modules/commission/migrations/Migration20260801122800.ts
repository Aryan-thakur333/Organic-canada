import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260801122800 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "customer_id" text NULL;
      ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "vendor_id" text NULL;
      ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "vendor_payout" bigint NULL;
      ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "currency_code" text NOT NULL DEFAULT 'cad';
      ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "adjusted_commission_amount" bigint NULL;
      ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "adjustment_reason" text NULL;
      ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "adjusted_at" timestamptz NULL;
      ALTER TABLE "commission_record" ADD COLUMN IF NOT EXISTS "adjusted_by" text NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      ALTER TABLE "commission_record" DROP COLUMN IF EXISTS "adjusted_by";
      ALTER TABLE "commission_record" DROP COLUMN IF EXISTS "adjusted_at";
      ALTER TABLE "commission_record" DROP COLUMN IF EXISTS "adjustment_reason";
      ALTER TABLE "commission_record" DROP COLUMN IF EXISTS "adjusted_commission_amount";
      ALTER TABLE "commission_record" DROP COLUMN IF EXISTS "currency_code";
      ALTER TABLE "commission_record" DROP COLUMN IF EXISTS "vendor_payout";
      ALTER TABLE "commission_record" DROP COLUMN IF EXISTS "vendor_id";
      ALTER TABLE "commission_record" DROP COLUMN IF EXISTS "customer_id";
    `);
  }
}
