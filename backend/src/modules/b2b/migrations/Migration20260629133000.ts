import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260629133000 extends Migration {
  override async up(): Promise<void> {
    // ── Add new columns to b2b_quote table ────────────────────────────────
    this.addSql(`alter table "b2b_quote" add column if not exists "company_id" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "requested_items" jsonb null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "requested_total" integer not null default 0;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "negotiated_items" jsonb null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "negotiated_total" integer null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "buyer_note" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "admin_note" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "rejection_reason" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "accepted_at" timestamptz null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "rejected_at" timestamptz null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "created_cart_id" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "created_order_id" text null;`)

    // ── Drop old status check constraint and recreate with new values ────
    this.addSql(`alter table "b2b_quote" drop constraint if exists "b2b_quote_status_check";`)
    this.addSql(
      `alter table "b2b_quote" add constraint "b2b_quote_status_check" ` +
      `check ("status" in ('draft', 'pending_review', 'approved', 'rejected', 'expired', 'accepted', 'converted_to_cart', 'converted_to_order'));`
    )

    // ── Create indexes for fast lookups ──────────────────────────────────
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_b2b_quote_customer_id" ON "b2b_quote" ("customer_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_b2b_quote_company_id" ON "b2b_quote" ("company_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_b2b_quote_status_filter" ON "b2b_quote" ("status") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_b2b_quote_cart_id" ON "b2b_quote" ("created_cart_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_b2b_quote_customer_email" ON "b2b_quote" ("customer_email") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "b2b_quote" drop constraint if exists "b2b_quote_status_check";`)
    this.addSql(
      `alter table "b2b_quote" add constraint "b2b_quote_status_check" ` +
      `check ("status" in ('draft', 'pending', 'pending_review', 'approved', 'rejected', 'expired', 'converted', 'converted_to_order'));`
    )
    this.addSql(`alter table "b2b_quote" drop column if exists "company_id";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "requested_items";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "requested_total";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "negotiated_items";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "negotiated_total";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "buyer_note";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "admin_note";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "rejection_reason";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "accepted_at";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "rejected_at";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "created_cart_id";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "created_order_id";`)
    this.addSql(`drop index if exists "IDX_b2b_quote_customer_id";`)
    this.addSql(`drop index if exists "IDX_b2b_quote_company_id";`)
    this.addSql(`drop index if exists "IDX_b2b_quote_status_filter";`)
    this.addSql(`drop index if exists "IDX_b2b_quote_cart_id";`)
    this.addSql(`drop index if exists "IDX_b2b_quote_customer_email";`)
  }
}