import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260714122317 extends Migration {

  override async up(): Promise<void> {
    // 1. Create commission_setting table if missing
    this.addSql(`
      create table if not exists "commission_setting" (
        "id" text not null, 
        "account_type" text not null, 
        "fee_type" text not null default 'percentage', 
        "fee_value" numeric not null default 10, 
        "is_active" boolean not null default true, 
        "metadata" jsonb null, 
        "created_at" timestamptz not null default now(), 
        "updated_at" timestamptz not null default now(), 
        "deleted_at" timestamptz null,
        constraint "commission_setting_pkey" primary key ("id")
      );
    `);

    // 2. Add columns if missing (in case table existed)
    this.addSql(`
      ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "account_type" text;
      ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "fee_type" text DEFAULT 'percentage';
      ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "fee_value" numeric DEFAULT 10;
      ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
      ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "metadata" jsonb NULL;
      ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "created_at" timestamptz DEFAULT now();
      ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now();
      ALTER TABLE "commission_setting" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz NULL;
    `);

    // 3. Create unique index on account_type if missing
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_commission_setting_account_type" ON "commission_setting" ("account_type") WHERE deleted_at IS NULL;
    `);

    // 4. Create commission_record table if missing
    this.addSql(`
      create table if not exists "commission_record" (
        "id" text not null,
        "order_id" text null,
        "account_type" text not null,
        "base_amount" bigint not null default 0,
        "fee_type" text not null default 'percentage',
        "fee_value" numeric not null default 0,
        "commission_amount" bigint not null default 0,
        "status" text not null default 'pending',
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "commission_record_pkey" primary key ("id")
      );
    `);

    // 5. Seed defaults from old commission_rule if table exists
    this.addSql(`
      do $$
      begin
        if exists (select from information_schema.tables where table_name = 'commission_rule') then
          insert into commission_setting (id, account_type, fee_type, fee_value, is_active, created_at, updated_at)
          select 
            id, 
            applies_to as account_type, 
            fee_type, 
            fee_value, 
            is_active, 
            created_at, 
            updated_at
          from commission_rule
          where not exists (
            select 1 from commission_setting
            where commission_setting.account_type = commission_rule.applies_to
            and commission_setting.deleted_at is null
          );
        end if;
      end $$;
    `);

    // 6. Seed missing default values
    this.addSql(`
      INSERT INTO "commission_setting" ("id", "account_type", "fee_type", "fee_value", "is_active", "created_at", "updated_at")
      SELECT 'coms_normal', 'normal_customer', 'percentage', 10, true, now(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM "commission_setting" WHERE "account_type" = 'normal_customer' AND "deleted_at" IS NULL
      );

      INSERT INTO "commission_setting" ("id", "account_type", "fee_type", "fee_value", "is_active", "created_at", "updated_at")
      SELECT 'coms_b2b', 'b2b_customer', 'percentage', 10, true, now(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM "commission_setting" WHERE "account_type" = 'b2b_customer' AND "deleted_at" IS NULL
      );

      INSERT INTO "commission_setting" ("id", "account_type", "fee_type", "fee_value", "is_active", "created_at", "updated_at")
      SELECT 'coms_vendor', 'vendor', 'percentage', 8, true, now(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM "commission_setting" WHERE "account_type" = 'vendor' AND "deleted_at" IS NULL
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "commission_setting" cascade;`);
    this.addSql(`drop table if exists "commission_record" cascade;`);
  }

}
