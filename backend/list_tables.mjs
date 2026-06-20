import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgres://postgres:9426695327@localhost:5432/medusa-backend'
});
await client.connect();
const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public';");
console.log(res.rows.map(r => r.table_name));
await client.end();
