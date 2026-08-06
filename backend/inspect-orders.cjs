const { Client } = require('pg');

async function inspectDb() {
  const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:9426695327@localhost:5432/medusa-backend';
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const badId  = 'order_01KWPX4YY9A0EK11BBE6NE96S7';
  const bad2Id = 'order_01KWPWXAK5NVKY400RAS5C9BJE';
  const goodId = 'order_01KWPWQFH40X0W5VHVM39BFMPG';

  async function printOrder(label, id) {
    console.log('\n===', label, '===');
    const r = await client.query(
      'SELECT id, status, display_id, customer_id, sales_channel_id, is_draft_order, version, metadata FROM "order" WHERE id = $1',
      [id]
    );
    console.log(JSON.stringify(r.rows[0], null, 2));

    const opc = await client.query(
      'SELECT * FROM order_payment_collection WHERE order_id = $1',
      [id]
    );
    console.log('  order_payment_collection:', JSON.stringify(opc.rows, null, 2));

    if (opc.rows.length) {
      const pcId = opc.rows[0].payment_collection_id;
      const pc = await client.query(
        'SELECT id, status, raw_amount, raw_authorized_amount, raw_captured_amount, currency_code FROM payment_collection WHERE id = $1',
        [pcId]
      );
      console.log('  payment_collection:', JSON.stringify(pc.rows[0], null, 2));
    }
  }

  await printOrder('BAD ORDER 1', badId);
  await printOrder('BAD ORDER 2', bad2Id);
  await printOrder('GOOD ORDER',  goodId);

  // Also check order_summary table if it exists
  try {
    const s = await client.query(
      'SELECT * FROM order_summary WHERE order_id = $1',
      [badId]
    );
    console.log('\n=== order_summary (bad) ===', JSON.stringify(s.rows, null, 2));
  } catch (e) {
    console.log('order_summary table not found or query failed:', e.message);
  }

  await client.end();
}

inspectDb().catch(e => { console.error(e.message); process.exit(1); });
