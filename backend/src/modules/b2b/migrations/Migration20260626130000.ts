import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260626130000 extends Migration {
  override async up(): Promise<void> {
    // ── Add new columns to company table ─────────────────────────────────
    this.addSql(`alter table "company" add column if not exists "customer_id" text null;`)
    this.addSql(`alter table "company" add column if not exists "requested_credit_limit" integer not null default 0;`)
    this.addSql(`alter table "company" add column if not exists "approved_credit_limit" integer not null default 0;`)
    this.addSql(`alter table "company" add column if not exists "approved_by" text null;`)
    this.addSql(`alter table "company" add column if not exists "approved_at" timestamptz null;`)
    this.addSql(`alter table "company" add column if not exists "rejected_at" timestamptz null;`)
    this.addSql(`alter table "company" add column if not exists "rejection_reason" text null;`)
    this.addSql(`alter table "company" add column if not exists "admin_note" text null;`)

    // ── Drop old status check constraint and recreate with new values ────
    this.addSql(`alter table "company" drop constraint if exists "company_status_check";`)
    this.addSql(
      `alter table "company" add constraint "company_status_check" ` +
      `check ("status" in ('pending', 'approved', 'rejected', 'active', 'inactive', 'suspended'));`
    )

    // ── Create index on customer_id for fast lookups ─────────────────────
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_company_customer_id" ON "company" ("customer_id") WHERE deleted_at IS NULL;`
    )

    // ── Create index on status for pending-company queries ───────────────
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_company_status_filter" ON "company" ("status") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "company" drop constraint if exists "company_status_check";`)
    this.addSql(
      `alter table "company" add constraint "company_status_check" ` +
      `check ("status" in ('active', 'inactive', 'suspended'));`
    )
    this.addSql(`alter table "company" drop column if exists "customer_id";`)
    this.addSql(`alter table "company" drop column if exists "requested_credit_limit";`)
    this.addSql(`alter table "company" drop column if exists "approved_credit_limit";`)
    this.addSql(`alter table "company" drop column if exists "approved_by";`)
    this.addSql(`alter table "company" drop column if exists "approved_at";`)
    this.addSql(`alter table "company" drop column if exists "rejected_at";`)
    this.addSql(`alter table "company" drop column if exists "rejection_reason";`)
    this.addSql(`alter table "company" drop column if exists "admin_note";`)
    this.addSql(`drop index if exists "IDX_company_customer_id";`)
    this.addSql(`drop index if exists "IDX_company_status_filter";`)
  }
}
