import { GET } from "../pos/bootstrap/route"
import { POS_MODULE } from "../../modules/pos"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const canada = { id: "register_ca", name: "Canada POS Register", code: "CA-POS-01", status: "ACTIVE", currency_code: "cad", sales_channel_id: "sc_ca", stock_location_id: "sl_ca" }
const usa = { id: "register_us", name: "USA POS Register", code: "US-POS-01", status: "active", currency_code: "usd", sales_channel_id: "sc_us", stock_location_id: "sl_us" }

function requestWith(assignments: any[], sessions: any[] = [], actorId = "user_1") {
  const service = {
    listPosOperatorAssignments: jest.fn(async () => assignments),
    listPosRegisters: jest.fn(async () => [canada, usa]),
    retrievePosRegister: jest.fn(async (id: string) => [canada, usa].find((register) => register.id === id)),
    listPosRegisterSessions: jest.fn(async () => sessions),
  }
  const logger = { info: jest.fn() }
  const req = {
    auth_context: { actor_id: actorId, actor_type: "user" },
    scope: { resolve: (token: unknown) => token === POS_MODULE ? service : token === Modules.USER ? { retrieveUser: async () => ({ email: "operator@example.test" }) } : token === ContainerRegistrationKeys.LOGGER ? logger : null },
  } as any
  return { req, logger }
}

// Realistic mock: listPosOperatorAssignments respects the operator_id filter,
// exactly like the Medusa module query. This is the correct shape for
// cross-account tests where two different admin actors coexist in the database.
function requestWithRealistic(assignmentsByOperator: Record<string, any[]>, sessions: any[] = [], actorId = "user_1") {
  const service = {
    listPosOperatorAssignments: jest.fn(async (filter: any) => (assignmentsByOperator[filter?.operator_id] || [])),
    listPosRegisters: jest.fn(async () => [canada, usa]),
    retrievePosRegister: jest.fn(async (id: string) => [canada, usa].find((register) => register.id === id)),
    listPosRegisterSessions: jest.fn(async () => sessions),
  }
  const logger = { info: jest.fn() }
  const req = {
    auth_context: { actor_id: actorId, actor_type: "user" },
    scope: { resolve: (token: unknown) => token === POS_MODULE ? service : token === Modules.USER ? { retrieveUser: async () => ({ email: "operator@example.test" }) } : token === ContainerRegistrationKeys.LOGGER ? logger : null },
  } as any
  return { req, logger }
}

describe("POS bootstrap contract", () => {
  test("returns both active assignments and no session atomically", async () => {
    const { req } = requestWith([
      { id: "assignment_ca", operator_id: "user_1", register_id: canada.id, active: true, role: "POS_OPERATOR" },
      { id: "assignment_us", operator_id: "user_1", register_id: usa.id, active: true, role: "POS_OPERATOR" },
    ])
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader: jest.fn() } as any
    await GET(req, res)
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store, private")
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      authenticated: true,
      operator: expect.objectContaining({ id: "user_1", actor_id: "user_1", user_id: "user_1", status: "active" }),
      registers: expect.arrayContaining([expect.objectContaining({ id: canada.id }), expect.objectContaining({ id: usa.id })]),
      assignment_state: "ready",
      session: null,
      meta: expect.objectContaining({ register_count: 2, context_version: "pos-bootstrap-v1" }),
    }))
  })

  test("nests the active session register from the same resolved assignment list", async () => {
    const { req } = requestWith([{ id: "assignment_ca", operator_id: "user_1", register_id: canada.id, active: true, role: "POS_OPERATOR" }], [{ id: "session_ca", operator_id: "user_1", register_id: canada.id, status: "OPEN" }])
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader: jest.fn() } as any
    await GET(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ session: expect.objectContaining({ id: "session_ca", register_id: canada.id, register: expect.objectContaining({ id: canada.id, currency_code: "cad" }) }) }))
  })

  test("keeps a wrong authenticated actor isolated from another actor's assignments", async () => {
    const { req } = requestWith([], [], "user_wrong")
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader: jest.fn() } as any
    await GET(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      operator: expect.objectContaining({ id: "user_wrong", actor_id: "user_wrong" }),
      registers: [],
      assignment_state: "empty",
      meta: expect.objectContaining({ assignment_count: 0, register_count: 0 }),
    }))
  })

  test("fails with POS_AUTH_ACTOR_ID_MISSING when request auth context has no actor_id", async () => {
    const { req } = requestWith([])
    req.auth_context = null
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader: jest.fn() } as any
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: "POS_AUTH_ACTOR_ID_MISSING",
    }))
  })

  test("fails with POS_OPERATOR_ACTOR_INVARIANT_FAILED when assignment operator_id mismatches auth actor_id", async () => {
    const { req } = requestWith([
      { id: "assignment_ca", operator_id: "user_456", register_id: canada.id, active: true, role: "POS_OPERATOR" },
    ], [], "user_123")
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader: jest.fn() } as any
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: "POS_OPERATOR_ACTOR_INVARIANT_FAILED",
    }))
  })

  test("returns empty state with valid actor_id when no active assignments exist", async () => {
    const { req } = requestWith([], [], "user_123")
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader: jest.fn() } as any
    await GET(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      authenticated: true,
      operator: expect.objectContaining({ id: "user_123", actor_id: "user_123" }),
      registers: [],
      assignment_state: "empty",
    }))
  })

  test("bootstrap never substitutes another admin actor", async () => {
    const { req } = requestWithRealistic({
      user_123: [
        { id: "assignment_ca", operator_id: "user_123", register_id: canada.id, active: true, role: "POS_OPERATOR" },
        { id: "assignment_us", operator_id: "user_123", register_id: usa.id, active: true, role: "POS_OPERATOR" },
      ],
      user_456: [
        { id: "assignment_other", operator_id: "user_456", register_id: canada.id, active: true, role: "POS_OPERATOR" },
      ],
    }, [], "user_123")
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader: jest.fn() } as any
    await GET(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      authenticated: true,
      operator: expect.objectContaining({ id: "user_123", actor_id: "user_123" }),
      assignment_state: "ready",
      registers: expect.arrayContaining([
        expect.objectContaining({ id: canada.id }),
        expect.objectContaining({ id: usa.id }),
      ]),
      meta: expect.objectContaining({ assignment_count: 2, register_count: 2 }),
    }))
    const body = res.json.mock.calls[0][0]
    expect(JSON.stringify(body)).not.toContain("user_456")
    expect(res.status).not.toHaveBeenCalled()
  })

  test("assignment_state is ready with two registers when the canonical actor has two valid assignments even when another admin exists", async () => {
    const { req } = requestWithRealistic({
      user_CANONICAL: [
        { id: "assignment_ca", operator_id: "user_CANONICAL", register_id: canada.id, active: true, role: "ADMIN" },
        { id: "assignment_us", operator_id: "user_CANONICAL", register_id: usa.id, active: true, role: "ADMIN" },
      ],
      user_OTHER: [],
    }, [], "user_CANONICAL")
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis(), setHeader: jest.fn() } as any
    await GET(req, res)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      operator: expect.objectContaining({ actor_id: "user_CANONICAL" }),
      assignment_state: "ready",
      meta: expect.objectContaining({ assignment_count: 2, register_count: 2 }),
    }))
    expect(res.status).not.toHaveBeenCalled()
  })
})
