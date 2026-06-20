require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/medusa-db'
});

async function run() {
  const res = await pool.query(`
    SELECT id, customer_id, email, sales_channel_id, created_at 
    FROM "order" 
    ORDER BY created_at DESC 
    LIMIT 5;
  `);
  console.log("Recent orders:", res.rows);
  pool.end();
}

run().catch(console.error);
