import * as fs from "fs"
import * as path from "path"
import {
  closeApprovedStaleEmptySession,
  inspectSessionRemediationPair,
  STALE_SESSION_EVENT,
} from "../session-remediation"

const targetId = "session_ca"
const keepId = "session_us"
const approval = {
  sessionId: targetId,
  keepSessionId: keepId,
  reason: "Duplicate stale empty POS session blocking uniqueness migration",
  approvedBy: "Aryan Thakur",
  approvalReference: "POS-SESSION-DEDUP-20260729-001",
  backupReference: "before-pos-session-dedup.backup",
}

function fixture(overrides: { target?: Record<string, unknown>; keep?: Record<string, unknown>; movements?: any[]; transactions?: any[]; auditEvents?: any[] } = {}) {
  const sessions: Record<string, any> = {
    [targetId]: { id: targetId, register_id: "register_ca", operator_id: "operator_1", status: "OPEN", opening_cash_minor: 0, expected_cash_minor: 0, counted_cash_minor: null, cash_difference_minor: null, metadata: {}, ...overrides.target },
    [keepId]: { id: keepId, register_id: "register_us", operator_id: "operator_1", status: "OPEN", opening_cash_minor: 0, expected_cash_minor: 0, counted_cash_minor: null, cash_difference_minor: null, metadata: {}, ...overrides.keep },
  }
  const auditEvents = [...(overrides.auditEvents || [])]
  const movements = overrides.movements || [
    { id: "movement_ca", register_session_id: targetId, movement_type: "OPENING_FLOAT", amount_minor: 0 },
    { id: "movement_us", register_session_id: keepId, movement_type: "OPENING_FLOAT", amount_minor: 0 },
  ]
  const service: any = {
    retrievePosRegisterSession: jest.fn(async (id) => sessions[id]),
    retrievePosRegister: jest.fn(async (id) => ({ id, name: id === "register_ca" ? "Canada POS Register" : "USA POS Register" })),
    listPosTransactions: jest.fn(async (filter) => (overrides.transactions || []).filter((entry) => entry.session_id === filter.session_id)),
    listPosReceipts: jest.fn(async () => []),
    listPosPayments: jest.fn(async () => []),
    listPosReturns: jest.fn(async () => []),
    listPosExchanges: jest.fn(async () => []),
    listPosCashMovements: jest.fn(async (filter) => movements.filter((entry) => entry.register_session_id === filter.register_session_id)),
    listPosAuditEvents: jest.fn(async (filter) => auditEvents.filter((entry) => entry.session_id === filter.session_id && entry.event_type === filter.event_type)),
    updatePosRegisterSessions: jest.fn(async (data) => Object.assign(sessions[data.id], data)),
    createPosAuditEvents: jest.fn(async (data) => {
      const event = { id: `audit_${auditEvents.length + 1}`, ...data }
      auditEvents.push(event)
      return event
    }),
    deletePosRegisterSessions: jest.fn(),
  }
  return { service, sessions, auditEvents, transaction: async (work: any) => work({ transactionManager: {} }) }
}

describe("approved stale empty POS session remediation", () => {
  test("closes only the stale empty target and creates one audit event", async () => {
    const data = fixture()
    const result = await closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })
    expect(result).toMatchObject({ alreadyClosed: false, additionalWrites: 2 })
    expect(data.sessions[targetId]).toMatchObject({ status: "CLOSED", expected_cash_minor: 0, counted_cash_minor: 0, cash_difference_minor: 0 })
    expect(data.sessions[targetId].closed_at).toBeInstanceOf(Date)
    expect(data.sessions[keepId].status).toBe("OPEN")
    expect(data.service.createPosAuditEvents).toHaveBeenCalledTimes(1)
    expect(data.auditEvents[0]).toMatchObject({ event_type: STALE_SESSION_EVENT, metadata: { approval_reference: approval.approvalReference } })
    expect(data.service.deletePosRegisterSessions).not.toHaveBeenCalled()
  })
  test("blocks a target with transactions", async () => {
    const data = fixture({ transactions: [{ id: "tx_1", session_id: targetId, status: "COMPLETED" }] })
    await expect(closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })).rejects.toThrow("snapshot is stale")
    expect(data.service.updatePosRegisterSessions).not.toHaveBeenCalled()
  })
  test("blocks non-zero or extra cash movement activity", async () => {
    const data = fixture({ movements: [
      { id: "movement_ca", register_session_id: targetId, movement_type: "OPENING_FLOAT", amount_minor: 1 },
      { id: "movement_us", register_session_id: keepId, movement_type: "OPENING_FLOAT", amount_minor: 0 },
    ] })
    await expect(closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })).rejects.toThrow("snapshot is stale")
  })
  test.each([
    [{ approvedBy: "" }, "approval"],
    [{ backupReference: "" }, "backup"],
  ])("blocks missing approval or backup evidence", async (change, message) => {
    const data = fixture()
    await expect(closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: { ...approval, ...change } })).rejects.toThrow(message)
  })
  test("blocks a stale keep-session snapshot", async () => {
    const data = fixture({ keep: { status: "CLOSED" } })
    await expect(closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })).rejects.toThrow("snapshot is stale")
  })
  test("second apply is exactly idempotent", async () => {
    const data = fixture()
    await closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })
    data.service.updatePosRegisterSessions.mockClear()
    data.service.createPosAuditEvents.mockClear()
    const second = await closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })
    expect(second).toMatchObject({ alreadyClosed: true, additionalWrites: 0, duplicateAuditEvent: false })
    expect(data.service.updatePosRegisterSessions).not.toHaveBeenCalled()
    expect(data.service.createPosAuditEvents).not.toHaveBeenCalled()
  })
  test("an idempotence retry blocks if activity appears on the closed target", async () => {
    const transactions: any[] = []
    const data = fixture({ transactions })
    await closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })
    transactions.push({ id: "tx_late", session_id: targetId, status: "COMPLETED" })
    data.service.updatePosRegisterSessions.mockClear()
    data.service.createPosAuditEvents.mockClear()
    await expect(closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })).rejects.toThrow("safe idempotent")
    expect(data.service.updatePosRegisterSessions).not.toHaveBeenCalled()
    expect(data.service.createPosAuditEvents).not.toHaveBeenCalled()
  })
  test("a pre-closed target without the approved audit is rejected", async () => {
    const data = fixture({ target: { status: "CLOSED", closed_at: new Date(), counted_cash_minor: 0, cash_difference_minor: 0 } })
    await expect(closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })).rejects.toThrow("does not match")
  })
  test("inspection preserves all cash movement rows", async () => {
    const data = fixture()
    const before = await inspectSessionRemediationPair(data.service, targetId, keepId)
    await closeApprovedStaleEmptySession({ service: data.service, transaction: data.transaction, input: approval })
    const after = await inspectSessionRemediationPair(data.service, targetId, keepId)
    expect(after.target.movements).toEqual(before.target.movements)
    expect(data.service.deletePosRegisterSessions).not.toHaveBeenCalled()
  })
  test("migration defines the required unique partial operator index", () => {
    const migration = fs.readFileSync(path.resolve(process.cwd(), "src/modules/pos/migrations/Migration20260729010000.ts"), "utf8")
    expect(migration).toContain("IDX_pos_one_open_session_per_operator")
    expect(migration).toContain('unique index')
    expect(migration).toContain('("operator_id")')
    expect(migration).toContain('"deleted_at" is null')
    expect(migration).toContain('"status" = \'OPEN\'')
  })
})
