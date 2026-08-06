import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260728000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "oms_order" (
      "id" text not null, "order_id" text not null, "display_id" integer null,
      "region_id" text null, "currency_code" text null, "customer_id" text null,
      "sales_channel_id" text null, "oms_status" text not null default 'PENDING',
      "payment_status" text not null default 'NOT_PAID', "fulfillment_status" text not null default 'NOT_FULFILLED',
      "total" bigint not null default 0, "metadata" jsonb null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null,
      constraint "oms_order_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_oms_order_order_id_unique" on "oms_order" ("order_id") where "deleted_at" is null;`)
    this.addSql(`create index if not exists "IDX_oms_order_filters" on "oms_order" ("oms_status", "region_id", "currency_code", "created_at") where "deleted_at" is null;`)
    this.addSql(`create index if not exists "IDX_oms_order_customer_id" on "oms_order" ("customer_id") where "deleted_at" is null;`)

    this.addSql(`create table if not exists "oms_vendor_order" (
      "id" text not null, "oms_order_id" text not null references "oms_order"("id"), "order_id" text not null,
      "vendor_id" text not null, "vendor_order_reference" text not null, "status" text not null default 'PENDING',
      "fulfillment_status" text not null default 'NOT_FULFILLED', "item_total" bigint not null default 0,
      "currency_code" text not null, "assigned_location_id" text null, "metadata" jsonb null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null,
      constraint "oms_vendor_order_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_oms_vendor_order_unique" on "oms_vendor_order" ("oms_order_id", "vendor_id") where "deleted_at" is null;`)
    this.addSql(`create index if not exists "IDX_oms_vendor_order_vendor" on "oms_vendor_order" ("vendor_id", "status", "created_at") where "deleted_at" is null;`)

    this.addSql(`create table if not exists "oms_order_group" (
      "id" text not null, "oms_order_id" text not null references "oms_order"("id"), "group_type" text not null,
      "reference" text not null, "metadata" jsonb null, "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "oms_order_group_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_oms_order_group_unique" on "oms_order_group" ("oms_order_id", "group_type", "reference") where "deleted_at" is null;`)

    this.addSql(`create table if not exists "oms_order_event" (
      "id" text not null, "oms_order_id" text not null references "oms_order"("id"), "vendor_order_id" text null,
      "event_type" text not null, "previous_status" text null, "new_status" text null, "actor_type" text not null,
      "actor_id" text null, "message" text not null, "metadata" jsonb null, "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "oms_order_event_pkey" primary key ("id"));`)
    this.addSql(`create index if not exists "IDX_oms_order_event_timeline" on "oms_order_event" ("oms_order_id", "created_at");`)
    this.addSql(`create or replace function reject_oms_event_mutation() returns trigger as $$ begin raise exception 'OMS order events are append-only'; end; $$ language plpgsql;`)
    this.addSql(`drop trigger if exists "TRG_oms_order_event_append_only" on "oms_order_event";`)
    this.addSql(`create trigger "TRG_oms_order_event_append_only" before update or delete on "oms_order_event" for each row execute function reject_oms_event_mutation();`)

    this.addSql(`create table if not exists "oms_fulfillment_assignment" (
      "id" text not null, "oms_order_id" text not null references "oms_order"("id"), "vendor_order_id" text not null,
      "stock_location_id" text not null, "status" text not null default 'ASSIGNED', "region_id" text null,
      "sales_channel_id" text null, "reservation_ids" jsonb null, "metadata" jsonb null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null,
      constraint "oms_fulfillment_assignment_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_oms_assignment_vendor_unique" on "oms_fulfillment_assignment" ("vendor_order_id") where "deleted_at" is null;`)

    for (const table of ["oms_cancellation_request", "oms_return_request"]) {
      const extra = table === "oms_return_request" ? `"items" jsonb null,` : `"reviewed_by_id" text null,`
      this.addSql(`create table if not exists "${table}" (
        "id" text not null, "oms_order_id" text not null references "oms_order"("id"), "vendor_order_id" text null,
        "status" text not null default 'REQUESTED', "reason" text null, "requested_by_type" text not null,
        "requested_by_id" text null, ${extra} "metadata" jsonb null, "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "${table}_pkey" primary key ("id"));`)
      this.addSql(`create index if not exists "IDX_${table}_order" on "${table}" ("oms_order_id", "created_at") where "deleted_at" is null;`)
    }
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "oms_return_request" cascade;`)
    this.addSql(`drop table if exists "oms_cancellation_request" cascade;`)
    this.addSql(`drop table if exists "oms_fulfillment_assignment" cascade;`)
    this.addSql(`drop table if exists "oms_order_event" cascade;`)
    this.addSql(`drop function if exists reject_oms_event_mutation();`)
    this.addSql(`drop table if exists "oms_order_group" cascade;`)
    this.addSql(`drop table if exists "oms_vendor_order" cascade;`)
    this.addSql(`drop table if exists "oms_order" cascade;`)
  }
}
