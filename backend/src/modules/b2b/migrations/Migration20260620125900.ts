import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260620125900 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "company" (` +
        `"id" text not null, ` +
        `"company_name" text not null, ` +
        `"tax_id" text null, ` +
        `"gstin" text null, ` +
        `"credit_limit" integer not null default 0, ` +
        `"status" text check ("status" in ('active', 'inactive', 'suspended')) not null default 'active', ` +
        `"created_at" timestamptz not null default now(), ` +
        `"updated_at" timestamptz not null default now(), ` +
        `"deleted_at" timestamptz null, ` +
        `constraint "company_pkey" primary key ("id")` +
        `);`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_company_status" ON "company" ("status") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_company_deleted_at" ON "company" ("deleted_at");`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "company" cascade;`)
  }
}
