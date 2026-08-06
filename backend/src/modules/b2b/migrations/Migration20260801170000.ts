import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260801170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "b2b_quote_message" ("id" text not null, "quote_id" text not null, "sender_type" text not null, "sender_id" text null, "message" text not null, "is_system_message" boolean not null default false, "read_at" timestamptz null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "b2b_quote_message_pkey" primary key ("id"));`)
    this.addSql(`alter table "b2b_quote_message" drop constraint if exists "b2b_quote_message_sender_type_check";`)
    this.addSql(`alter table "b2b_quote_message" add constraint "b2b_quote_message_sender_type_check" check ("sender_type" in ('customer', 'admin', 'system'));`)
    this.addSql(`create index if not exists "IDX_b2b_quote_message_quote_id" on "b2b_quote_message" ("quote_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_b2b_quote_message_created_at" on "b2b_quote_message" ("created_at") where deleted_at is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_b2b_quote_message_created_at";`)
    this.addSql(`drop index if exists "IDX_b2b_quote_message_quote_id";`)
    this.addSql(`drop table if exists "b2b_quote_message";`)
  }
}
