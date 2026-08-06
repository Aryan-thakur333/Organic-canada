import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260716000003 extends Migration {
  override async up(): Promise<void> {
    // personalization_template additions
    this.addSql(`ALTER TABLE "personalization_template" ADD COLUMN IF NOT EXISTS "vendor_id" text NOT NULL DEFAULT '';`)
    this.addSql(`ALTER TABLE "personalization_template" ADD COLUMN IF NOT EXISTS "title" text NOT NULL DEFAULT '';`)
    this.addSql(`ALTER TABLE "personalization_template" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT false;`)
    this.addSql(`ALTER TABLE "personalization_template" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;`)
    this.addSql(`ALTER TABLE "personalization_template" ADD COLUMN IF NOT EXISTS "schema_hash" text NULL;`)
    this.addSql(`ALTER TABLE "personalization_template" ADD COLUMN IF NOT EXISTS "published_at" timestamptz NULL;`)

    // personalization_field additions
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "min_length" integer NULL;`)
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "max_length" integer NULL;`)
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "min_value" numeric NULL;`)
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "max_value" numeric NULL;`)
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "allowed_values" jsonb NULL;`)
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "placeholder" text NULL;`)
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "help_text" text NULL;`)
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "price_adjustment" integer NOT NULL DEFAULT 0;`)
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;`)
    this.addSql(`ALTER TABLE "personalization_field" ADD COLUMN IF NOT EXISTS "validation_rules" jsonb NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "personalization_template" DROP COLUMN IF EXISTS "published_at";`)
    this.addSql(`ALTER TABLE "personalization_template" DROP COLUMN IF EXISTS "schema_hash";`)
    this.addSql(`ALTER TABLE "personalization_template" DROP COLUMN IF EXISTS "version";`)
    this.addSql(`ALTER TABLE "personalization_template" DROP COLUMN IF EXISTS "is_active";`)
    this.addSql(`ALTER TABLE "personalization_template" DROP COLUMN IF EXISTS "title";`)
    this.addSql(`ALTER TABLE "personalization_template" DROP COLUMN IF EXISTS "vendor_id";`)

    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "validation_rules";`)
    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "sort_order";`)
    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "price_adjustment";`)
    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "help_text";`)
    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "placeholder";`)
    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "allowed_values";`)
    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "max_value";`)
    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "min_value";`)
    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "max_length";`)
    this.addSql(`ALTER TABLE "personalization_field" DROP COLUMN IF EXISTS "min_length";`)
  }
}