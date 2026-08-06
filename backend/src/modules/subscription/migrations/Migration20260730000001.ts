import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260730000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "subscription" add column if not exists "idempotency_key" text null;`)
    this.addSql(`alter table "subscription" add column if not exists "input_fingerprint" text null;`)
    this.addSql(`alter table "subscription" add column if not exists "interval_count" integer not null default 1;`)
    this.addSql(`alter table "subscription" add column if not exists "region_id_reference" text null;`)
    this.addSql(`alter table "subscription" add column if not exists "sales_channel_id_reference" text null;`)
    this.addSql(`alter table "subscription" add column if not exists "shipping_address_snapshot" jsonb null;`)
    this.addSql(`alter table "subscription" add column if not exists "billing_address_snapshot" jsonb null;`)
    this.addSql(`alter table "subscription" add column if not exists "payment_provider" text not null default 'stripe_billing';`)
    this.addSql(`alter table "subscription" add column if not exists "current_period_start" timestamptz null;`)
    this.addSql(`alter table "subscription" add column if not exists "current_period_end" timestamptz null;`)
    this.addSql(`alter table "subscription" add column if not exists "cancelled_at" timestamptz null;`)
    this.addSql(`alter table "subscription" add column if not exists "paused_at" timestamptz null;`)
    this.addSql(`alter table "subscription" drop constraint if exists "subscription_status_check";`)
    this.addSql(`alter table "subscription" add constraint "subscription_status_check" check ("status" in ('draft','active','trialing','past_due','paused','cancelled','expired'));`)

    this.addSql(`create unique index if not exists "UIDX_subscription_customer_idempotency" on "subscription" ("customer_id", "idempotency_key") where "deleted_at" is null and "idempotency_key" is not null;`)
    this.addSql(`create unique index if not exists "UIDX_subscription_provider_subscription" on "subscription" ("stripe_subscription_id") where "deleted_at" is null and "stripe_subscription_id" is not null;`)
    this.addSql(`create index if not exists "IDX_subscription_due" on "subscription" ("status", "next_billing_date") where "deleted_at" is null;`)

    this.addSql(`create table if not exists "subscription_item" (
      "id" text primary key, "subscription_id" text not null, "variant_id_reference" text not null,
      "product_id_reference" text null, "quantity" integer not null, "unit_price_snapshot" integer not null,
      "title_snapshot" text not null, "variant_title_snapshot" text null, "metadata" jsonb null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null
    );`)
    this.addSql(`create index if not exists "IDX_subscription_item_subscription" on "subscription_item" ("subscription_id") where "deleted_at" is null;`)

    this.addSql(`create table if not exists "subscription_billing_order" (
      "id" text primary key, "subscription_id" text not null, "order_id_reference" text null,
      "billing_period_key" text not null, "provider_payment_reference" text null,
      "status" text not null default 'pending' check ("status" in ('pending','paid','order_created','failed')),
      "error_code" text null, "metadata" jsonb null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null
    );`)
    this.addSql(`create unique index if not exists "UIDX_subscription_order_period" on "subscription_billing_order" ("subscription_id", "billing_period_key") where "deleted_at" is null;`)
    this.addSql(`create unique index if not exists "UIDX_subscription_order_order" on "subscription_billing_order" ("order_id_reference") where "deleted_at" is null and "order_id_reference" is not null;`)

    this.addSql(`create table if not exists "subscription_provider_event" (
      "id" text primary key, "provider" text not null, "provider_event_id" text not null, "event_type" text not null,
      "status" text not null default 'processing' check ("status" in ('processing','processed','failed')),
      "error_code" text null, "processed_at" timestamptz null, "metadata" jsonb null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null
    );`)
    this.addSql(`create unique index if not exists "UIDX_subscription_provider_event" on "subscription_provider_event" ("provider", "provider_event_id") where "deleted_at" is null;`)

    this.addSql(`create table if not exists "subscription_product_configuration" (
      "id" text primary key, "product_id_reference" text not null, "variant_id_reference" text null,
      "enabled" boolean not null default false, "allowed_intervals" jsonb not null default '[]'::jsonb,
      "minimum_periods" integer not null default 1, "maximum_periods" integer null,
      "discount_type" text not null default 'none' check ("discount_type" in ('none','percentage','fixed')),
      "discount_value" integer not null default 0, "one_time_purchase_allowed" boolean not null default true,
      "cancellation_policy" text null, "pause_allowed" boolean not null default true, "trial_period_days" integer not null default 0,
      "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null
    );`)
    this.addSql(`create unique index if not exists "UIDX_subscription_config_product_variant" on "subscription_product_configuration" ("product_id_reference", coalesce("variant_id_reference", '')) where "deleted_at" is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "subscription_provider_event" cascade;`)
    this.addSql(`drop table if exists "subscription_billing_order" cascade;`)
    this.addSql(`drop table if exists "subscription_item" cascade;`)
    this.addSql(`drop table if exists "subscription_product_configuration" cascade;`)
    this.addSql(`drop index if exists "UIDX_subscription_provider_subscription";`)
    this.addSql(`drop index if exists "UIDX_subscription_customer_idempotency";`)
    this.addSql(`drop index if exists "IDX_subscription_due";`)
    this.addSql(`alter table "subscription" drop column if exists "paused_at", drop column if exists "cancelled_at", drop column if exists "current_period_end", drop column if exists "current_period_start", drop column if exists "payment_provider", drop column if exists "billing_address_snapshot", drop column if exists "shipping_address_snapshot", drop column if exists "sales_channel_id_reference", drop column if exists "region_id_reference", drop column if exists "interval_count", drop column if exists "input_fingerprint", drop column if exists "idempotency_key";`)
  }
}
