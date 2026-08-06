import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260715000001 extends Migration {
  override async up(): Promise<void> {
    // ── vendor_order ────────────────────────────────────────────────────────
    this.addSql(`
      create table if not exists "vendor_order" (
        "id"                  text        not null,
        "vendor_id"           text        not null,
        "order_id"            text        not null,
        "display_id"          integer     null,
        "status"              text        not null default 'pending'
          check ("status" in (
            'pending','accepted','rejected','processing',
            'ready_to_ship','shipped','delivered','cancelled'
          )),
        "payment_status"      text        not null default 'awaiting_payment'
          check ("payment_status" in (
            'awaiting_payment','captured','refunded','partially_refunded'
          )),
        "fulfillment_status"  text        not null default 'not_fulfilled'
          check ("fulfillment_status" in (
            'not_fulfilled','allocated','partially_fulfilled',
            'fulfilled','shipped','delivered','cancelled'
          )),
        "currency_code"       text        not null default 'cad',
        "item_subtotal"       bigint      not null default 0,
        "shipping_total"      bigint      not null default 0,
        "tax_total"           bigint      not null default 0,
        "discount_total"      bigint      not null default 0,
        "commission_total"    bigint      not null default 0,
        "vendor_net_total"    bigint      not null default 0,
        "accepted_at"         timestamptz null,
        "rejected_at"         timestamptz null,
        "rejection_reason"    text        null,
        "processing_at"       timestamptz null,
        "shipped_at"          timestamptz null,
        "delivered_at"        timestamptz null,
        "cancelled_at"        timestamptz null,
        "metadata"            jsonb       null,
        "created_at"          timestamptz not null default now(),
        "updated_at"          timestamptz not null default now(),
        "deleted_at"          timestamptz null,
        constraint "vendor_order_pkey" primary key ("id")
      );
    `)

    this.addSql(`create index if not exists "IDX_vendor_order_vendor_id"
      on "vendor_order" ("vendor_id") where "deleted_at" is null;`)

    this.addSql(`create index if not exists "IDX_vendor_order_order_id"
      on "vendor_order" ("order_id") where "deleted_at" is null;`)

    this.addSql(`create index if not exists "IDX_vendor_order_status"
      on "vendor_order" ("status") where "deleted_at" is null;`)

    this.addSql(`create index if not exists "IDX_vendor_order_created_at"
      on "vendor_order" ("created_at" desc) where "deleted_at" is null;`)

    // Unique: one active VendorOrder per order + vendor
    this.addSql(`create unique index if not exists "IDX_vendor_order_order_vendor_unique"
      on "vendor_order" ("order_id", "vendor_id") where "deleted_at" is null;`)

    // ── vendor_order_item ────────────────────────────────────────────────────
    this.addSql(`
      create table if not exists "vendor_order_item" (
        "id"                text        not null,
        "vendor_order_id"   text        not null
          references "vendor_order" ("id") on delete cascade,
        "vendor_id"         text        not null,
        "order_id"          text        not null,
        "order_item_id"     text        null,
        "line_item_id"      text        null,
        "product_id"        text        null,
        "variant_id"        text        null,
        "title"             text        not null,
        "sku"               text        null,
        "quantity"          integer     not null default 1,
        "unit_price"        bigint      not null default 0,
        "subtotal"          bigint      not null default 0,
        "commission_amount" bigint      not null default 0,
        "vendor_net_amount" bigint      not null default 0,
        "requires_shipping" boolean     not null default true,
        "inventory_item_id" text        null,
        "metadata"          jsonb       null,
        "created_at"        timestamptz not null default now(),
        "updated_at"        timestamptz not null default now(),
        "deleted_at"        timestamptz null,
        constraint "vendor_order_item_pkey" primary key ("id")
      );
    `)

    this.addSql(`create index if not exists "IDX_vendor_order_item_vendor_order_id"
      on "vendor_order_item" ("vendor_order_id") where "deleted_at" is null;`)

    this.addSql(`create index if not exists "IDX_vendor_order_item_vendor_id"
      on "vendor_order_item" ("vendor_id") where "deleted_at" is null;`)

    this.addSql(`create index if not exists "IDX_vendor_order_item_line_item_id"
      on "vendor_order_item" ("line_item_id") where "deleted_at" is null;`)

    // ── vendor_order_activity ────────────────────────────────────────────────
    this.addSql(`
      create table if not exists "vendor_order_activity" (
        "id"              text        not null,
        "vendor_order_id" text        not null
          references "vendor_order" ("id") on delete cascade,
        "vendor_id"       text        not null,
        "type"            text        not null
          check ("type" in (
            'order_received','order_accepted','order_rejected',
            'inventory_allocated','processing_started','fulfillment_created',
            'shipment_created','tracking_updated','delivered',
            'admin_note','customer_cancellation_requested'
          )),
        "title"           text        not null,
        "description"     text        null,
        "actor_type"      text        not null default 'system'
          check ("actor_type" in ('system','vendor','admin','customer')),
        "actor_id"        text        null,
        "metadata"        jsonb       null,
        "created_at"      timestamptz not null default now(),
        "updated_at"      timestamptz not null default now(),
        "deleted_at"      timestamptz null,
        constraint "vendor_order_activity_pkey" primary key ("id")
      );
    `)

    this.addSql(`create index if not exists "IDX_vendor_order_activity_vendor_order_id"
      on "vendor_order_activity" ("vendor_order_id") where "deleted_at" is null;`)

    this.addSql(`create index if not exists "IDX_vendor_order_activity_created_at"
      on "vendor_order_activity" ("created_at" desc) where "deleted_at" is null;`)

    // ── vendor_earning ───────────────────────────────────────────────────────
    this.addSql(`
      create table if not exists "vendor_earning" (
        "id"                text        not null,
        "vendor_id"         text        not null,
        "vendor_order_id"   text        not null
          references "vendor_order" ("id") on delete cascade,
        "order_id"          text        not null,
        "gross_amount"      bigint      not null default 0,
        "commission_amount" bigint      not null default 0,
        "net_amount"        bigint      not null default 0,
        "status"            text        not null default 'pending'
          check ("status" in ('pending','locked','available','paid','reversed')),
        "available_at"      timestamptz null,
        "paid_at"           timestamptz null,
        "payout_reference"  text        null,
        "metadata"          jsonb       null,
        "created_at"        timestamptz not null default now(),
        "updated_at"        timestamptz not null default now(),
        "deleted_at"        timestamptz null,
        constraint "vendor_earning_pkey" primary key ("id")
      );
    `)

    this.addSql(`create index if not exists "IDX_vendor_earning_vendor_id"
      on "vendor_earning" ("vendor_id") where "deleted_at" is null;`)

    this.addSql(`create index if not exists "IDX_vendor_earning_vendor_order_id"
      on "vendor_earning" ("vendor_order_id") where "deleted_at" is null;`)

    // One earning per VendorOrder
    this.addSql(`create unique index if not exists "IDX_vendor_earning_vendor_order_id_unique"
      on "vendor_earning" ("vendor_order_id") where "deleted_at" is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor_earning" cascade;`)
    this.addSql(`drop table if exists "vendor_order_activity" cascade;`)
    this.addSql(`drop table if exists "vendor_order_item" cascade;`)
    this.addSql(`drop table if exists "vendor_order" cascade;`)
  }
}
