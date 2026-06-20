import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgres://postgres:9426695327@localhost:5432/medusa-backend'
});
await client.connect();
try {
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user';");
  console.log("Columns of 'user' table:", res.rows);
} catch (err) {
  console.error("Error:", err.message);
}
await client.end();
