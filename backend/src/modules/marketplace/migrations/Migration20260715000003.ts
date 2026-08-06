import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260715000003 extends Migration {
  override async up(): Promise<void> {
    // ── vendor_order: Update status check constraint to include prepared ──
    this.addSql(`
      ALTER TABLE "vendor_order" 
      DROP CONSTRAINT IF EXISTS "vendor_order_status_check";
    `)

    this.addSql(`
      ALTER TABLE "vendor_order" 
      ADD CONSTRAINT "vendor_order_status_check" 
      CHECK ("status" IN (
        'pending','accepted','rejected','processing',
        'prepared','ready_to_ship',
        'shipped','delivered','cancelled'
      ));
    `)

    // ── vendor_order: Update fulfillment_status to include preparing ──
    this.addSql(`
      ALTER TABLE "vendor_order" 
      DROP CONSTRAINT IF EXISTS "vendor_order_fulfillment_status_check";
    `)

    this.addSql(`
      ALTER TABLE "vendor_order" 
      ADD CONSTRAINT "vendor_order_fulfillment_status_check" 
      CHECK ("fulfillment_status" IN (
        'not_fulfilled','allocated','preparing',
        'partially_fulfilled','fulfilled',
        'shipped','delivered','cancelled'
      ));
    `)

    // ── Add prepared_at column if not exists ──
    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'vendor_order' AND column_name = 'prepared_at'
        ) THEN
          ALTER TABLE "vendor_order" ADD COLUMN "prepared_at" timestamptz null;
        END IF;
      END $$;
    `)
  }

  override async down(): Promise<void> {
    // Restore previous status check (without prepared)
    this.addSql(`
      ALTER TABLE "vendor_order" 
      DROP CONSTRAINT IF EXISTS "vendor_order_status_check";
    `)

    this.addSql(`
      ALTER TABLE "vendor_order" 
      ADD CONSTRAINT "vendor_order_status_check" 
      CHECK ("status" IN (
        'pending','accepted','rejected','processing',
        'ready_to_ship','shipped','delivered','cancelled'
      ));
    `)

    // Restore previous fulfillment_status check (without preparing)
    this.addSql(`
      ALTER TABLE "vendor_order" 
      DROP CONSTRAINT IF EXISTS "vendor_order_fulfillment_status_check";
    `)

    this.addSql(`
      ALTER TABLE "vendor_order" 
      ADD CONSTRAINT "vendor_order_fulfillment_status_check" 
      CHECK ("fulfillment_status" IN (
        'not_fulfilled','allocated','partially_fulfilled',
        'fulfilled','shipped','delivered','cancelled'
      ));
    `)
  }
}