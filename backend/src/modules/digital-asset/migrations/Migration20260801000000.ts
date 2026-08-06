import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Initial migration for the digital-asset module.
 *
 * These tables previously existed only in production because they were created
 * manually (see the historical test-digital-product-flow.mjs DDL). This migration
 * makes fresh databases (including integration-test databases) provision them
 * via the standard `medusa db:migrate` pipeline.
 */
export class Migration20260801000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "digital_asset" (` +
        `"id" text not null, ` +
        `"product_id" text not null, ` +
        `"secure_s3_key" text not null, ` +
        `"file_name" text not null, ` +
        `"mime_type" text not null default 'application/octet-stream', ` +
        `"file_size" integer not null default 0, ` +
        `"version" text null, ` +
        `"is_primary" boolean not null default false, ` +
        `"sort_order" integer not null default 0, ` +
        `"download_limit" integer not null default 0, ` +
        `"download_count" integer not null default 0, ` +
        `"is_active" boolean not null default true, ` +
        `"metadata" jsonb null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "digital_asset_pkey" primary key ("id")` +
        `);`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_digital_asset_product_id" ON "digital_asset" ("product_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_digital_asset_is_active" ON "digital_asset" ("is_active") WHERE deleted_at IS NULL;`
    )

    this.addSql(
      `create table if not exists "digital_order_download" (` +
        `"id" text not null, ` +
        `"order_id" text not null, ` +
        `"line_item_id" text null, ` +
        `"product_id" text not null, ` +
        `"customer_id" text not null, ` +
        `"digital_asset_id" text null, ` +
        `"license_key" text null, ` +
        `"remaining_downloads" integer not null default 0, ` +
        `"download_count" integer not null default 0, ` +
        `"expires_at" timestamptz null, ` +
        `"last_downloaded_at" timestamptz null, ` +
        `"is_active" boolean not null default true, ` +
        `"metadata" jsonb null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "digital_order_download_pkey" primary key ("id")` +
        `);`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_digital_order_download_order_id" ON "digital_order_download" ("order_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_digital_order_download_customer_id" ON "digital_order_download" ("customer_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_digital_order_download_product_id" ON "digital_order_download" ("product_id") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "digital_order_download" cascade;`)
    this.addSql(`drop table if exists "digital_asset" cascade;`)
  }
}
