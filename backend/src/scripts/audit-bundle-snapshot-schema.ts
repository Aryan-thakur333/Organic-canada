import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** Read-only runtime schema audit for the bundle snapshot lifecycle. */
export default async function auditBundleSnapshotSchema({ container }: ExecArgs) {
  const connection: any = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const columns = await connection.raw(`select column_name from information_schema.columns where table_schema = current_schema() and table_name = 'bundle_line_snapshot'`)
  const indexes = await connection.raw(`select indexname from pg_indexes where schemaname = current_schema() and tablename = 'bundle_line_snapshot'`)
  const names = new Set((columns.rows || columns).map((row: any) => row.column_name))
  const indexNames = new Set((indexes.rows || indexes).map((row: any) => row.indexname))
  const result = {
    runtimeDatabase: process.env.DB_NAME || "configured-postgres",
    migrationApplied: names.has("bundle_group_id") && names.has("status"),
    tableExists: names.size > 0,
    bundleGroupColumnExists: names.has("bundle_group_id"),
    statusColumnExists: names.has("status"),
    groupIndexExists: indexNames.has("IDX_bundle_snapshot_cart_group_active") && indexNames.has("UIDX_bundle_snapshot_cart_group"),
  }
  console.log("[BUNDLE_SNAPSHOT_SCHEMA_AUDIT]")
  console.log(JSON.stringify({ ...result, passed: Object.values(result).every(Boolean) }, null, 2))
}
