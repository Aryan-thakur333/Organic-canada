import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260716000004 extends Migration {
  override async up(): Promise<void> {
    // Make vendor_id nullable so admin can create product-level templates
    // without a vendor_id (non-vendor marketplace products).
    this.addSql(`ALTER TABLE "personalization_template" ALTER COLUMN "vendor_id" DROP NOT NULL;`)
  }

  override async down(): Promise<void> {
    // Backfill empty strings before re-adding NOT NULL
    this.addSql(`UPDATE "personalization_template" SET vendor_id = '' WHERE vendor_id IS NULL;`)
    this.addSql(`ALTER TABLE "personalization_template" ALTER COLUMN "vendor_id" SET NOT NULL;`)
  }
}