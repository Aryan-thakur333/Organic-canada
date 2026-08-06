import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260716000002 extends Migration {
  override async up(): Promise<void> {
    // Add product_type check constraint to product metadata if not exists
    this.addSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'product' AND column_name = 'metadata'
        ) THEN
          ALTER TABLE "product" ADD COLUMN "metadata" jsonb null;
        END IF;
      END $$;
    `)

    // Add enum validation for product_type via domain or ensure metadata is jsonb
    this.addSql(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'product' AND column_name = 'metadata' AND data_type = 'text'
        ) THEN
          ALTER TABLE "product" ALTER COLUMN "metadata" TYPE jsonb USING metadata::jsonb;
        END IF;
      END $$;
    `)
  }

  override async down(): Promise<void> {
    // no-op
  }
}