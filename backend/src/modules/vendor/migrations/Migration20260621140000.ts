import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260621140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "inventory_audit" (
        "id" text not null,
        "vendor_id" text not null,
        "variant_id" text null,
        "variant_title" text null,
        "product_title" text null,
        "sku" text null,
        "inventory_item_id" text null,
        "level_id" text not null,
        "previous_stocked_quantity" integer not null default 0,
        "new_stocked_quantity" integer not null default 0,
        "previous_reserved_quantity" integer not null default 0,
        "new_reserved_quantity" integer not null default 0,
        "change_type" text not null default 'manual_update'
          check ("change_type" in (
            'restock', 'adjustment', 'manual_update',
            'order_fulfillment', 'return', 'admin_correction'
          )),
        "source" text not null default 'vendor_dashboard'
          check ("source" in ('vendor_dashboard', 'admin_dashboard', 'system', 'api')),
        "actor_id" text null,
        "actor_type" text not null default 'vendor'
          check ("actor_type" in ('vendor', 'admin', 'system')),
        "notes" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "inventory_audit_pkey" primary key ("id")
      );
    `)
    this.addSql(`create index if not exists "IDX_inventory_audit_vendor_id" on "inventory_audit" ("vendor_id") where "deleted_at" is null;`)
    this.addSql(`create index if not exists "IDX_inventory_audit_level_id" on "inventory_audit" ("level_id") where "deleted_at" is null;`)
    this.addSql(`create index if not exists "IDX_inventory_audit_created_at" on "inventory_audit" ("created_at" desc) where "deleted_at" is null;`)
    this.addSql(`create index if not exists "IDX_inventory_audit_variant_id" on "inventory_audit" ("variant_id") where "deleted_at" is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "inventory_audit" cascade;`)
  }
}
