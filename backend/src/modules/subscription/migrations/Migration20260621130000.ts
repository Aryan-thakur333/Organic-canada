import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260621130000 extends Migration {
  override async up(): Promise<void> {
    // Some recovered databases contain the original migration journal entry
    // without the table itself. Repair that inconsistent state before adding
    // indexes. This remains a no-op on healthy databases.
    this.addSql(`create table if not exists "subscription" (
      "id" text not null,
      "customer_id" text not null,
      "customer_email" text not null,
      "product_id" text null,
      "product_title" text null,
      "stripe_subscription_id" text null,
      "stripe_customer_id" text null,
      "stripe_payment_method_id" text null,
      "plan" text check ("plan" in ('weekly', 'monthly', 'quarterly', 'yearly')) not null default 'monthly',
      "status" text check ("status" in ('active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired')) not null default 'active',
      "amount" integer not null,
      "currency" text not null default 'usd',
      "next_billing_date" timestamptz null,
      "trial_end" timestamptz null,
      "last_billed_at" timestamptz null,
      "failed_payment_count" integer not null default 0,
      "metadata" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "subscription_pkey" primary key ("id")
    );`)

    // customer_id — heavily queried by customer dashboard & admin
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_subscription_customer_id" ON "subscription" ("customer_id") WHERE deleted_at IS NULL;`
    )
    // customer_email — searched by admin
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_subscription_customer_email" ON "subscription" ("customer_email") WHERE deleted_at IS NULL;`
    )
    // status — filtered by admin (active, past_due, cancelled, etc.)
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_subscription_status" ON "subscription" ("status") WHERE deleted_at IS NULL;`
    )
    // plan — used in MRR/computed analytics, grouped
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_subscription_plan" ON "subscription" ("plan") WHERE deleted_at IS NULL;`
    )
    // next_billing_date — queried by billing jobs, renewal workers
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_subscription_next_billing_date" ON "subscription" ("next_billing_date") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_subscription_customer_id";`)
    this.addSql(`DROP INDEX IF EXISTS "IDX_subscription_customer_email";`)
    this.addSql(`DROP INDEX IF EXISTS "IDX_subscription_status";`)
    this.addSql(`DROP INDEX IF EXISTS "IDX_subscription_plan";`)
    this.addSql(`DROP INDEX IF EXISTS "IDX_subscription_next_billing_date";`)
  }
}
