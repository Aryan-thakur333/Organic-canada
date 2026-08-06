/**
 * Debug DB URL
 * 
 * Run with:
 *   npx medusa exec ./src/scripts/debug-db-url.ts
 */

import { MedusaContainer } from "@medusajs/framework"

export default async function debugDbUrl({
  container,
}: {
  container: MedusaContainer
}) {
  console.log("[DB_DEBUG_START] Debugging database connection...")

  let pgManager: any
  try {
    pgManager = container.resolve("__pg_connection__")
  } catch {
    try {
      pgManager = (container as any).pgConnection || (container as any)._db
    } catch {
      // Fallback
    }
  }

  const { Client } = await import("pg")
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error("[DB_DEBUG_ERROR] DATABASE_URL not set in process.env")
    return
  }

  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  try {
    const dbResult = await client.query("SELECT current_database()")
    const schemaResult = await client.query("SELECT current_schema()")
    const userResult = await client.query("SELECT current_user")
    
    // Parse host from URL safely without logging password
    let host = "unknown"
    try {
      const urlObj = new URL(dbUrl)
      host = urlObj.hostname
    } catch {
      // Ignore URL parse errors
    }

    console.log("[DB_DEBUG]")
    console.log(`database=${dbResult.rows[0].current_database}`)
    console.log(`schema=${schemaResult.rows[0].current_schema}`)
    console.log(`user=${userResult.rows[0].current_user}`)
    console.log(`host=${host}`)
  } finally {
    await client.end()
  }
}
