import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260618120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor" add column if not exists "store_name" text not null default '';`);
    this.addSql(`alter table if exists "vendor" add column if not exists "company_details" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "vendor" drop column if exists "company_details";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "store_name";`);
  }

}
