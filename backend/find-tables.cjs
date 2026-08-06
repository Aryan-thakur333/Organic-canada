const { Client } = require('pg');
const c = new Client({ connectionString: 'postgres://postgres:9426695327@localhost:5432/medusa-backend' });
c.connect().then(async () => {
  const r1 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='publishable_api_key_sales_channel'");
  console.log('publishable_api_key_sales_channel cols:', r1.rows.map(x=>x.column_name));
  const r2 = await c.query("SELECT * FROM publishable_api_key_sales_channel LIMIT 5");
  console.log('publishable_api_key_sales_channel rows:', r2.rows);
  const r3 = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='api_key'");
  console.log('api_key cols:', r3.rows.map(x=>x.column_name));
  await c.end();
}).catch(e => { console.error(e.message); c.end(); });
