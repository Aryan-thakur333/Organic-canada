import pg from "pg";
const c = new pg.Client({ connectionString: "postgres://postgres:9426695327@localhost:5432/medusa-backend" });
await c.connect();
const osCols = await c.query(
  `select column_name from information_schema.columns where table_name = 'order_summary' order by ordinal_position`
);
console.log("ORDER_SUMMARY COLS:", JSON.stringify(osCols.rows.map((r) => r.column_name)));
const orders = await c.query(
  `select o.id, o.currency_code, o.created_at
   from "order" o
   order by o.created_at desc
   limit 3`
);
for (const o of orders.rows) {
  const sums = await c.query(
    `select * from order_summary where order_id = $1`,
    [o.id]
  );
  console.log("ORDER:", o.id, o.currency_code, "summary=", JSON.stringify(sums.rows[0]));
}
if (orders.rows.length) {
  const items = await c.query(
    `select oi.order_id, oi.item_id, oi.unit_price, oi.raw_unit_price, oi.quantity
     from order_item oi
     where oi.order_id = any($1)
     order by oi.created_at desc
     limit 12`,
    [orders.rows.map((o) => o.id)]
  );
  console.log("ITEMS:", JSON.stringify(items.rows, null, 1));
}
await c.end();
