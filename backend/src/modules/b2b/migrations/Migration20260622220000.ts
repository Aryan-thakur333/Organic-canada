import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260622220000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "company" add column if not exists "contact_name" text null, add column if not exists "email" text null, add column if not exists "phone" text null, add column if not exists "address" jsonb null, add column if not exists "metadata" jsonb null;`)
    this.addSql(`alter table "b2b_quote" drop constraint if exists "b2b_quote_status_check";`)
    this.addSql(`alter table "b2b_quote" add column if not exists "customer_name" text null, add column if not exists "company_name" text null, add column if not exists "currency_code" text not null default 'cad', add column if not exists "discount_total" integer not null default 0, add column if not exists "total" integer null, add column if not exists "customer_note" text null, add column if not exists "expires_at" timestamptz null, add column if not exists "cart_id" text null, add column if not exists "draft_order_id" text null, add column if not exists "order_id" text null;`)
    this.addSql(`update "b2b_quote" set "total" = coalesce("negotiated_total", "subtotal"), "customer_note" = coalesce("customer_note", "metadata"->>'customer_notes'), "status" = case when "status" in ('draft','pending') then 'pending_review' when "status" = 'converted' then 'converted_to_order' else "status" end where "total" is null or "status" in ('draft','pending','converted');`)
    this.addSql(`alter table "b2b_quote" alter column "total" set not null;`)
    this.addSql(`alter table "b2b_quote" add constraint "b2b_quote_status_check" check ("status" in ('draft','pending','pending_review','approved','rejected','expired','converted','converted_to_order'));`)
    this.addSql(`create table if not exists "company_member" ("id" text not null, "company_id" text not null, "customer_id" text not null, "role" text not null default 'buyer', "status" text not null default 'active', "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "company_member_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_company_member_customer" on "company_member" ("company_id", "customer_id") where deleted_at is null;`)
  }
  override async down(): Promise<void> { this.addSql(`drop table if exists "company_member" cascade;`) }
}
