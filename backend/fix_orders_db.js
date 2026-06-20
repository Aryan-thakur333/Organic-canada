require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/medusa-db'
});

async function run() {
  const email = 'unforgetable523566@gmail.com';
  const customerRes = await pool.query(`SELECT id FROM "customer" WHERE email = $1 LIMIT 1`, [email]);
  if (customerRes.rows.length === 0) {
    console.log("No customer found");
    return;
  }
  const customerId = customerRes.rows[0].id;
  console.log("Customer ID:", customerId);

  const res = await pool.query(`
    UPDATE "order" 
    SET customer_id = $1 
    WHERE email = $2 AND customer_id IS NULL
    RETURNING id;
  `, [customerId, email]);
  
  console.log("Orders updated:", res.rows);
  pool.end();
}

run().catch(console.error);
