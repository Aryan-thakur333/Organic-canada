import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260716000001 extends Migration {
  override async up(): Promise<void> {
    // personalization_template
    this.addSql(`create table if not exists "personalization_template" ("id" text not null, "product_id" text not null, "variant_id" text null, "name" text not null, "description" text null, "is_required" boolean not null default false, "requires_vendor_approval" boolean not null default false, "requires_production" boolean not null default false, "status" text not null default 'draft', "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "personalization_template_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_personalization_template_product_id" ON "personalization_template" ("product_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_personalization_template_status" ON "personalization_template" ("status") WHERE deleted_at IS NULL;`)

    // personalization_field
    this.addSql(`create table if not exists "personalization_field" ("id" text not null, "template_id" text not null, "key" text not null, "label" text not null, "type" text not null default 'text', "is_required" boolean not null default false, "sort_order" integer not null default 0, "validation" jsonb null, "options" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "personalization_field_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_personalization_field_template_id" ON "personalization_field" ("template_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_personalization_field_key" ON "personalization_field" ("key") WHERE deleted_at IS NULL;`)

    // cart_item_personalization
    this.addSql(`create table if not exists "cart_item_personalization" ("id" text not null, "cart_id" text not null, "cart_item_id" text not null, "item_id" text null, "template_id" text not null, "product_id" text not null, "variant_id" text null, "values" jsonb not null default '{}', "price_adjustment" integer not null default 0, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cart_item_personalization_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cart_item_personalization_cart_id" ON "cart_item_personalization" ("cart_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cart_item_personalization_cart_item_id" ON "cart_item_personalization" ("cart_item_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cart_item_personalization_template_id" ON "cart_item_personalization" ("template_id") WHERE deleted_at IS NULL;`)

    // order_item_personalization
    this.addSql(`create table if not exists "order_item_personalization" ("id" text not null, "order_id" text not null, "order_item_id" text not null, "item_id" text null, "template_id" text not null, "product_id" text not null, "variant_id" text null, "values" jsonb not null default '{}', "price_adjustment" integer not null default 0, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "order_item_personalization_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_item_personalization_order_id" ON "order_item_personalization" ("order_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_item_personalization_order_item_id" ON "order_item_personalization" ("order_item_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_order_item_personalization_template_id" ON "order_item_personalization" ("template_id") WHERE deleted_at IS NULL;`)

    // personalization_asset
    this.addSql(`create table if not exists "personalization_asset" ("id" text not null, "template_id" text not null, "field_id" text null, "type" text not null default 'file', "url" text null, "path" text null, "size_bytes" integer null, "mime_type" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "personalization_asset_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_personalization_asset_template_id" ON "personalization_asset" ("template_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_personalization_asset_field_id" ON "personalization_asset" ("field_id") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "personalization_asset" cascade;`)
    this.addSql(`drop table if exists "order_item_personalization" cascade;`)
    this.addSql(`drop table if exists "cart_item_personalization" cascade;`)
    this.addSql(`drop table if exists "personalization_field" cascade;`)
    this.addSql(`drop table if exists "personalization_template" cascade;`)
  }
}