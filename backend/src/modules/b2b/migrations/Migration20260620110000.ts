import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260620110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "b2b_quote" (` +
        `"id" text not null, ` +
        `"company_id" text not null, ` +
        `"customer_id" text not null, ` +
        `"customer_email" text not null, ` +
        `"status" text check ("status" in ('draft', 'pending', 'approved', 'rejected', 'converted')) not null default 'draft', ` +
        `"items" jsonb null, ` +
        `"subtotal" integer not null, ` +
        `"negotiated_total" integer null, ` +
        `"admin_notes" text null, ` +
        `"metadata" jsonb null, ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "b2b_quote_pkey" primary key ("id")` +
        `);`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_b2b_quote_company_id" ON "b2b_quote" ("company_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_b2b_quote_status" ON "b2b_quote" ("status") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_b2b_quote_deleted_at" ON "b2b_quote" ("deleted_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "b2b_quote" cascade;`)
  }
}
