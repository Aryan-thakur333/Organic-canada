import pg from "pg"
const DB = "postgres://postgres:9426695327@localhost:5432/medusa-backend"
const client = new pg.Client({ connectionString: DB })
await client.connect()
try {
  const regions = await client.query("select id, name, currency_code from region order by name")
  console.log("REGIONS:", JSON.stringify(regions.rows, null, 2))
  const keys = await client.query("select id, title, type from api_key where type = 'publishable'")
  console.log("PUBLISHABLE_KEYS:", JSON.stringify(keys.rows, null, 2))
  const sc = await client.query("select id, name from sales_channel where is_disabled = false")
  console.log("SALES_CHANNELS:", JSON.stringify(sc.rows, null, 2))
  // Repaired product titles + prices
  const titles = ["Thekua", "Pineapple", "Papaya", "Papaya Final", "Papaya Pack Small", "E-Book Gardening", "E-Book"]
  const prods = await client.query(
    `select p.id, p.title, pv.id as variant_id, pv.sku, pr.currency_code, pr.amount
     from product p
     join product_variant pv on pv.product_id = p.id
     join product_variant_price_set pvps on pvps.variant_id = pv.id
     join price_set ps on ps.id = pvps.price_set_id
     join price pr on pr.price_set_id = ps.id
     where p.title ilike any($1)
     order by p.title, pr.currency_code`,
    [titles]
  )
  console.log("REPAIRED_PRICE_ROWS:", JSON.stringify(prods.rows, null, 2))
} catch (e) {
  console.error("DBERR", e.message)
} finally {
  await client.end()
}
