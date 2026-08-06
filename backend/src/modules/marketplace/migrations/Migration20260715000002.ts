import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260715000002 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE "vendor_order_activity" 
      DROP CONSTRAINT IF EXISTS "vendor_order_activity_type_check";
    `)
    
    this.addSql(`
      ALTER TABLE "vendor_order_activity" 
      ADD CONSTRAINT "vendor_order_activity_type_check" 
      CHECK ("type" IN (
        'order_received',
        'order_accepted',
        'order_rejected',
        'inventory_allocated',
        'processing_started',
        'order_prepared',
        'fulfillment_created',
        'shipment_created',
        'tracking_updated',
        'order_shipped',
        'order_delivered',
        'order_cancelled',
        'payment_authorized',
        'payment_captured',
        'payment_refunded',
        'note_added',
        'delivered',
        'admin_note',
        'customer_cancellation_requested'
      ));
    `)
  }

  override async down(): Promise<void> {
    // Note: Rolling back will fail if there are existing rows with the new types like 'order_delivered'.
    // The previous known constraint list from the earlier migration was more limited.
    this.addSql(`
      ALTER TABLE "vendor_order_activity" 
      DROP CONSTRAINT IF EXISTS "vendor_order_activity_type_check";
    `)
    
    this.addSql(`
      ALTER TABLE "vendor_order_activity" 
      ADD CONSTRAINT "vendor_order_activity_type_check" 
      CHECK ("type" IN (
        'order_received',
        'order_accepted',
        'order_rejected',
        'inventory_allocated',
        'processing_started',
        'fulfillment_created',
        'shipment_created',
        'tracking_updated',
        'delivered',
        'admin_note',
        'customer_cancellation_requested'
      ));
    `)
  }
}
