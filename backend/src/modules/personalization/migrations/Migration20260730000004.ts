import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260730000004 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "personalization_field" add column if not exists "field_type" text not null default 'text';`)
    this.addSql(`do $$ begin if exists (select 1 from information_schema.columns where table_name='personalization_field' and column_name='type') then update "personalization_field" set "field_type" = "type" where "field_type" = 'text' and "type" is not null; end if; end $$;`)
    // Legacy schemas required `name`, while the current model writes `title`.
    // Keep the legacy column for compatibility, but allow new rows to omit it.
    this.addSql(`alter table "personalization_template" alter column "name" drop not null;`)
  }
  override async down(): Promise<void> {
    this.addSql(`update "personalization_template" set "name" = coalesce(nullif("name", ''), nullif("title", ''), "id") where "name" is null;`)
    this.addSql(`alter table "personalization_template" alter column "name" set not null;`)
    this.addSql(`alter table "personalization_field" drop column if exists "field_type";`)
  }
}
