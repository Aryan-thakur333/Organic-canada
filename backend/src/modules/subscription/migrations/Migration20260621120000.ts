import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260621120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "subscription_plan" (
      "id" text not null,
      "title" text not null,
      "description" text null,
      "plan" text not null check ("plan" in ('weekly', 'monthly', 'quarterly', 'yearly')),
      "amount" integer not null,
      "currency" text not null default 'usd',
      "is_active" boolean not null default true,
      "sort_order" integer not null default 0,
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "subscription_plan_pkey" primary key ("id")
    );`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_plan_active" ON "subscription_plan" ("is_active") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_plan_sort" ON "subscription_plan" ("sort_order") WHERE deleted_at IS NULL;`);

    // Seed default plans
    this.addSql(`INSERT INTO "subscription_plan" ("id", "title", "description", "plan", "amount", "currency", "is_active", "sort_order") VALUES
      ('subplan_weekly', 'Weekly Harvest Box', 'Fresh organic produce delivered every week.', 'weekly', 2499, 'usd', true, 1),
      ('subplan_monthly', 'Monthly Farm Bundle', 'Curated seasonal selection once a month.', 'monthly', 7999, 'usd', true, 2),
      ('subplan_quarterly', 'Quarterly Pantry Pack', 'Bulk seasonal staples every quarter.', 'quarterly', 19999, 'usd', true, 3),
      ('subplan_yearly', 'Yearly Premium Share', 'Best value — full year of premium organic deliveries.', 'yearly', 69999, 'usd', true, 4)
    ON CONFLICT ("id") DO NOTHING;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "subscription_plan" cascade;`);
  }
}
