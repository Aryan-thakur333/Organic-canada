import { ExecArgs } from "@medusajs/framework/types"

export default function debugRuntimeDatabase({ container }: ExecArgs) {
  return async () => {
    console.log("[DB_DEBUG_START] Debugging database connection...")

    const { Client } = await import("pg")
    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) {
      console.error("[DB_DEBUG_ERROR] DATABASE_URL not set in process.env")
      process.exit(1)
    }

    const client = new Client({ connectionString: dbUrl })
    await client.connect()

    try {
      const dbResult = await client.query("SELECT current_database()")
      const schemaResult = await client.query("SELECT current_schema()")
      const userResult = await client.query("SELECT current_user")
      
      let host = "unknown"
      let port = "5432"
      try {
        const urlObj = new URL(dbUrl)
        host = urlObj.hostname
        port = urlObj.port || "5432"
      } catch {
        // Ignore URL parse errors
      }

      console.log("[RUNTIME_DATABASE_CONNECTION]")
      console.log(JSON.stringify({
        host,
        port,
        database: dbResult.rows[0].current_database,
        schema: schemaResult.rows[0].current_schema,
        user: userResult.rows[0].current_user,
        nodeEnv: process.env.NODE_ENV || "development",
      }, null, 2))
    } finally {
      await client.end()
    }
  }
}
