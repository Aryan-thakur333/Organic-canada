import { normalizeRegisterId } from "../../../api/pos/registers/[id]/session/route"
import { assertOperatorAssignedToRegister, loadAssignedPosRegisters } from "../register-assignments"
import { getOpenRegisterSession, requirePosRegisterAssignment } from "../security"

const operatorId = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"
const usaId = "01KYMKWP9T4YWNMZA47AZNQSY3"
const canadaId = "01KYMKWP9FAB13SGT4Z5XTW6R2"
const register = (id: string, status = "ACTIVE") => ({
  id,
  name: id === usaId ? "USA POS Register" : "Canada POS Register",
  code: id === usaId ? "US-POS-01" : "CA-POS-01",
  status,
  currency_code: id === usaId ? "usd" : "cad",
  region_id: `region_${id}`,
  stock_location_id: `location_${id}`,
  sales_channel_id: "sc_pos",
})
const assignment = (registerId: string, overrides: Record<string, unknown> = {}) => ({
  id: `assignment_${registerId}`,
  operator_id: operatorId,
  register_id: registerId,
  role: "ADMIN",
  active: true,
  metadata: {},
  ...overrides,
})

function service(overrides: Record<string, jest.Mock> = {}) {
  const assignments = [assignment(canadaId), assignment(usaId)]
  const registers = [register(canadaId), register(usaId)]
  return {
    listPosOperatorAssignments: jest.fn(async () => assignments),
    listPosRegisters: jest.fn(async () => registers),
    retrievePosRegister: jest.fn(async (id: string) => registers.find((entry) => entry.id === id)),
    listPosRegisterSessions: jest.fn(async () => []),
    ...overrides,
  } as any
}

describe("POS session assignment 403 consistency", () => {
  test("assigned USA and Canada operators pass the same authorization helper", async () => {
    const pos = service()
    await expect(assertOperatorAssignedToRegister({ service: pos, operatorId, registerId: usaId })).resolves.toMatchObject({ register: { id: usaId }, role: "ADMIN" })
    await expect(assertOperatorAssignedToRegister({ service: pos, operatorId, registerId: canadaId })).resolves.toMatchObject({ register: { id: canadaId }, role: "ADMIN" })
  })

  test("single-register authorization queries canonical operator_id and filters register_id explicitly", async () => {
    const pos = service()
    await requirePosRegisterAssignment({ service: pos, operatorId, registerId: usaId })
    expect(pos.listPosOperatorAssignments).toHaveBeenCalledWith({ operator_id: operatorId }, { take: 100 })
  })

  test("unassigned, inactive, and deleted assignments return the precise 403 contract", async () => {
    for (const records of [
      [],
      [assignment(usaId, { active: false })],
      [assignment(usaId, { deleted_at: new Date() })],
    ]) {
      const pos = service({ listPosOperatorAssignments: jest.fn(async () => records) })
      await expect(assertOperatorAssignedToRegister({ service: pos, operatorId, registerId: usaId })).rejects.toMatchObject({
        code: "POS_REGISTER_NOT_ASSIGNED",
        status: 403,
      })
    }
  })

  test("assignment query failure is a safe 500 and never a false 403", async () => {
    const pos = service({ listPosOperatorAssignments: jest.fn(async () => { throw new Error("database detail") }) })
    await expect(assertOperatorAssignedToRegister({ service: pos, operatorId, registerId: usaId })).rejects.toMatchObject({
      code: "POS_REGISTER_ASSIGNMENT_QUERY_FAILED",
      message: "Unable to verify register assignment.",
      status: 500,
    })
  })

  test("role and register status are normalized while enforcing the project roles", async () => {
    const pos = service({
      listPosOperatorAssignments: jest.fn(async () => [assignment(usaId, { role: "admin" })]),
      retrievePosRegister: jest.fn(async () => register(usaId, "active")),
    })
    await expect(assertOperatorAssignedToRegister({ service: pos, operatorId, registerId: usaId })).resolves.toMatchObject({ role: "ADMIN" })
  })

  test("inactive register returns 403", async () => {
    const pos = service({ retrievePosRegister: jest.fn(async () => register(usaId, "DISABLED")) })
    await expect(assertOperatorAssignedToRegister({ service: pos, operatorId, registerId: usaId })).rejects.toMatchObject({ code: "POS_REGISTER_INACTIVE", status: 403 })
  })

  test("list and session paths share the same exact assignment matcher", async () => {
    const pos = service()
    const listed = await loadAssignedPosRegisters(pos, operatorId)
    const authorized = await assertOperatorAssignedToRegister({ service: pos, operatorId, registerId: usaId })
    expect(listed.registers.map((entry) => entry.id)).toEqual([canadaId, usaId])
    expect(authorized.assignment.id).toBe(`assignment_${usaId}`)
  })

  test("route parameter normalization uses req.params.id value without mutation", () => {
    expect(normalizeRegisterId(`  ${usaId}  `)).toBe(usaId)
  })

  test("existing matching USA session is reused without creation", async () => {
    const session = { id: "session_usa", operator_id: operatorId, register_id: usaId, status: "OPEN" }
    const pos = service({ listPosRegisterSessions: jest.fn(async () => [session]) })
    await expect(getOpenRegisterSession(pos, usaId, operatorId)).resolves.toEqual(session)
    expect(pos.listPosRegisterSessions).toHaveBeenCalledWith({ register_id: usaId, operator_id: operatorId }, { take: 10 })
  })
})
