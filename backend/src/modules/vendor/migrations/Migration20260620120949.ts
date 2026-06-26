import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260620120949 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "vendor_payout_request" (
        "id" text not null,
        "vendor_id" text not null,
        "amount" integer not null check ("amount" > 0),
        "currency_code" text not null,
        "status" text not null default 'pending'
          check ("status" in ('pending', 'approved', 'rejected', 'paid')),
        "note" text null,
        "external_reference" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "vendor_payout_request_pkey" primary key ("id"),
        constraint "vendor_payout_request_vendor_id_foreign"
          foreign key ("vendor_id") references "vendor" ("id") on delete cascade
      );
    `)
    this.addSql(`create index if not exists "IDX_vendor_payout_request_vendor_id" on "vendor_payout_request" ("vendor_id") where "deleted_at" is null;`)
    this.addSql(`create index if not exists "IDX_vendor_payout_request_status" on "vendor_payout_request" ("status") where "deleted_at" is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor_payout_request" cascade;`)
  }
}
