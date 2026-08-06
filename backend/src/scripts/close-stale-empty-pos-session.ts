import type { ExecArgs } from "@medusajs/framework/types"
import * as fs from "fs"
import * as path from "path"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import {
  assertSafeClosedRemediationSnapshot,
  assertSafeOpenRemediationSnapshot,
  closeApprovedStaleEmptySession,
  inspectSessionRemediationPair,
  type RemediationApproval,
} from "../utils/pos/session-remediation"

const EXPECTED_OPERATOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"
const EXPECTED_TARGET_SESSION_ID = "01KYMWH2QWPDXDCMN5DS241F0X"
const EXPECTED_KEEP_SESSION_ID = "01KYP39VH0W0JKFYZMNNYPA6A9"
const EXPECTED_TARGET_REGISTER_ID = "01KYMKWP9FAB13SGT4Z5XTW6R2"
const EXPECTED_KEEP_REGISTER_ID = "01KYMKWP9T4YWNMZA47AZNQSY3"

function argumentsMap(argumentsList: string[]) {
  const flags = new Set(
    argumentsList
      .filter((entry) => !entry.includes("="))
      .map((entry) => entry.startsWith("--") ? entry : `--${entry}`)
  )
  const values = new Map<string, string>()
  for (const rawEntry of argumentsList.filter((entry) => entry.includes("="))) {
    const entry = rawEntry.startsWith("--") ? rawEntry.slice(2) : rawEntry
    const index = entry.indexOf("=")
    values.set(entry.slice(0, index), entry.slice(index + 1))
  }
  return { flags, values }
}

function backupEvidence(reference: string) {
  if (!reference || path.basename(reference) !== reference || !reference.endsWith(".backup")) throw new Error("A safe backup filename is required")
  const backupRoot = path.resolve(process.cwd(), "..", "backups")
  const backupPath = path.resolve(backupRoot, reference)
  if (!backupPath.startsWith(backupRoot + path.sep) || !fs.existsSync(backupPath)) throw new Error("Referenced backup does not exist in the project backup directory")
  const stat = fs.statSync(backupPath)
  const descriptor = fs.openSync(backupPath, "r")
  const headerBuffer = Buffer.alloc(5)
  try {
    fs.readSync(descriptor, headerBuffer, 0, headerBuffer.length, 0)
  } finally {
    fs.closeSync(descriptor)
  }
  const header = headerBuffer.toString("ascii")
  const ageMs = Date.now() - stat.mtimeMs
  if (!stat.isFile() || stat.size <= 0 || header !== "PGDMP" || ageMs < 0 || ageMs > 4 * 60 * 60 * 1000) {
    throw new Error("Referenced backup is empty, invalid, or stale")
  }
  return { backupPath, backupSize: stat.size, pgdmpHeaderValid: true }
}

function assertExpectedIdentity(snapshot: Awaited<ReturnType<typeof inspectSessionRemediationPair>>) {
  const current = snapshot.target.session.operator_id === EXPECTED_OPERATOR_ID
    && snapshot.keep.session.operator_id === EXPECTED_OPERATOR_ID
    && snapshot.target.session.id === EXPECTED_TARGET_SESSION_ID
    && snapshot.keep.session.id === EXPECTED_KEEP_SESSION_ID
    && snapshot.target.session.register_id === EXPECTED_TARGET_REGISTER_ID
    && snapshot.keep.session.register_id === EXPECTED_KEEP_REGISTER_ID
  if (!current) throw new Error("Session IDs no longer match the approved operator/register snapshot")
}

function precheckMarker(snapshot: Awaited<ReturnType<typeof inspectSessionRemediationPair>>) {
  assertExpectedIdentity(snapshot)
  assertSafeOpenRemediationSnapshot(snapshot)
  return {
    operatorId: EXPECTED_OPERATOR_ID,
    keepSessionId: snapshot.keep.session.id,
    closeSessionId: snapshot.target.session.id,
    keepSessionStillOpen: snapshot.keep.session.status === "OPEN",
    closeSessionStillOpen: snapshot.target.session.status === "OPEN",
    closeSessionTransactions: snapshot.target.transactions.length,
    closeSessionReceipts: snapshot.target.receipts.length,
    closeSessionCashMovementCount: snapshot.target.movements.length,
    closeSessionCashMovementTotal: snapshot.target.cashMovementTotal,
    snapshotCurrent: true,
    databaseWrites: 0,
  }
}

function idempotentPrecheckMarker(snapshot: Awaited<ReturnType<typeof inspectSessionRemediationPair>>) {
  assertExpectedIdentity(snapshot)
  assertSafeClosedRemediationSnapshot(snapshot)
  return {
    operatorId: EXPECTED_OPERATOR_ID,
    keepSessionId: snapshot.keep.session.id,
    closeSessionId: snapshot.target.session.id,
    keepSessionStillOpen: snapshot.keep.session.status === "OPEN",
    closeSessionStillOpen: false,
    alreadyClosedCandidate: snapshot.target.session.status === "CLOSED",
    snapshotCurrent: snapshot.target.session.status === "CLOSED" && snapshot.keep.session.status === "OPEN",
    databaseWrites: 0,
  }
}

export default async function closeStaleEmptyPosSession({ container, args }: ExecArgs) {
  const { flags, values } = argumentsMap(args || [])
  const apply = flags.has("--apply")
  const explicitDryRun = flags.has("--dry-run")
  const precheckOnly = flags.has("--precheck")
  if ([apply, explicitDryRun, precheckOnly].filter(Boolean).length > 1) throw new Error("Choose only one of --precheck, --dry-run, or --apply")
  const input: RemediationApproval = {
    sessionId: values.get("session-id") || "",
    keepSessionId: values.get("keep-session-id") || "",
    reason: values.get("reason") || "",
    approvedBy: values.get("approved-by") || "",
    approvalReference: values.get("approval-reference") || "",
    backupReference: values.get("backup-reference") || "",
  }
  if (!input.sessionId || !input.keepSessionId) throw new Error("--session-id and --keep-session-id are required")
  if (input.sessionId !== EXPECTED_TARGET_SESSION_ID || input.keepSessionId !== EXPECTED_KEEP_SESSION_ID) {
    throw new Error("This remediation script is locked to the approved target and keep session IDs")
  }
  const service = container.resolve(POS_MODULE) as unknown as PosModuleService
  const snapshot = await inspectSessionRemediationPair(service as any, input.sessionId, input.keepSessionId)
  console.log("[POS_SESSION_REMEDIATION_PRECHECK]")
  if (snapshot.target.session.status === "OPEN") {
    console.log(JSON.stringify(precheckMarker(snapshot), null, 2))
  } else if (apply && snapshot.target.session.status === "CLOSED") {
    console.log(JSON.stringify(idempotentPrecheckMarker(snapshot), null, 2))
  } else {
    throw new Error("Target session is not OPEN; only an approved --apply retry may verify idempotence")
  }
  if (precheckOnly) return

  if (!input.reason || !input.approvedBy || !input.approvalReference) throw new Error("Reason, approved-by, and approval-reference are required")
  const backup = input.backupReference ? backupEvidence(input.backupReference) : null
  if (apply && !backup) throw new Error("--apply requires a verified --backup-reference")
  if (!apply) {
    console.log("[POS_STALE_SESSION_CLOSE_DRY_RUN]")
    console.log(JSON.stringify({
      targetSessionId: input.sessionId,
      keepSessionId: input.keepSessionId,
      targetRegister: snapshot.target.register.name,
      keepRegister: snapshot.keep.register.name,
      plannedStatus: "CLOSED",
      transactions: snapshot.target.transactions.length,
      receipts: snapshot.target.receipts.length,
      cashMovements: snapshot.target.movements.length,
      cashMovementTotal: snapshot.target.cashMovementTotal,
      expectedCashMinor: 0,
      countedCashMinor: 0,
      cashDifferenceMinor: 0,
      databaseWrites: 0,
      passed: true,
    }, null, 2))
    return
  }

  // Custom module managers live in the module service's child container, not the
  // root Medusa script container. Reusing it keeps both service writes atomic.
  const manager = (service as any).__container__?.manager
  if (!manager) throw new Error("POS module database transaction manager is unavailable")
  const transactionMethod = manager.transaction ?? manager.transactional
  if (typeof transactionMethod !== "function") throw new Error("Database transaction manager is unavailable")
  const result = await closeApprovedStaleEmptySession({
    service: service as any,
    input,
    transaction: (work) => transactionMethod.call(
      manager,
      async (transactionManager: unknown) => work({ transactionManager }),
      { isolationLevel: "serializable" }
    ),
  })
  if (result.alreadyClosed) {
    console.log("[POS_STALE_SESSION_CLOSE_IDEMPOTENCE]")
    console.log(JSON.stringify({
      alreadyClosed: true,
      additionalWrites: 0,
      duplicateAuditEvent: result.duplicateAuditEvent,
      passed: true,
    }, null, 2))
    return
  }
  console.log("[POS_STALE_SESSION_CLOSE_APPLY]")
  console.log(JSON.stringify({
    targetSessionId: input.sessionId,
    previousStatus: result.before.target.session.status,
    newStatus: result.after.target.session.status,
    closedAtSet: Boolean(result.after.target.session.closed_at),
    usaSessionStillOpen: result.after.keep.session.status === "OPEN",
    auditEventCreated: result.after.auditEvents.length === 1,
    databaseWrites: result.additionalWrites,
    passed: true,
  }, null, 2))
}
