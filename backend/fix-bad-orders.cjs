const { Client } = require('pg');

async function fixBadOrders() {
  const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:9426695327@localhost:5432/medusa-backend';
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const badOrders = [
    'order_01KWPX4YY9A0EK11BBE6NE96S7',
    'order_01KWPWXAK5NVKY400RAS5C9BJE'
  ];

  for (const orderId of badOrders) {
    // Get the order_payment_collection rows for this order
    const opcRows = await client.query(
      'SELECT * FROM order_payment_collection WHERE order_id = $1',
      [orderId]
    );
    
    if (!opcRows.rows.length) {
      console.log(`No OPC rows for ${orderId}, skipping`);
      continue;
    }

    for (const opc of opcRows.rows) {
      const pcId = opc.payment_collection_id;
      console.log(`Processing order ${orderId} -> payment_collection ${pcId}`);
      
      // Check if payment_collection ID is malformed (not a valid Medusa ULID)
      // Valid Medusa IDs look like: pay_col_01XXXXXXXXXXXXXXXXXXXX (26 char ULID suffix)
      const isValidId = /^pay_col_[0-9A-Z]{26}$/.test(pcId);
      console.log(`  payment_collection ID valid: ${isValidId}`);

      if (!isValidId) {
        // Get the payment rows linked to this payment collection
        const payments = await client.query(
          'SELECT * FROM payment WHERE payment_collection_id = $1',
          [pcId]
        );
        console.log(`  Payments in this collection: ${payments.rows.length}`);

        // Delete payments first (FK constraint)
        await client.query('DELETE FROM payment WHERE payment_collection_id = $1', [pcId]);
        console.log(`  Deleted payments for collection ${pcId}`);

        // Delete order_payment_collection link
        await client.query(
          'DELETE FROM order_payment_collection WHERE order_id = $1 AND payment_collection_id = $2',
          [orderId, pcId]
        );
        console.log(`  Deleted order_payment_collection link`);

        // Delete payment_collection itself
        await client.query('DELETE FROM payment_collection WHERE id = $1', [pcId]);
        console.log(`  Deleted payment_collection ${pcId}`);

        console.log(`  ✓ Cleaned up bad payment collection for order ${orderId}`);
      }
    }
  }

  // Verify the orders can now be fetched without 500
  console.log('\n=== Verification: Checking orders still exist ===');
  for (const orderId of badOrders) {
    const r = await client.query('SELECT id, status FROM "order" WHERE id = $1', [orderId]);
    console.log(`  Order ${orderId}: ${r.rows.length ? JSON.stringify(r.rows[0]) : 'NOT FOUND'}`);
  }

  await client.end();
  console.log('\nDone. The malformed payment_collections have been removed.');
  console.log('The orders themselves are preserved but no longer have invalid payment_collection links.');
}

fixBadOrders().catch(e => { console.error(e.message); process.exit(1); });
