import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgres://postgres:9426695327@localhost:5432/medusa-backend'
});

async function run() {
  await client.connect();
  try {
    const res = await client.query('SELECT id, title, redacated FROM publishable_api_key;');
    console.log("Keys:", res.rows);
  } catch (err) {
    console.error("Error:", err.message);
  }
  
  try {
    const res2 = await client.query('SELECT * FROM "publishable_api_key"');
    console.log("All Keys:", res2.rows);
  } catch (err) {
    console.error("Error2:", err.message);
  }
  
  await client.end();
}

run();
