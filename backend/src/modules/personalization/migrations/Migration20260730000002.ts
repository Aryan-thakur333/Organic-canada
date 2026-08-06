import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260730000002 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "personalization_field" add column if not exists "price_adjustment_type" text not null default 'fixed';`)
    this.addSql(`alter table "personalization_asset" add column if not exists "owner_customer_id" text;`)
    this.addSql(`alter table "personalization_asset" add column if not exists "file_id" text;`)
    this.addSql(`alter table "personalization_asset" add column if not exists "status" text not null default 'uploaded';`)
    this.addSql(`alter table "personalization_asset" add column if not exists "original_filename" text;`)
    this.addSql(`alter table "personalization_asset" add column if not exists "width" integer;`)
    this.addSql(`alter table "personalization_asset" add column if not exists "height" integer;`)
    this.addSql(`create unique index if not exists "UIDX_personalization_asset_file_id" on "personalization_asset" ("file_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_personalization_asset_owner" on "personalization_asset" ("owner_customer_id") where deleted_at is null;`)
    for (const table of ["cart_item_personalization", "order_item_personalization"]) {
      this.addSql(`alter table "${table}" add column if not exists "template_snapshot" jsonb not null default '{}';`)
      this.addSql(`alter table "${table}" add column if not exists "upload_references" jsonb not null default '[]';`)
      this.addSql(`alter table "${table}" add column if not exists "status" text not null default 'pending_review';`)
    }
    this.addSql(`alter table "order_item_personalization" add column if not exists "production_notes" text;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "UIDX_personalization_asset_file_id";`)
    this.addSql(`drop index if exists "IDX_personalization_asset_owner";`)
    this.addSql(`alter table "order_item_personalization" drop column if exists "production_notes";`)
    for (const table of ["cart_item_personalization", "order_item_personalization"]) {
      this.addSql(`alter table "${table}" drop column if exists "status";`)
      this.addSql(`alter table "${table}" drop column if exists "upload_references";`)
      this.addSql(`alter table "${table}" drop column if exists "template_snapshot";`)
    }
    this.addSql(`alter table "personalization_asset" drop column if exists "height", drop column if exists "width", drop column if exists "original_filename", drop column if exists "status", drop column if exists "file_id", drop column if exists "owner_customer_id";`)
    this.addSql(`alter table "personalization_field" drop column if exists "price_adjustment_type";`)
  }
}
