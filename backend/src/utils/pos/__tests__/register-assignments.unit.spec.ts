import { isActiveAssignment, isActiveRegister, isPosActive, loadAssignedPosRegisters, safeRuntimeDatabase, serializePosRegister } from "../register-assignments"

const operatorId = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"
const canada = { id: "01KYMKWP9FAB13SGT4Z5XTW6R2", name: "Canada POS Register", code: "CA-POS-01", status: "ACTIVE", currency_code: "cad", region_id: "region_ca", stock_location_id: "loc_ca", sales_channel_id: "sc_pos" }
const usa = { id: "01KYMKWP9T4YWNMZA47AZNQSY3", name: "USA POS Register", code: "US-POS-01", status: "ACTIVE", currency_code: "usd", region_id: "region_us", stock_location_id: "sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ", sales_channel_id: "sc_pos" }

function service(assignments: Array<Record<string, unknown>>, registers = [canada, usa]) {
  return {
    listPosOperatorAssignments: jest.fn(async (filter) => {
      expect(filter).toEqual({ operator_id: operatorId })
      return assignments
    }),
    listPosRegisters: jest.fn(async () => registers),
  } as any
}

describe("POS assigned register pipeline", () => {
  test("returns a stable flat response for the canonical actor's two active assignments", async () => {
    const result = await loadAssignedPosRegisters(service([
      { id: "assign_us", operator_id: operatorId, register_id: usa.id, active: true, role: "ADMIN" },
      { id: "assign_ca", operator_id: operatorId, register_id: canada.id, active: true, role: "ADMIN" },
    ]), operatorId)

    expect(result.registers).toEqual([{ ...canada, status: "active" }, { ...usa, status: "active" }])
    expect(result.trace).toMatchObject({
      allAssignments: 2,
      afterDeletedFilter: 2,
      afterActiveAssignmentFilter: 2,
      afterRegisterJoin: 2,
      afterActiveRegisterFilter: 2,
      finalRegisters: 2,
      excluded: [],
    })
    expect(result.registers[0]).not.toHaveProperty("register")
  })

  test("accepts ACTIVE/active status variants through the shared status normalizer", async () => {
    expect(isPosActive("ACTIVE")).toBe(true)
    expect(isPosActive("active")).toBe(true)
    expect(isPosActive("inactive")).toBe(false)
    expect(isActiveAssignment({ id: "assign_status_upper", status: "ACTIVE" } as any)).toBe(true)
    expect(isActiveAssignment({ id: "assign_status_lower", status: "active" } as any)).toBe(true)
    expect(isActiveAssignment({ id: "assign_boolean", active: true } as any)).toBe(true)
    expect(isActiveAssignment({ id: "assign_inactive", status: "inactive" } as any)).toBe(false)
    expect(isActiveRegister({ ...usa, status: "active" } as any)).toBe(true)
    expect(isActiveRegister({ ...usa, status: "ACTIVE" } as any)).toBe(true)
    expect(isActiveRegister({ ...usa, status: "disabled" } as any)).toBe(false)
  })

  test("classifies active assignments that resolve to no active registers as an invariant failure", async () => {
    const inactiveRegister = { ...usa, status: "INACTIVE" }
    await expect(loadAssignedPosRegisters(service([
      { id: "deleted", register_id: "reg_deleted", active: true, deleted_at: new Date() },
      { id: "inactive-assignment", register_id: "reg_inactive_assignment", active: false },
      { id: "missing", register_id: "reg_missing", active: true },
      { id: "inactive-register", register_id: usa.id, active: true },
    ], [inactiveRegister]), operatorId)).rejects.toMatchObject({ code: "POS_REGISTER_INVARIANT_FAILED", status: 500 })
  })

  test("does not turn assignment query failures into an empty register list", async () => {
    const broken = service([])
    broken.listPosOperatorAssignments.mockRejectedValueOnce(new Error("database unavailable"))
    await expect(loadAssignedPosRegisters(broken, operatorId)).rejects.toMatchObject({ code: "POS_REGISTER_ASSIGNMENT_LOOKUP_FAILED", status: 500 })
  })

  test("keeps valid registers when one active assignment is malformed and deduplicates duplicate rows", async () => {
    const result = await loadAssignedPosRegisters(service([
      { id: "assign_ca", operator_id: operatorId, register_id: canada.id, active: true, role: "ADMIN" },
      { id: "assign_ca_duplicate", operator_id: operatorId, register_id: canada.id, active: true, role: "ADMIN" },
      { id: "assign_broken", operator_id: operatorId, active: true, role: "ADMIN" },
    ], [canada]), operatorId)
    expect(result.registers).toEqual([{ ...canada, status: "active" }])
    expect(result.trace.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "ASSIGNMENT_REGISTER_ID_MISSING" })]))
  })

  test("rejects malformed register serialization", () => {
    expect(() => serializePosRegister({ ...usa, currency_code: "" } as any)).toThrow("missing currency_code")
  })

  test("runtime database diagnostics never include credentials", () => {
    expect(safeRuntimeDatabase("postgres://secret-user:secret-password@localhost:5432/medusa-backend")).toMatchObject({
      databaseHost: "localhost",
      databasePort: "5432",
      databaseName: "medusa-backend",
      expectedDatabaseMatched: true,
    })
    expect(JSON.stringify(safeRuntimeDatabase("postgres://secret-user:secret-password@localhost:5432/medusa-backend"))).not.toContain("secret")
  })
})
