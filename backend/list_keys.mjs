import pg from 'pg';
const client = new pg.Client({
  connectionString: 'postgres://postgres:9426695327@localhost:5432/medusa-backend'
});
await client.connect();
const res = await client.query("SELECT * FROM api_key;");
console.log(res.rows);
await client.end();
