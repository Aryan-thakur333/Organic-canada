import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260709120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "b2b_quote" add column if not exists "order_change_id" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "requested_by" text null;`)

    this.addSql(`alter table "b2b_quote" drop constraint if exists "b2b_quote_status_check";`)
    this.addSql(
      `alter table "b2b_quote" add constraint "b2b_quote_status_check" check ("status" in (` +
        `'pending_merchant', 'pending_customer', 'accepted', 'customer_rejected', 'merchant_rejected', ` +
        `'draft', 'pending', 'pending_review', 'approved', 'rejected', 'expired', 'converted', 'converted_to_cart', 'converted_to_order'` +
        `));`
    )

    this.addSql(`create index if not exists "IDX_b2b_quote_cart_id_recipe" on "b2b_quote" ("cart_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_b2b_quote_draft_order_id" on "b2b_quote" ("draft_order_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_b2b_quote_order_change_id" on "b2b_quote" ("order_change_id") where deleted_at is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_b2b_quote_order_change_id";`)
    this.addSql(`drop index if exists "IDX_b2b_quote_draft_order_id";`)
    this.addSql(`drop index if exists "IDX_b2b_quote_cart_id_recipe";`)
    this.addSql(`alter table "b2b_quote" drop constraint if exists "b2b_quote_status_check";`)
    this.addSql(
      `alter table "b2b_quote" add constraint "b2b_quote_status_check" check ("status" in (` +
        `'draft', 'pending_review', 'approved', 'rejected', 'expired', 'accepted', 'converted_to_cart', 'converted_to_order'` +
        `));`
    )
    this.addSql(`alter table "b2b_quote" drop column if exists "requested_by";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "order_change_id";`)
  }
}
