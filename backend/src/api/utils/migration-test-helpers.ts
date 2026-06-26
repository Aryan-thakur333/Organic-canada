/**
 * Test helper: verify that the migration SQL statements contain all expected
 * CREATE INDEX statements.
 */
export function migrationContainsIndexes(
  sqlStatements: string[],
  expectedIndexes: string[]
): { missing: string[]; present: string[] } {
  const present: string[] = []
  const missing: string[] = []

  for (const index of expectedIndexes) {
    if (sqlStatements.some((sql) => sql.includes(index))) {
      present.push(index)
    } else {
      missing.push(index)
    }
  }

  return { missing, present }
}

/**
 * Test helper: verify that the migration SQL statements contain all expected
 * DROP INDEX statements.
 */
export function migrationContainsDropIndexes(
  sqlStatements: string[],
  expectedIndexes: string[]
): { missing: string[]; present: string[] } {
  const present: string[] = []
  const missing: string[] = []

  for (const index of expectedIndexes) {
    if (sqlStatements.some((sql) => sql.includes(index))) {
      present.push(index)
    } else {
      missing.push(index)
    }
  }

  return { missing, present }
}
