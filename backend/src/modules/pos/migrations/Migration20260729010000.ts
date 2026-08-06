import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260729010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create unique index if not exists "IDX_pos_one_open_session_per_operator" on "pos_register_session"("operator_id") where "deleted_at" is null and "status" = 'OPEN';`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_pos_one_open_session_per_operator";`)
  }
}
