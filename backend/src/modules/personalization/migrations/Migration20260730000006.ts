import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Adds enforceable lifecycle and assignment integrity without changing or
 * deleting historical templates. Constraints are installed as NOT VALID (or
 * conditionally for unique indexes), so legacy rows remain auditable while all
 * new writes are protected.
 */
export class Migration20260730000006 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "personalization_template" add column if not exists "status" text not null default 'draft';`)
    this.addSql(`alter table "personalization_template" add column if not exists "version_lineage_id" text null;`)
    this.addSql(`update "personalization_template" set "version_lineage_id" = nullif("metadata"->>'version_lineage_id', '') where "version_lineage_id" is null and nullif("metadata"->>'version_lineage_id', '') is not null;`)
    this.addSql(`update "personalization_template" set "is_active" = false where coalesce("metadata"->>'lifecycle_status', '') = 'archived' and "is_active" = true;`)
    this.addSql(`update "personalization_template" set "status" = case when coalesce("metadata"->>'lifecycle_status', '') = 'archived' then 'archived' when "is_active" = true then 'active' else 'draft' end;`)

    this.addSql(`do $$ begin if not exists (select 1 from pg_constraint where conname = 'CHK_personalization_template_status') then alter table "personalization_template" add constraint "CHK_personalization_template_status" check ("status" in ('draft', 'active', 'archived')) not valid; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_constraint where conname = 'CHK_personalization_template_lifecycle') then alter table "personalization_template" add constraint "CHK_personalization_template_lifecycle" check (("status" = 'active') = "is_active") not valid; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_constraint where conname = 'CHK_personalization_template_title') then alter table "personalization_template" add constraint "CHK_personalization_template_title" check (char_length(btrim("title")) between 1 and 120) not valid; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_constraint where conname = 'CHK_personalization_field_key') then alter table "personalization_field" add constraint "CHK_personalization_field_key" check ("key" ~ '^[a-z][a-z0-9_]{0,63}$') not valid; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_constraint where conname = 'CHK_personalization_field_label') then alter table "personalization_field" add constraint "CHK_personalization_field_label" check (char_length(btrim("label")) > 0) not valid; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_constraint where conname = 'CHK_personalization_field_surcharge') then alter table "personalization_field" add constraint "CHK_personalization_field_surcharge" check ("price_adjustment" >= 0) not valid; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_constraint where conname = 'CHK_personalization_field_sort_order') then alter table "personalization_field" add constraint "CHK_personalization_field_sort_order" check ("sort_order" >= 0) not valid; end if; end $$;`)

    this.addSql(`do $$ begin if not exists (select 1 from pg_indexes where indexname = 'UIDX_personalization_template_active_product') and not exists (select 1 from "personalization_template" where "deleted_at" is null and "is_active" = true and "status" = 'active' and "variant_id" is null group by "product_id" having count(*) > 1) then create unique index "UIDX_personalization_template_active_product" on "personalization_template" ("product_id") where "deleted_at" is null and "is_active" = true and "status" = 'active' and "variant_id" is null; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_indexes where indexname = 'UIDX_personalization_template_active_variant') and not exists (select 1 from "personalization_template" where "deleted_at" is null and "is_active" = true and "status" = 'active' and "variant_id" is not null group by "product_id", "variant_id" having count(*) > 1) then create unique index "UIDX_personalization_template_active_variant" on "personalization_template" ("product_id", "variant_id") where "deleted_at" is null and "is_active" = true and "status" = 'active' and "variant_id" is not null; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_indexes where indexname = 'UIDX_personalization_field_template_key') and not exists (select 1 from "personalization_field" where "deleted_at" is null group by "template_id", "key" having count(*) > 1) then create unique index "UIDX_personalization_field_template_key" on "personalization_field" ("template_id", "key") where "deleted_at" is null; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_indexes where indexname = 'UIDX_personalization_template_normalized_title_scope') and not exists (select 1 from "personalization_template" where "deleted_at" is null and "status" <> 'archived' and "version_lineage_id" is null group by "product_id", coalesce("variant_id", ''), lower(regexp_replace(btrim("title"), '\\s+', ' ', 'g')) having count(*) > 1) then create unique index "UIDX_personalization_template_normalized_title_scope" on "personalization_template" ("product_id", coalesce("variant_id", ''), lower(regexp_replace(btrim("title"), '\\s+', ' ', 'g'))) where "deleted_at" is null and "status" <> 'archived' and "version_lineage_id" is null; end if; end $$;`)
    this.addSql(`do $$ begin if not exists (select 1 from pg_indexes where indexname = 'UIDX_personalization_template_lineage_version') and not exists (select 1 from "personalization_template" where "deleted_at" is null group by coalesce("version_lineage_id", "id"), "version" having count(*) > 1) then create unique index "UIDX_personalization_template_lineage_version" on "personalization_template" (coalesce("version_lineage_id", "id"), "version") where "deleted_at" is null; end if; end $$;`)
    this.addSql(`create index if not exists "IDX_personalization_template_admin_list" on "personalization_template" ("status", "updated_at" desc) where "deleted_at" is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_personalization_template_admin_list";`)
    this.addSql(`drop index if exists "UIDX_personalization_template_lineage_version";`)
    this.addSql(`drop index if exists "UIDX_personalization_template_normalized_title_scope";`)
    this.addSql(`drop index if exists "UIDX_personalization_field_template_key";`)
    this.addSql(`drop index if exists "UIDX_personalization_template_active_variant";`)
    this.addSql(`drop index if exists "UIDX_personalization_template_active_product";`)
    this.addSql(`alter table "personalization_field" drop constraint if exists "CHK_personalization_field_sort_order";`)
    this.addSql(`alter table "personalization_field" drop constraint if exists "CHK_personalization_field_surcharge";`)
    this.addSql(`alter table "personalization_field" drop constraint if exists "CHK_personalization_field_label";`)
    this.addSql(`alter table "personalization_field" drop constraint if exists "CHK_personalization_field_key";`)
    this.addSql(`alter table "personalization_template" drop constraint if exists "CHK_personalization_template_title";`)
    this.addSql(`alter table "personalization_template" drop constraint if exists "CHK_personalization_template_lifecycle";`)
    this.addSql(`alter table "personalization_template" drop constraint if exists "CHK_personalization_template_status";`)
    this.addSql(`alter table "personalization_template" drop column if exists "version_lineage_id";`)
  }
}
