#!/usr/bin/env node
/**
 * POS Diagnostic CLI
 *
 * Independently inspects:
 * 1. auth identity → actor mapping
 * 2. actor → pos_operator_assignment
 * 3. assignments → register IDs
 *
 * Usage: node backend/scripts/pos-diagnostic.js [actorId]
 * If no actorId is provided, reads from the database directly.
 */

const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:9426695327@localhost:5432/medusa-backend';

async function diagnose(actorId) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    console.log('=== POS Diagnostic ===\n');

    // 1. If actorId provided, check assignments directly
    if (actorId) {
      console.log(`[1] Auth identity → actor mapping`);
      console.log(`    actor_id: ${actorId}`);

      const assignmentsResult = await client.query(
        'SELECT operator_id, register_id, role, active, deleted_at FROM pos_operator_assignment WHERE operator_id = $1 ORDER BY register_id',
        [actorId]
      );
      console.log(`[2] actor → pos_operator_assignment`);
      console.log(`    assignment_count: ${assignmentsResult.rows.length}`);
      assignmentsResult.rows.forEach((row, i) => {
        console.log(`    [${i}] operator_id=${row.operator_id} register_id=${row.register_id} role=${row.role} active=${row.active} deleted_at=${row.deleted_at}`);
      });

      const registerIds = [...new Set(assignmentsResult.rows.map(r => r.register_id))];
      console.log(`[3] assignments → register IDs`);
      console.log(`    register_count: ${registerIds.length}`);
      registerIds.forEach((id, i) => {
        console.log(`    [${i}] ${id}`);
      });

      // Check registers exist
      if (registerIds.length > 0) {
        const registersResult = await client.query(
          'SELECT id, name, code, status, currency_code FROM pos_register WHERE id = ANY($1) ORDER BY code',
          [registerIds]
        );
        console.log(`[4] register existence check`);
        console.log(`    found: ${registersResult.rows.length}/${registerIds.length}`);
        registersResult.rows.forEach((reg, i) => {
          console.log(`    [${i}] id=${reg.id} name=${reg.name} code=${reg.code} status=${reg.status} currency=${reg.currency_code}`);
        });
      }
    } else {
      // No actorId - show all assignments
      console.log(`[1] All pos_operator_assignment records`);
      const allResult = await client.query(
        'SELECT operator_id, register_id, role, active, deleted_at FROM pos_operator_assignment ORDER BY operator_id, register_id'
      );
      console.log(`    total: ${allResult.rows.length}`);
      allResult.rows.forEach((row, i) => {
        console.log(`    [${i}] operator_id=${row.operator_id} register_id=${row.register_id} role=${row.role} active=${row.active} deleted_at=${row.deleted_at || 'null'}`);
      });

      const uniqueOperators = [...new Set(allResult.rows.map(r => r.operator_id))];
      console.log(`\n[2] Unique operators: ${uniqueOperators.length}`);
      uniqueOperators.forEach((op, i) => {
        const opAssignments = allResult.rows.filter(r => r.operator_id === op);
        const activeCount = opAssignments.filter(r => r.active && !r.deleted_at).length;
        console.log(`    [${i}] ${op} (${activeCount} active assignments)`);
      });

      const registerIds = [...new Set(allResult.rows.map(r => r.register_id))];
      console.log(`\n[3] assignments → register IDs`);
      console.log(`    register_count: ${registerIds.length}`);
      registerIds.forEach((id, i) => {
        console.log(`    [${i}] ${id}`);
      });
    }

    console.log('\n=== Diagnostic Complete ===');
  } catch (error) {
    console.error('Diagnostic failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

const actorId = process.argv[2];
diagnose(actorId).catch(() => process.exit(1));