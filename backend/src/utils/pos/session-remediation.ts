export const STALE_SESSION_EVENT = "POS_STALE_SESSION_CLOSED"

type RecordLike = Record<string, any> & { id: string }
type SharedContext = { transactionManager?: unknown } | undefined

export type SessionRemediationService = {
  retrievePosRegisterSession(id: string, config?: Record<string, unknown>, context?: SharedContext): Promise<RecordLike>
  retrievePosRegister(id: string, config?: Record<string, unknown>, context?: SharedContext): Promise<RecordLike>
  listPosTransactions(filter?: Record<string, unknown>, config?: Record<string, unknown>, context?: SharedContext): Promise<RecordLike[]>
  listPosReceipts(filter?: Record<string, unknown>, config?: Record<string, unknown>, context?: SharedContext): Promise<RecordLike[]>
  listPosPayments(filter?: Record<string, unknown>, config?: Record<string, unknown>, context?: SharedContext): Promise<RecordLike[]>
  listPosReturns(filter?: Record<string, unknown>, config?: Record<string, unknown>, context?: SharedContext): Promise<RecordLike[]>
  listPosExchanges(filter?: Record<string, unknown>, config?: Record<string, unknown>, context?: SharedContext): Promise<RecordLike[]>
  listPosCashMovements(filter?: Record<string, unknown>, config?: Record<string, unknown>, context?: SharedContext): Promise<RecordLike[]>
  listPosAuditEvents(filter?: Record<string, unknown>, config?: Record<string, unknown>, context?: SharedContext): Promise<RecordLike[]>
  updatePosRegisterSessions(data: Record<string, unknown>, context?: SharedContext): Promise<RecordLike>
  createPosAuditEvents(data: Record<string, unknown>, context?: SharedContext): Promise<RecordLike>
}

export type RemediationApproval = {
  sessionId: string
  keepSessionId: string
  reason: string
  approvedBy: string
  approvalReference: string
  backupReference: string
}

const amount = (value: unknown) => Number(value || 0)
const onlyZeroOpeningFloat = (movements: RecordLike[]) => movements.length === 1
  && movements[0].movement_type === "OPENING_FLOAT"
  && amount(movements[0].amount_minor) === 0

async function inspectOne(service: SessionRemediationService, sessionId: string, context?: SharedContext) {
  const session = await service.retrievePosRegisterSession(sessionId, {}, context)
  const register = await service.retrievePosRegister(String(session.register_id), {}, context)
  const transactions = await service.listPosTransactions({ session_id: sessionId }, { take: 10000 }, context)
  const transactionIds = transactions.map((entry) => entry.id)
  const movements = await service.listPosCashMovements({ register_session_id: sessionId }, { take: 10000 }, context)
  const [receipts, payments, returns] = transactionIds.length
    ? await Promise.all([
        service.listPosReceipts({ transaction_id: transactionIds }, { take: 10000 }, context),
        service.listPosPayments({ transaction_id: transactionIds }, { take: 10000 }, context),
        service.listPosReturns({ transaction_id: transactionIds }, { take: 10000 }, context),
      ])
    : [[], [], []]
  const returnIds = returns.map((entry) => entry.id)
  const exchanges = returnIds.length
    ? await service.listPosExchanges({ return_id: returnIds }, { take: 10000 }, context)
    : []
  return {
    session,
    register,
    transactions,
    receipts,
    payments,
    returns,
    exchanges,
    movements,
    cashMovementTotal: movements.reduce((sum, entry) => sum + amount(entry.amount_minor), 0),
    hasOrder: transactions.some((entry) => Boolean(entry.order_id || entry.draft_order_id)),
    hasPendingReconciliation: transactions.some((entry) => ["DRAFT", "PENDING"].includes(String(entry.status)))
      || payments.some((entry) => ["PENDING", "AUTHORIZED"].includes(String(entry.status))),
  }
}

export async function inspectSessionRemediationPair(
  service: SessionRemediationService,
  sessionId: string,
  keepSessionId: string,
  context?: SharedContext
) {
  if (!sessionId || !keepSessionId || sessionId === keepSessionId) throw new Error("Distinct target and keep session IDs are required")
  const [target, keep, auditEvents] = await Promise.all([
    inspectOne(service, sessionId, context),
    inspectOne(service, keepSessionId, context),
    service.listPosAuditEvents({ session_id: sessionId, event_type: STALE_SESSION_EVENT }, { take: 100 }, context),
  ])
  return {
    target,
    keep,
    auditEvents,
    sameOperator: target.session.operator_id === keep.session.operator_id,
    differentRegisters: target.session.register_id !== keep.session.register_id,
  }
}

export function assertSafeOpenRemediationSnapshot(snapshot: Awaited<ReturnType<typeof inspectSessionRemediationPair>>) {
  const { target, keep } = snapshot
  const safe = target.session.status === "OPEN"
    && keep.session.status === "OPEN"
    && snapshot.sameOperator
    && snapshot.differentRegisters
    && target.transactions.length === 0
    && target.receipts.length === 0
    && target.payments.length === 0
    && target.returns.length === 0
    && target.exchanges.length === 0
    && !target.hasOrder
    && !target.hasPendingReconciliation
    && onlyZeroOpeningFloat(target.movements)
    && target.cashMovementTotal === 0
    && amount(target.session.opening_cash_minor) === 0
    && amount(target.session.expected_cash_minor) === 0
    && target.session.counted_cash_minor == null
    && target.session.cash_difference_minor == null
    && keep.transactions.length === 0
    && keep.receipts.length === 0
    && keep.payments.length === 0
    && keep.returns.length === 0
    && keep.exchanges.length === 0
    && onlyZeroOpeningFloat(keep.movements)
    && keep.cashMovementTotal === 0
  if (!safe) throw new Error("POS session remediation snapshot is stale or contains activity")
  if (snapshot.auditEvents.length) throw new Error("An existing stale-session closure audit event conflicts with an OPEN target")
  return snapshot
}

export function assertSafeClosedRemediationSnapshot(snapshot: Awaited<ReturnType<typeof inspectSessionRemediationPair>>) {
  const { target, keep } = snapshot
  const safe = target.session.status === "CLOSED"
    && Boolean(target.session.closed_at)
    && keep.session.status === "OPEN"
    && snapshot.sameOperator
    && snapshot.differentRegisters
    && target.transactions.length === 0
    && target.receipts.length === 0
    && target.payments.length === 0
    && target.returns.length === 0
    && target.exchanges.length === 0
    && !target.hasOrder
    && !target.hasPendingReconciliation
    && onlyZeroOpeningFloat(target.movements)
    && target.cashMovementTotal === 0
    && amount(target.session.opening_cash_minor) === 0
    && amount(target.session.expected_cash_minor) === 0
    && amount(target.session.counted_cash_minor) === 0
    && amount(target.session.cash_difference_minor) === 0
    && snapshot.auditEvents.length === 1
  if (!safe) throw new Error("Closed target does not match the safe idempotent remediation state")
  return snapshot
}

function validateApproval(input: RemediationApproval) {
  if (!input.reason.trim()) throw new Error("Remediation reason is required")
  if (!input.approvedBy.trim() || !input.approvalReference.trim()) throw new Error("Explicit remediation approval is required")
  if (!input.backupReference.trim()) throw new Error("A verified backup reference is required")
}

function matchingAuditEvents(snapshot: Awaited<ReturnType<typeof inspectSessionRemediationPair>>, input: RemediationApproval) {
  return snapshot.auditEvents.filter((event) => {
    const metadata = event.metadata || {}
    return metadata.session_id === input.sessionId
      && metadata.kept_session_id === input.keepSessionId
      && metadata.reason === input.reason
      && metadata.approved_by === input.approvedBy
      && metadata.approval_reference === input.approvalReference
      && metadata.backup_reference === input.backupReference
  })
}

export async function closeApprovedStaleEmptySession({
  service,
  transaction,
  input,
}: {
  service: SessionRemediationService
  transaction: <T>(work: (context: SharedContext) => Promise<T>) => Promise<T>
  input: RemediationApproval
}) {
  validateApproval(input)
  const before = await inspectSessionRemediationPair(service, input.sessionId, input.keepSessionId)
  if (before.target.session.status === "CLOSED") {
    assertSafeClosedRemediationSnapshot(before)
    const matching = matchingAuditEvents(before, input)
    if (matching.length !== 1) {
      throw new Error("Closed target does not match the approved idempotent remediation state")
    }
    return { alreadyClosed: true, additionalWrites: 0, duplicateAuditEvent: false, before, after: before }
  }
  assertSafeOpenRemediationSnapshot(before)

  await transaction(async (context) => {
    const fresh = assertSafeOpenRemediationSnapshot(
      await inspectSessionRemediationPair(service, input.sessionId, input.keepSessionId, context)
    )
    const metadata = {
      ...(fresh.target.session.metadata || {}),
      remediation: {
        reason: input.reason,
        approved_by: input.approvedBy,
        approval_reference: input.approvalReference,
        backup_reference: input.backupReference,
        kept_session_id: input.keepSessionId,
      },
    }
    await service.updatePosRegisterSessions({
      id: input.sessionId,
      status: "CLOSED",
      closed_at: new Date(),
      expected_cash_minor: 0,
      counted_cash_minor: 0,
      cash_difference_minor: 0,
      metadata,
    }, context)
    await service.createPosAuditEvents({
      register_id: fresh.target.session.register_id,
      session_id: input.sessionId,
      operator_id: fresh.target.session.operator_id,
      event_type: STALE_SESSION_EVENT,
      message: "Approved stale empty duplicate POS session closed",
      metadata: {
        session_id: input.sessionId,
        kept_session_id: input.keepSessionId,
        reason: input.reason,
        approved_by: input.approvedBy,
        approval_reference: input.approvalReference,
        backup_reference: input.backupReference,
      },
    }, context)
  })

  const after = await inspectSessionRemediationPair(service, input.sessionId, input.keepSessionId)
  const matching = matchingAuditEvents(after, input)
  if (after.target.session.status !== "CLOSED"
    || !after.target.session.closed_at
    || after.keep.session.status !== "OPEN"
    || matching.length !== 1
    || after.auditEvents.length !== 1) {
    throw new Error("Post-closure POS session verification failed")
  }
  return { alreadyClosed: false, additionalWrites: 2, duplicateAuditEvent: false, before, after }
}
