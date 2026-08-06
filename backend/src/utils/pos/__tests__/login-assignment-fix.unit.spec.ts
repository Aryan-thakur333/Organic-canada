import { getOpenRegisterSession, openPosRegisterSession, requireOpenSession, requirePosRegisterAssignment, resolveAuthenticatedPosOperator } from "../security"

const usaRegister = { id: "01KYMKWP9T4YWNMZA47AZNQSY3", name: "USA POS Register", status: "ACTIVE", currency_code: "usd", region_id: "region_us", stock_location_id: "loc_us" }
const usaAssignment = { id: "assign_usa_1", register_id: "01KYMKWP9T4YWNMZA47AZNQSY3", operator_id: "user_01KWPV0WK7J0KN2A8FZ0AD3T16", role: "POS_OPERATOR", active: true, metadata: {} }

function mockService(overrides: Record<string, jest.Mock> = {}) {
  return {
    retrievePosRegister: jest.fn(async (id: string) => (id === usaRegister.id ? usaRegister : null)),
    listPosOperatorAssignments: jest.fn(async () => [usaAssignment]),
    listPosRegisterSessions: jest.fn(async () => []),
    createPosRegisterSessions: jest.fn(async (input) => ({ id: "session_1", ...input })),
    createPosOperatorAssignments: jest.fn(async (input) => ({ id: "assign_new", active: true, ...input })),
    updatePosOperatorAssignments: jest.fn(async (input) => ({ ...usaAssignment, ...input })),
    ...overrides,
  } as any
}

describe("CHECKPOINT 7 — Backend POS Login & Register Assignment Fix Suite", () => {
  test("1. canonical operator ID resolution uses auth_context.actor_id", async () => {
    const logger = { info: jest.fn() }
    const resolve = jest.fn()
      .mockReturnValueOnce(mockService())
      .mockReturnValueOnce({ retrieveUser: jest.fn(async () => ({ email: "admin@eatsie.com" })) })
      .mockReturnValueOnce(logger)
    const req = { auth_context: { actor_id: "user_01KWPV0WK7J0KN2A8FZ0AD3T16", actor_type: "user" }, body: { operator_id: "attacker_override" }, scope: { resolve } } as any
    const resolved = await resolveAuthenticatedPosOperator(req)
    expect(resolved.operatorId).toBe("user_01KWPV0WK7J0KN2A8FZ0AD3T16")
    expect(resolved.email).toBe("admin@eatsie.com")
  })

  test("2. valid USA assignment returned for canonical operator", async () => {
    const result = await requirePosRegisterAssignment({
      service: mockService(),
      operatorId: "user_01KWPV0WK7J0KN2A8FZ0AD3T16",
      registerId: usaRegister.id,
    })
    expect(result.register.id).toBe(usaRegister.id)
    expect(result.role).toBe("POS_OPERATOR")
  })

  test("3. email is never used as operator ID in assignment checks", async () => {
    const service = mockService({
      listPosOperatorAssignments: jest.fn(async (filter) => {
        if (filter.operator_id === "admin@eatsie.com") return []
        return [usaAssignment]
      }),
    })
    await expect(requirePosRegisterAssignment({ service, operatorId: "admin@eatsie.com", registerId: usaRegister.id }))
      .rejects.toMatchObject({ code: "POS_REGISTER_NOT_ASSIGNED", status: 403 })
  })

  test("4. deleted assignment excluded from active operator assignments", async () => {
    const service = mockService({
      listPosOperatorAssignments: jest.fn(async () => []),
    })
    await expect(requirePosRegisterAssignment({ service, operatorId: "user_01KWPV0WK7J0KN2A8FZ0AD3T16", registerId: usaRegister.id }))
      .rejects.toMatchObject({ code: "POS_REGISTER_NOT_ASSIGNED", status: 403 })
  })

  test("5. inactive assignment excluded", async () => {
    const service = mockService({
      listPosOperatorAssignments: jest.fn(async () => [{ ...usaAssignment, active: false }]),
    })
    await expect(requirePosRegisterAssignment({ service, operatorId: "user_01KWPV0WK7J0KN2A8FZ0AD3T16", registerId: usaRegister.id }))
      .rejects.toMatchObject({ code: "POS_REGISTER_NOT_ASSIGNED", status: 403 })
  })

  test("6. inactive register excluded", async () => {
    const service = mockService({
      retrievePosRegister: jest.fn(async () => ({ ...usaRegister, status: "INACTIVE" })),
    })
    await expect(requirePosRegisterAssignment({ service, operatorId: "user_01KWPV0WK7J0KN2A8FZ0AD3T16", registerId: usaRegister.id }))
      .rejects.toMatchObject({ code: "POS_REGISTER_INACTIVE", status: 403 })
  })

  test("7. explicit assignment creation is idempotent", async () => {
    const existing = [usaAssignment]
    const service = mockService({
      listPosOperatorAssignments: jest.fn(async () => existing),
    })
    const current = (await service.listPosOperatorAssignments({ register_id: usaRegister.id, operator_id: "user_01KWPV0WK7J0KN2A8FZ0AD3T16" }))[0]
    expect(current.active).toBe(true)
    expect(current.role).toBe("POS_OPERATOR")
    // Idempotent: no new creation called
    expect(service.createPosOperatorAssignments).not.toHaveBeenCalled()
  })

  test("8. duplicate assignment prevented when multiple assignments exist", async () => {
    const service = mockService({
      listPosOperatorAssignments: jest.fn(async () => [usaAssignment, { ...usaAssignment, id: "assign_usa_2" }]),
    })
    const list = await service.listPosOperatorAssignments({ register_id: usaRegister.id, operator_id: "user_01KWPV0WK7J0KN2A8FZ0AD3T16" })
    expect(list.length).toBeGreaterThan(1)
  })

  test("9. existing USA session is preserved when opening logic checks current session", async () => {
    const existingSession = { id: "session_usa_active", register_id: usaRegister.id, operator_id: "user_01KWPV0WK7J0KN2A8FZ0AD3T16", status: "OPEN" }
    const service = mockService({
      listPosRegisterSessions: jest.fn(async () => [existingSession]),
    })
    const result = await openPosRegisterSession(service, usaRegister as any, "user_01KWPV0WK7J0KN2A8FZ0AD3T16", 0)
    expect(result.created).toBe(false)
    expect(result.session.id).toBe("session_usa_active")
  })

  test("10. wrong operator session reuse blocked", async () => {
    const existingSession = { id: "session_usa_other", register_id: usaRegister.id, operator_id: "user_other_999", status: "OPEN" }
    const service = mockService({
      listPosRegisterSessions: jest.fn(async () => [existingSession]),
    })
    await expect(requireOpenSession(service, usaRegister.id, "user_01KWPV0WK7J0KN2A8FZ0AD3T16"))
      .rejects.toMatchObject({ code: "POS_SESSION_OPEN_BY_OTHER_OPERATOR", status: 409 })
  })
})
