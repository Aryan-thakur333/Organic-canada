import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260730000003 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "bundle_item" ("id" text not null, "parent_product_id" text not null, "child_product_id" text not null, "quantity" integer not null default 1, "sort_order" integer not null default 0, "is_fulfillment_hidden" boolean not null default true, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bundle_item_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_bundle_item_parent_child_unique" on "bundle_item" ("parent_product_id", "child_product_id") where deleted_at is null;`)
    this.addSql(`create table if not exists "bundle_definition" ("id" text not null, "title" text not null, "handle" text not null, "status" text not null default 'draft', "bundle_type" text not null default 'fixed_bundle', "pricing_strategy" text not null default 'fixed_price', "inventory_strategy" text not null default 'components', "product_id" text not null, "variant_id" text not null, "sales_channel_ids" jsonb null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bundle_definition_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "UIDX_bundle_definition_handle" on "bundle_definition" ("handle") where deleted_at is null;`)
    this.addSql(`create unique index if not exists "UIDX_bundle_definition_product" on "bundle_definition" ("product_id") where deleted_at is null;`)
    this.addSql(`alter table "bundle_item" add column if not exists "bundle_id" text;`)
    this.addSql(`alter table "bundle_item" add column if not exists "variant_id" text;`)
    this.addSql(`alter table "bundle_item" add column if not exists "optional" boolean not null default false;`)
    this.addSql(`create unique index if not exists "UIDX_bundle_item_bundle_variant" on "bundle_item" ("bundle_id", "variant_id") where deleted_at is null and bundle_id is not null;`)
    this.addSql(`create table if not exists "bundle_line_snapshot" ("id" text not null, "cart_id" text null, "cart_line_item_id" text not null, "order_id" text null, "order_line_item_id" text null, "bundle_id" text not null, "component_snapshot" jsonb not null default '{}', "bundle_price_snapshot" jsonb not null default '{}', "reservation_ids" jsonb null, "reservation_status" text not null default 'none', "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bundle_line_snapshot_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "UIDX_bundle_snapshot_cart_line" on "bundle_line_snapshot" ("cart_line_item_id") where deleted_at is null;`)
    this.addSql(`create unique index if not exists "UIDX_bundle_snapshot_order_line" on "bundle_line_snapshot" ("order_line_item_id") where deleted_at is null and order_line_item_id is not null;`)
    this.addSql(`create index if not exists "IDX_bundle_snapshot_cart" on "bundle_line_snapshot" ("cart_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_bundle_snapshot_order" on "bundle_line_snapshot" ("order_id") where deleted_at is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bundle_line_snapshot" cascade;`)
    this.addSql(`drop table if exists "bundle_definition" cascade;`)
    this.addSql(`drop index if exists "UIDX_bundle_item_bundle_variant";`)
    this.addSql(`alter table "bundle_item" drop column if exists "optional", drop column if exists "variant_id", drop column if exists "bundle_id";`)
  }
}
