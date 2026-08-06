import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * The timestamp is globally unique across Medusa modules. A prior bundle
 * migration reused the personalization migration ID, which made Medusa mark
 * it as already applied without executing this module's schema changes.
 */
export class Migration20260730110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "bundle_line_snapshot" add column if not exists "bundle_group_id" text null;`)
    this.addSql(`alter table "bundle_line_snapshot" add column if not exists "status" text not null default 'pending';`)
    this.addSql(`alter table "bundle_line_snapshot" alter column "cart_line_item_id" drop not null;`)
    this.addSql(`update "bundle_line_snapshot" set "bundle_group_id" = metadata->>'bundle_group_id' where "bundle_group_id" is null and metadata ? 'bundle_group_id';`)
    this.addSql(`update "bundle_line_snapshot" set "status" = case when "order_id" is not null then 'converted' else 'active' end where "status" = 'pending' and "bundle_group_id" is not null;`)
    this.addSql(`create index if not exists "IDX_bundle_snapshot_cart_group_active" on "bundle_line_snapshot" ("cart_id", "bundle_group_id", "status") where deleted_at is null;`)
    this.addSql(`create unique index if not exists "UIDX_bundle_snapshot_cart_group" on "bundle_line_snapshot" ("cart_id", "bundle_group_id") where deleted_at is null and "bundle_group_id" is not null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "UIDX_bundle_snapshot_cart_group";`)
    this.addSql(`drop index if exists "IDX_bundle_snapshot_cart_group_active";`)
    this.addSql(`alter table "bundle_line_snapshot" drop column if exists "status", drop column if exists "bundle_group_id";`)
  }
}
