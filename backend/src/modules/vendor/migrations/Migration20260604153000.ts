import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260604153000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor" drop constraint if exists "vendor_status_check";`);
    this.addSql(`alter table if exists "vendor" add constraint "vendor_status_check" check ("status" in ('pending', 'approved', 'rejected', 'suspended'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "vendor" drop constraint if exists "vendor_status_check";`);
    this.addSql(`alter table if exists "vendor" add constraint "vendor_status_check" check ("status" in ('pending', 'approved', 'rejected'));`);
  }

}
