# Phase 4 POS Session Duplicate Remediation

Date: 2026-07-29 (Asia/Calcutta)  
Approval: `POS-SESSION-DEDUP-20260729-001`  
Approved by: Aryan Thakur  
Reason: Duplicate stale empty POS session blocking uniqueness migration

## Outcome

PASSED. The stale, empty Canada POS session was closed through the POS module service. The USA session remains OPEN. No session, transaction, receipt, payment, return, exchange, cash movement, or audit record was deleted. The duplicate-operator query returns zero rows, `Migration20260729010000` is applied, its second run is idempotent, and PostgreSQL confirms the required unique partial index.

## Checkpoint evidence

### 1. Live precheck before any write

```text
[POS_SESSION_REMEDIATION_PRECHECK]
```

```json
{
  "operatorId": "user_01KWPV0WK7J0KN2A8FZ0AD3T16",
  "keepSessionId": "01KYP39VH0W0JKFYZMNNYPA6A9",
  "closeSessionId": "01KYMWH2QWPDXDCMN5DS241F0X",
  "keepSessionStillOpen": true,
  "closeSessionStillOpen": true,
  "closeSessionTransactions": 0,
  "closeSessionReceipts": 0,
  "closeSessionCashMovementCount": 1,
  "closeSessionCashMovementTotal": 0,
  "snapshotCurrent": true,
  "databaseWrites": 0
}
```

The service-level guard also verified zero payments, returns, exchanges, orders, and pending reconciliation; both sessions had exactly one zero-value `OPENING_FLOAT`; both belonged to the approved operator and different approved registers.

### 2. Backup

```text
[POS_SESSION_REMEDIATION_BACKUP]
```

```json
{
  "backupCreated": true,
  "backupPath": "D:\\eatsie-project\\backups\\before-pos-session-dedup-20260729-140408.backup",
  "backupSize": 845091,
  "pgDumpPassed": true,
  "pgdmpHeaderValid": true
}
```

The dump was made from the current backend `.env` `DATABASE_URL` with PostgreSQL 18 `pg_dump --format=custom`. Exit code was 0, the file was fresh and non-empty, and its first five bytes were `PGDMP`. Credentials were not printed.

Backup SHA-256: `ae7964f9a8d38d2edaeeb955c791bc56dea957125289b5fe8eda67a120759cd3`

### 3. Dry run

```text
[POS_STALE_SESSION_CLOSE_DRY_RUN]
```

```json
{
  "targetSessionId": "01KYMWH2QWPDXDCMN5DS241F0X",
  "keepSessionId": "01KYP39VH0W0JKFYZMNNYPA6A9",
  "targetRegister": "Canada POS Register",
  "keepRegister": "USA POS Register",
  "plannedStatus": "CLOSED",
  "transactions": 0,
  "receipts": 0,
  "cashMovements": 1,
  "cashMovementTotal": 0,
  "expectedCashMinor": 0,
  "countedCashMinor": 0,
  "cashDifferenceMinor": 0,
  "databaseWrites": 0,
  "passed": true
}
```

### 4. Approved service-level apply

```text
[POS_STALE_SESSION_CLOSE_APPLY]
```

```json
{
  "targetSessionId": "01KYMWH2QWPDXDCMN5DS241F0X",
  "previousStatus": "OPEN",
  "newStatus": "CLOSED",
  "closedAtSet": true,
  "usaSessionStillOpen": true,
  "auditEventCreated": true,
  "databaseWrites": 2,
  "passed": true
}
```

The two atomic remediation data writes were:

1. One POS-service update of the Canada session: `status=CLOSED`, `closed_at` set, and the approved zero reconciliation values (`expected_cash_minor=0`, `counted_cash_minor=0`, `cash_difference_minor=0`). The existing `opening_cash_minor=0` and cash-movement row were preserved.
2. One POS-service insert of audit event `POS_STALE_SESSION_CLOSED`, containing the session IDs, reason, approver, approval reference, and backup reference.

No raw `UPDATE`, raw `DELETE`, or session deletion was used. Both service writes ran in one POS-module database transaction. The uniqueness migration subsequently performed its expected schema/index creation and migration bookkeeping; those schema operations are not included in the two remediation data-record writes above.

One initial apply invocation stopped before entering the transaction because the root script container did not expose a generic manager. It made zero writes. The target was re-read and confirmed still OPEN, and the implementation was corrected to use the POS module's own persistence manager before the successful apply.

### 5. Exact apply retry

```text
[POS_STALE_SESSION_CLOSE_IDEMPOTENCE]
```

```json
{
  "alreadyClosed": true,
  "additionalWrites": 0,
  "duplicateAuditEvent": false,
  "passed": true
}
```

The retry required the same approval and verified backup. It accepted the CLOSED state only because the USA session was still OPEN and exactly one matching audit event existed.

### 6. Read-only deduplication verification

The required grouped PostgreSQL query returned zero rows.

```text
[POS_SESSION_DEDUP_VERIFICATION]
```

```json
{
  "duplicateOperators": 0,
  "usaSessionStatus": "OPEN",
  "canadaSessionStatus": "CLOSED",
  "sessionDeleted": false,
  "transactionsPreserved": true,
  "receiptsPreserved": true,
  "cashMovementsPreserved": true,
  "readyForMigration": true
}
```

The Canada session still has zero transactions, zero receipts, and its one `OPENING_FLOAT` movement with a total of zero. Exactly one remediation audit event exists.

### 7. Migration and index

The first `npm.cmd exec medusa db:migrate` run successfully migrated POS `Migration20260729010000`. The exact command was run again; the second run reported the POS module up to date, with no `23505`, pending POS migration, or duplicate-index error.

PostgreSQL catalog verification produced:

```text
[POS_OPEN_SESSION_UNIQUE_INDEX]
```

```json
{
  "indexExists": true,
  "isUnique": true,
  "correctTable": true,
  "correctColumn": true,
  "predicateCorrect": true,
  "passed": true
}
```

The verified index is `IDX_pos_one_open_session_per_operator` on `pos_register_session(operator_id)`, limited to rows where `deleted_at IS NULL AND status='OPEN'`.

### 8. Tests and build

- `npm.cmd test`: 37 suites passed, 559 tests passed, 0 failed.
- Focused POS session/security suite: 24 tests passed, 0 failed.
- `npm.cmd run build`: backend and admin/frontend compilation passed.

Coverage verifies closure of only the approved stale-empty target, preservation of the active session, blocking sessions with transactions or non-zero cash movement, approval/backup requirements, stale-snapshot rejection, one-event idempotence, no deletion, same-register retry, different-register operator conflict, future opening after a historical session is CLOSED, and the migration's unique partial operator index.

## Implemented files

- `backend/src/scripts/close-stale-empty-pos-session.ts` - locked, backup-gated, dry-run-by-default remediation entry point.
- `backend/src/utils/pos/session-remediation.ts` - service-level inspection, fail-closed validation, atomic closure/audit, and idempotence.
- `backend/src/utils/pos/__tests__/session-remediation.unit.spec.ts` - remediation and migration safeguards.
- `backend/src/utils/pos/__tests__/security.unit.spec.ts` - explicit future-session-after-close coverage in addition to retry/conflict coverage.
- `backend/src/modules/pos/migrations/Migration20260729010000.ts` - unique partial OPEN-session-per-operator index.

## Final marker

```text
[PHASE_4_POS_SESSION_DUPLICATE_REMEDIATION_DONE]
```

```json
{
  "status": "PASSED",
  "duplicateSessionsBefore": 2,
  "usaSessionKeptOpen": true,
  "canadaSessionClosed": true,
  "backupCreated": true,
  "dryRunPassed": true,
  "applyPassed": true,
  "idempotencePassed": true,
  "duplicateSessionsAfter": 0,
  "migrationApplied": true,
  "migrationIdempotent": true,
  "uniqueIndexVerified": true,
  "backendTestsPassed": 559,
  "backendBuildPassed": true,
  "databaseWrites": 2,
  "remainingBlockers": []
}
```
