import { Migration20260621130000 } from "../migrations/Migration20260621130000"
import { migrationContainsIndexes, migrationContainsDropIndexes } from "../../../api/utils/migration-test-helpers"

// ── Override the base Migration class for testing ────────────────────────────
// The Migration base class from @medusajs expects a MikroORM config. Instead
// of instantiating the migration object (which requires a DB connection), we
// hook into the 'addSql' calls by patching the prototype.

describe("Migration20260621130000 (subscription indexes)", () => {
  const expectedUpIndexes = [
    "IDX_subscription_customer_id",
    "IDX_subscription_customer_email",
    "IDX_subscription_status",
    "IDX_subscription_plan",
    "IDX_subscription_next_billing_date",
  ]

  const expectedDownIndexes = [
    "IDX_subscription_customer_id",
    "IDX_subscription_customer_email",
    "IDX_subscription_status",
    "IDX_subscription_plan",
    "IDX_subscription_next_billing_date",
  ]

function createMigration(): Migration20260621130000 {
  // Migration constructor expects (driver: AbstractSqlDriver, config: Configuration)
  // Pass null as both since we only test addSql output, not actual DB execution
  const migration = new Migration20260621130000(null as any, null as any)
  return migration
}

  it("up() adds all 5 expected CREATE INDEX statements", () => {
    const sqlStatements: string[] = []
    const migration = createMigration()
    migration.addSql = (sql: string) => sqlStatements.push(sql)

    migration.up()

    const result = migrationContainsIndexes(sqlStatements, expectedUpIndexes)
    expect(result.missing).toEqual([])
    expect(result.present).toHaveLength(5)
  })

  it("down() adds all 5 expected DROP INDEX statements", () => {
    const sqlStatements: string[] = []
    const migration = createMigration()
    migration.addSql = (sql: string) => sqlStatements.push(sql)

    migration.down()

    const result = migrationContainsDropIndexes(sqlStatements, expectedDownIndexes)
    expect(result.missing).toEqual([])
    expect(result.present).toHaveLength(5)
  })

  it("up() index names match the convention IDX_subscription_*", () => {
    const sqlStatements: string[] = []
    const migration = createMigration()
    migration.addSql = (sql: string) => sqlStatements.push(sql)

    migration.up()

    for (const sql of sqlStatements) {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS "/)
      expect(sql).toMatch(/"IDX_subscription_/)
      expect(sql).toMatch(/WHERE deleted_at IS NULL/)
    }
  })

  it("down() statements use DROP INDEX IF EXISTS", () => {
    const sqlStatements: string[] = []
    const migration = createMigration()
    migration.addSql = (sql: string) => sqlStatements.push(sql)

    migration.down()

    for (const sql of sqlStatements) {
      expect(sql).toMatch(/DROP INDEX IF EXISTS "/)
    }
  })
})
