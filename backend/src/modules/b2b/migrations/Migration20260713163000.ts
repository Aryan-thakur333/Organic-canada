import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260713163000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "b2b_quote" add column if not exists "original_total" bigint null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "negotiated_total" bigint null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "quote_adjustment_total" bigint null default 0;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "payment_state" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "payment_terms" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "payment_due_date" timestamptz null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "offer_version" integer null default 1;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "expires_at" timestamptz null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "accepted_at" timestamptz null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "paid_at" timestamptz null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "settlement_mode" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "payment_reference" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "payment_collection_id" text null;`)
    this.addSql(`alter table "b2b_quote" add column if not exists "selected_payment_provider_id" text null;`)

    this.addSql(`alter table "b2b_quote" alter column "original_total" drop not null;`)
    this.addSql(`alter table "b2b_quote" alter column "original_total" type bigint using "original_total"::bigint;`)
    this.addSql(`alter table "b2b_quote" alter column "negotiated_total" type bigint using "negotiated_total"::bigint;`)
    this.addSql(`alter table "b2b_quote" alter column "quote_adjustment_total" drop not null;`)
    this.addSql(`alter table "b2b_quote" alter column "quote_adjustment_total" type bigint using "quote_adjustment_total"::bigint;`)
    this.addSql(`alter table "b2b_quote" alter column "payment_state" drop not null;`)
    this.addSql(`alter table "b2b_quote" alter column "offer_version" drop not null;`)

    this.addSql(`alter table "b2b_quote" drop constraint if exists "b2b_quote_payment_state_check";`)
    this.addSql(
      `alter table "b2b_quote" add constraint "b2b_quote_payment_state_check" check ("payment_state" is null or "payment_state" in (` +
        `'not_required', 'payment_required', 'awaiting_remittance', 'processing', 'paid', 'failed', 'canceled'` +
        `));`
    )
    this.addSql(`create index if not exists "IDX_b2b_quote_payment_state" on "b2b_quote" ("payment_state") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_b2b_quote_payment_collection_id" on "b2b_quote" ("payment_collection_id") where deleted_at is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_b2b_quote_payment_collection_id";`)
    this.addSql(`drop index if exists "IDX_b2b_quote_payment_state";`)
    this.addSql(`alter table "b2b_quote" drop constraint if exists "b2b_quote_payment_state_check";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "selected_payment_provider_id";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "payment_collection_id";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "payment_reference";`)
    this.addSql(`alter table "b2b_quote" drop column if exists "settlement_mode";`)
  }
}
