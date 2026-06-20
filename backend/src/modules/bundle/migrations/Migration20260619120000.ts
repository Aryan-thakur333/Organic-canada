import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260619120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "bundle_item" ("id" text not null, "parent_product_id" text not null, "child_product_id" text not null, "quantity" integer not null default 1, "sort_order" integer not null default 0, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "bundle_item_pkey" primary key ("id"));`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bundle_item_parent_product_id" ON "bundle_item" ("parent_product_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bundle_item_child_product_id" ON "bundle_item" ("child_product_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_bundle_item_parent_child_unique" ON "bundle_item" ("parent_product_id", "child_product_id") WHERE deleted_at IS NULL;`)
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_bundle_item_deleted_at" ON "bundle_item" ("deleted_at") WHERE deleted_at IS NULL;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "bundle_item" cascade;`)
  }
}
