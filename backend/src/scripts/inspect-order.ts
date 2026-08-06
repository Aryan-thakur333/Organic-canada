import pg from "pg"

export default async function inspectPaymentCols() {
  const DB_URL = process.env.DATABASE_URL || "postgres://postgres:9426695327@localhost:5432/medusa-backend"
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()

  const collections = await client.query(`
    SELECT id, status FROM "payment_collection" LIMIT 10
  `)
  console.log("=== payment_collection Rows ===")
  console.table(collections.rows)

  await client.end()
}
