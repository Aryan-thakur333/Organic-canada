import pg from "pg";
const c = new pg.Client({ connectionString: "postgres://postgres:9426695327@localhost:5432/medusa-backend" });
await c.connect();
const r = await c.query(
  "select id, region_id, currency_code from cart where id = $1",
  ["cart_01KZ99CDMSH362V5XNYTKXBYAB"]
);
console.log(JSON.stringify(r.rows, null, 1));
await c.end();
