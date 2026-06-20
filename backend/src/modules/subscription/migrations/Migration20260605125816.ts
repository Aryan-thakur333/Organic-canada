import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260605125816 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "subscription" ("id" text not null, "customer_id" text not null, "customer_email" text not null, "product_id" text null, "product_title" text null, "stripe_subscription_id" text null, "stripe_customer_id" text null, "stripe_payment_method_id" text null, "plan" text check ("plan" in ('weekly', 'monthly', 'quarterly', 'yearly')) not null default 'monthly', "status" text check ("status" in ('active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired')) not null default 'active', "amount" integer not null, "currency" text not null default 'usd', "next_billing_date" timestamptz null, "trial_end" timestamptz null, "last_billed_at" timestamptz null, "failed_payment_count" integer not null default 0, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "subscription_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_subscription_deleted_at" ON "subscription" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "subscription" cascade;`);
  }

}
