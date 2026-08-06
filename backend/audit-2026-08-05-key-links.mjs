import pg from "pg"
const client = new pg.Client({ connectionString: "postgres://postgres:9426695327@localhost:5432/medusa-backend" })
await client.connect()
try {
  const links = await client.query(`
    select ak.id as key_id, ak.title as key_title, ak.token,
           pak.sales_channel_id, sc.name as sc_name
    from api_key ak
    left join publishable_api_key_sales_channel pak on pak.publishable_key_id = ak.id
    left join sales_channel sc on sc.id = pak.sales_channel_id
    where ak.type = 'publishable'
    order by ak.created_at
  `)
  for (const r of links.rows) {
    console.log(`${r.key_title} | sc=${r.sales_channel_id || "NONE"} (${r.sc_name || "—"}) | token=${String(r.token).slice(0, 14)}...`)
  }
} catch (e) {
  console.error("DBERR", e.message)
} finally {
  await client.end()
}
