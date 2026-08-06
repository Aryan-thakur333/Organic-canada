import { getOpenRegisterSession, isPosSessionOpen, openPosRegisterSession, requireOpenSession, requirePosRegisterAssignment, resolveAuthenticatedPosOperator, resolveCurrentPosContext } from "../security"

const register = { id: "reg_us", name: "USA POS", code: "US-01", status: "ACTIVE", currency_code: "usd", region_id: "region_us", stock_location_id: "loc_us", sales_channel_id: "sc_us" }
const assignment = { id: "assign_1", register_id: "reg_us", operator_id: "user_1", role: "POS_OPERATOR", active: true, metadata: {} }

function service(overrides: Record<string, jest.Mock> = {}) {
  return {
    retrievePosRegister: jest.fn(async () => register),
    listPosRegisters: jest.fn(async () => [register]),
    listPosOperatorAssignments: jest.fn(async () => [assignment]),
    listPosRegisterSessions: jest.fn(async () => []),
    createPosRegisterSessions: jest.fn(async (input) => ({ id: "session_1", ...input })),
    ...overrides,
  } as any
}

describe("POS operator, register, and session safety", () => {
  test("resolves the canonical operator only from the authenticated user context", async () => {
    const logger = { info: jest.fn() }
    const resolve = jest.fn()
      .mockReturnValueOnce(service())
      .mockReturnValueOnce({ retrieveUser: jest.fn(async () => ({ email: "operator@example.test" })) })
      .mockReturnValueOnce(logger)
    const req = { auth_context: { actor_id: "user_1", actor_type: "user" }, body: { operator_id: "attacker_supplied" }, scope: { resolve } } as any
    await expect(resolveAuthenticatedPosOperator(req)).resolves.toMatchObject({ operatorId: "user_1", email: "operator@example.test", role: "POS_OPERATOR", permissions: expect.arrayContaining(["POS_LOOKUP"]) })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('"operatorId":"user_1"'))
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("operator@example.test"))
  })
  test("uses the real assignment schema where auth actor_id equals assignment.operator_id", async () => {
    const pos = service()
    const logger = { info: jest.fn() }
    const resolve = jest.fn()
      .mockReturnValueOnce(pos)
      .mockReturnValueOnce({ retrieveUser: jest.fn(async () => ({ email: "operator@example.test" })) })
      .mockReturnValueOnce(logger)
    const req = { auth_context: { actor_id: "user_1", actor_type: "user" }, scope: { resolve } } as any

    await expect(resolveAuthenticatedPosOperator(req)).resolves.toMatchObject({
      actorId: "user_1",
      operatorId: "user_1",
      operatorUserId: "user_1",
      identitySource: "pos_operator_assignment.operator_id",
      role: "POS_OPERATOR",
    })
    expect(pos.listPosOperatorAssignments).toHaveBeenCalledWith({ operator_id: "user_1" }, { take: 100 })
  })
  test("classifies unavailable POS assignment service without masking the error", async () => {
    const logger = { info: jest.fn() }
    const unavailable = { retrievePosRegister: jest.fn() }
    const req = { auth_context: { actor_id: "user_1", actor_type: "user" }, scope: { resolve: jest.fn((token) => token === "pos" ? unavailable : logger) } } as any
    await expect(resolveAuthenticatedPosOperator(req)).rejects.toMatchObject({ code: "POS_OPERATOR_LOOKUP_UNAVAILABLE", status: 500 })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[POS_OPERATOR_LOOKUP_FAILED]"))
  })
  test("resolves one current context and rejects a session register no longer assigned", async () => {
    const pos = service({ listPosRegisterSessions: jest.fn(async () => [{ id: "session_1", operator_id: "user_1", register_id: "reg_us", status: "OPEN" }]) })
    const logger = { info: jest.fn() }
    const resolve = jest.fn()
      .mockReturnValueOnce(pos)
      .mockReturnValueOnce({ retrieveUser: jest.fn(async () => ({ email: "operator@example.test" })) })
      .mockReturnValueOnce(logger)
      .mockReturnValueOnce(pos)
      .mockReturnValueOnce(logger)
    const req = { auth_context: { actor_id: "user_1", actor_type: "user" }, scope: { resolve } } as any
    await expect(resolveCurrentPosContext(req, "reg_us")).resolves.toMatchObject({ session: { id: "session_1" }, activeRegister: { id: "reg_us" } })
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("[POS_CONTEXT_RESOLVED]"))
  })
  test("rejects requests without an authenticated user actor", async () => {
    await expect(resolveAuthenticatedPosOperator({ auth_context: {}, scope: { resolve: jest.fn() } } as any)).rejects.toMatchObject({ code: "POS_UNAUTHENTICATED", status: 401 })
  })
  test("accepts an active exact operator/register assignment", async () => {
    await expect(requirePosRegisterAssignment({ service: service(), operatorId: "user_1", registerId: "reg_us" })).resolves.toMatchObject({ role: "POS_OPERATOR", register: { id: "reg_us" } })
  })
  test("distinguishes missing, inactive, and scope-mismatched assignments", async () => {
    await expect(requirePosRegisterAssignment({ service: service({ listPosOperatorAssignments: jest.fn(async () => []) }), operatorId: "user_1", registerId: "reg_us" })).rejects.toMatchObject({ code: "POS_REGISTER_NOT_ASSIGNED", status: 403 })
    await expect(requirePosRegisterAssignment({ service: service({ listPosOperatorAssignments: jest.fn(async () => [{ ...assignment, active: false }]) }), operatorId: "user_1", registerId: "reg_us" })).rejects.toMatchObject({ code: "POS_REGISTER_NOT_ASSIGNED", status: 403 })
    await expect(requirePosRegisterAssignment({ service: service({ listPosOperatorAssignments: jest.fn(async () => [{ ...assignment, metadata: { stock_location_id: "loc_ca" } }]) }), operatorId: "user_1", registerId: "reg_us" })).rejects.toMatchObject({ code: "POS_REGISTER_SCOPE_MISMATCH", status: 403 })
  })
  test("distinguishes missing and inactive registers", async () => {
    await expect(requirePosRegisterAssignment({ service: service({ listPosOperatorAssignments: jest.fn(async () => [{ ...assignment, register_id: "missing" }]), retrievePosRegister: jest.fn(async () => { throw new Error("missing") }) }), operatorId: "user_1", registerId: "missing" })).rejects.toMatchObject({ code: "POS_REGISTER_INACTIVE", status: 403 })
    await expect(requirePosRegisterAssignment({ service: service({ retrievePosRegister: jest.fn(async () => ({ ...register, status: "inactive" })) }), operatorId: "user_1", registerId: "reg_us" })).rejects.toMatchObject({ code: "POS_REGISTER_INACTIVE", status: 403 })
  })
  test("GET-session helper returns null while the required-session guard returns a precise conflict", async () => {
    const pos = service()
    await expect(getOpenRegisterSession(pos, "reg_us")).resolves.toBeNull()
    await expect(requireOpenSession(pos, "reg_us", "user_1")).rejects.toMatchObject({ code: "POS_SESSION_NOT_OPEN", status: 409 })
  })
  test("uses one case-insensitive open-session predicate for bootstrap, cart, and checkout", async () => {
    const session = { id: "session_open", register_id: "reg_us", operator_id: "user_1", status: "open" }
    expect(isPosSessionOpen(session as any)).toBe(true)
    await expect(getOpenRegisterSession(service({ listPosRegisterSessions: jest.fn(async () => [session]) }), "reg_us", "user_1")).resolves.toMatchObject({ id: "session_open" })
  })
  test("detects duplicate open register-session records", async () => {
    const pos = service({ listPosRegisterSessions: jest.fn(async () => [
      { id: "session_1", register_id: "reg_us", operator_id: "user_1", status: "OPEN" },
      { id: "session_2", register_id: "reg_us", operator_id: "user_2", status: "OPEN" },
    ]) })
    await expect(getOpenRegisterSession(pos, "reg_us")).rejects.toMatchObject({ code: "POS_SESSION_ALREADY_OPEN", status: 409 })
  })
  test("blocks a register session owned by another operator", async () => {
    const pos = service({ listPosRegisterSessions: jest.fn(async () => [{ id: "session_other", register_id: "reg_us", operator_id: "user_2", status: "OPEN" }]) })
    await expect(requireOpenSession(pos, "reg_us", "user_1")).rejects.toMatchObject({ code: "POS_SESSION_OPEN_BY_OTHER_OPERATOR", status: 409 })
  })
  test("same-operator repeat open is idempotent and performs no create", async () => {
    const create = jest.fn()
    const pos = service({ listPosRegisterSessions: jest.fn(async (filter) => filter.register_id ? [{ id: "session_1", register_id: "reg_us", operator_id: "user_1", status: "OPEN" }] : []), createPosRegisterSessions: create })
    await expect(openPosRegisterSession(pos, register as any, "user_1", 0)).resolves.toMatchObject({ created: false, session: { id: "session_1" } })
    expect(create).not.toHaveBeenCalled()
  })
  test("prevents an operator from opening an incompatible second register", async () => {
    const pos = service({ listPosRegisterSessions: jest.fn(async (filter) => filter.register_id ? [] : [{ id: "session_other", register_id: "reg_ca", operator_id: "user_1", status: "OPEN" }]) })
    await expect(openPosRegisterSession(pos, register as any, "user_1", 0)).rejects.toMatchObject({
      code: "POS_OPERATOR_SESSION_ALREADY_OPEN",
      status: 409,
      details: {
        session: { id: "session_other", register_id: "reg_ca", operator_id: "user_1", status: "OPEN" },
        register: { id: "reg_us" },
      },
    })
  })
  test("creates one session when no compatible session exists", async () => {
    const pos = service()
    await expect(openPosRegisterSession(pos, register as any, "user_1", 0)).resolves.toMatchObject({ created: true, session: { id: "session_1", operator_id: "user_1" } })
    expect(pos.createPosRegisterSessions).toHaveBeenCalledTimes(1)
  })
  test("a closed historical session permits a future valid session", async () => {
    const historical = { id: "session_closed", register_id: "reg_ca", operator_id: "user_1", status: "CLOSED" }
    const pos = service({
      listPosRegisterSessions: jest.fn(async (filter) => [historical].filter((session) =>
        (!filter.status || session.status === filter.status)
        && (!filter.register_id || session.register_id === filter.register_id)
        && (!filter.operator_id || session.operator_id === filter.operator_id)
      )),
    })
    await expect(openPosRegisterSession(pos, register as any, "user_1", 0)).resolves.toMatchObject({ created: true, session: { operator_id: "user_1", register_id: "reg_us" } })
    expect(pos.createPosRegisterSessions).toHaveBeenCalledTimes(1)
  })
  test("maps a concurrent second-register race to the operator conflict contract", async () => {
    let operatorQueries = 0
    const pos = service({
      listPosRegisterSessions: jest.fn(async (filter) => {
        if (filter.register_id) return []
        operatorQueries += 1
        return operatorQueries === 1 ? [] : [{ id: "session_other", register_id: "reg_ca", operator_id: "user_1", status: "OPEN" }]
      }),
      createPosRegisterSessions: jest.fn(async () => { throw new Error("unique operator session") }),
    })
    await expect(openPosRegisterSession(pos, register as any, "user_1", 0)).rejects.toMatchObject({ code: "POS_OPERATOR_SESSION_ALREADY_OPEN", status: 409 })
  })
})
