import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260713172812 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "commission_rule" ("id" text not null, "name" text not null, "applies_to" text check ("applies_to" in ('normal_customer', 'b2b_customer', 'vendor')) not null, "fee_type" text check ("fee_type" in ('percentage', 'fixed')) not null, "fee_value" integer not null, "currency_code" text not null default 'cad', "is_active" boolean not null default true, "description" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commission_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commission_rule_deleted_at" ON "commission_rule" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "commission_snapshot" ("id" text not null, "order_id" text not null, "rule_id" text null, "applies_to" text check ("applies_to" in ('normal_customer', 'b2b_customer', 'vendor')) not null, "fee_type" text check ("fee_type" in ('percentage', 'fixed')) not null, "fee_value" integer not null default 0, "order_total_minor" integer not null default 0, "commission_amount_minor" integer not null default 0, "currency_code" text not null default 'cad', "vendor_id" text null, "company_id" text null, "customer_id" text null, "rule_name_snapshot" text null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commission_snapshot_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commission_snapshot_deleted_at" ON "commission_snapshot" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "commission_rule" cascade;`);

    this.addSql(`drop table if exists "commission_snapshot" cascade;`);
  }

}
