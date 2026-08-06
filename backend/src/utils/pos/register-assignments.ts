import { PosError, type PosRecord, type PosRole, type PosService } from "./contracts"

export const REQUIRED_REGISTER_FIELDS = ["id", "name", "code", "status", "currency_code"] as const

export type SerializedPosRegister = {
  id: string
  name: string
  code: string
  status: string
  currency_code: string
  region_id: string
  stock_location_id: string
  sales_channel_id: string
}

export type PosRegisterFilterTrace = {
  allAssignments: number
  afterDeletedFilter: number
  afterActiveAssignmentFilter: number
  afterRegisterJoin: number
  afterActiveRegisterFilter: number
  finalRegisters: number
  excluded: Array<{ assignmentId: string; registerId: string; reason: string }>
}

export const POS_REGISTER_ACCESS_ROLES: PosRole[] = ["POS_OPERATOR", "POS_MANAGER", "ADMIN"]

type PosAssignmentLogger = {
  info(message: string): void
}

export function normalizeActiveStatus(value: unknown): string {
  return String(value ?? "").trim().toUpperCase()
}

export function isPosActive(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "active"
}

export function isActiveStatus(value: unknown): boolean {
  return isPosActive(value)
}

export function isActiveAssignment(assignment: PosRecord): boolean {
  if (assignment.deleted_at) return false
  if (assignment.active === false) return false
  if (assignment.active === true) return true
  if (typeof assignment.active === "string") return isActiveStatus(assignment.active)
  if (assignment.status !== undefined && assignment.status !== null) return isActiveStatus(assignment.status)
  return false
}

export function isActiveRegister(register: PosRecord | null | undefined): boolean {
  return Boolean(register && !register.deleted_at && isActiveStatus(register.status))
}

export async function assertOperatorAssignedToRegister({
  service,
  operatorId,
  registerId,
  allowedRoles = POS_REGISTER_ACCESS_ROLES,
  assignments: suppliedAssignments,
  register: suppliedRegister,
  logger,
  route = "",
}: {
  service: PosService
  operatorId: string
  registerId: string
  allowedRoles?: PosRole[]
  assignments?: PosRecord[]
  register?: PosRecord
  logger?: PosAssignmentLogger
  route?: string
}) {
  const normalizedOperatorId = String(operatorId || "").trim()
  const normalizedRegisterId = String(registerId || "").trim()
  if (!normalizedOperatorId) {
    throw new PosError("POS_OPERATOR_ID_MISSING", "POS operator identity is required.", 401)
  }
  if (!normalizedRegisterId) {
    throw new PosError("POS_REGISTER_ID_MISSING", "POS register ID is required.", 400)
  }

  let assignments = suppliedAssignments
  if (!assignments) {
    try {
      // Query by the canonical actor exactly as the list route does, then apply
      // the register/active/deleted checks explicitly against the canonical model shape.
      assignments = await service.listPosOperatorAssignments(
        { operator_id: normalizedOperatorId },
        { take: 100 }
      ) as PosRecord[]
    } catch {
      throw new PosError(
        "POS_REGISTER_ASSIGNMENT_QUERY_FAILED",
        "Unable to verify register assignment.",
        500
      )
    }
  }

  const assignment = assignments.find((entry) =>
    String(entry.operator_id || "").trim() === normalizedOperatorId &&
    String(entry.register_id || "").trim() === normalizedRegisterId &&
    isActiveAssignment(entry)
  )
  if (!assignment) {
    throw new PosError(
      "POS_REGISTER_NOT_ASSIGNED",
      "Operator is not assigned to this register.",
      403
    )
  }

  const role = String(assignment.role || "").trim().toUpperCase() as PosRole
  if (!allowedRoles.includes(role)) {
    throw new PosError("POS_ROLE_NOT_PERMITTED", "POS role does not permit this action.", 403)
  }

  let register = suppliedRegister
  if (!register) {
    try {
      register = await service.retrievePosRegister(normalizedRegisterId) as PosRecord
    } catch {
      throw new PosError("POS_REGISTER_INACTIVE", "Register is not active.", 403)
    }
  }
  const normalizedStatus = normalizeActiveStatus(register?.status)
  if (!isActiveRegister(register)) {
    throw new PosError("POS_REGISTER_INACTIVE", "Register is not active.", 403)
  }

  const metadata = (assignment.metadata || {}) as Record<string, unknown>
  if ((metadata.region_id && metadata.region_id !== register.region_id) ||
    (metadata.stock_location_id && metadata.stock_location_id !== register.stock_location_id)) {
    throw new PosError("POS_REGISTER_SCOPE_MISMATCH", "Assignment scope does not match this register.", 403)
  }

  if (logger && process.env.NODE_ENV !== "production") {
    logger.info(`[POS_ASSIGNMENT_ROLE_STATUS_TRACE] ${JSON.stringify({
      route,
      assignmentRole: String(assignment.role || ""),
      allowedRoles,
      roleAllowed: true,
      registerStatusRaw: String(register.status || ""),
      registerStatusNormalized: normalizedStatus,
      statusAllowed: true,
    })}`)
  }

  return { assignment, register, role }
}

export function serializePosRegister(register: PosRecord): SerializedPosRegister {
  for (const field of REQUIRED_REGISTER_FIELDS) {
    if (register[field] === undefined || register[field] === null || register[field] === "") {
      throw new PosError("POS_MALFORMED_RESPONSE", `Malformed register record: missing ${field}`, 500)
    }
  }

  return {
    id: String(register.id),
    name: String(register.name),
    code: String(register.code),
    status: String(register.status).toLowerCase(),
    currency_code: String(register.currency_code).toLowerCase(),
    region_id: String(register.region_id || ""),
    stock_location_id: String(register.stock_location_id || ""),
    sales_channel_id: String(register.sales_channel_id || ""),
  }
}

export async function loadAssignedPosRegisters(service: PosService, operatorId: string) {
  let assignments: PosRecord[]
  try {
    assignments = await service.listPosOperatorAssignments(
      { operator_id: operatorId },
      { take: 100 }
    ) as PosRecord[]
  } catch {
    throw new PosError("POS_REGISTER_ASSIGNMENT_LOOKUP_FAILED", "Unable to load POS register assignments.", 500)
  }
  if (!Array.isArray(assignments)) {
    throw new PosError("POS_REGISTER_ASSIGNMENT_LOOKUP_FAILED", "Invalid POS assignment lookup result.", 500)
  }

  const excluded: PosRegisterFilterTrace["excluded"] = []
  const afterDeleted = assignments.filter((assignment) => {
    if (!assignment.deleted_at) return true
    excluded.push({
      assignmentId: String(assignment.id || ""),
      registerId: String(assignment.register_id || ""),
      reason: "ASSIGNMENT_DELETED",
    })
    return false
  })
  const afterActive = afterDeleted.filter((assignment) => {
    if (isActiveAssignment(assignment)) return true
    excluded.push({
      assignmentId: String(assignment.id || ""),
      registerId: String(assignment.register_id || ""),
      reason: "ASSIGNMENT_INACTIVE",
    })
    return false
  })

  const validAssignments = afterActive.filter((assignment) => {
    if (String(assignment.register_id || "").trim()) return true
    excluded.push({ assignmentId: String(assignment.id || ""), registerId: "", reason: "ASSIGNMENT_REGISTER_ID_MISSING" })
    return false
  })
  const registerIds = [...new Set(validAssignments.map((assignment) => String(assignment.register_id)))]
  let registerRecords: PosRecord[] = []
  if (registerIds.length) {
    try {
      registerRecords = await service.listPosRegisters({ id: registerIds }, { take: registerIds.length }) as PosRecord[]
    } catch {
      throw new PosError("POS_REGISTER_ASSIGNMENT_LOOKUP_FAILED", "Unable to load POS assigned registers.", 500)
    }
    if (!Array.isArray(registerRecords)) {
      throw new PosError("POS_REGISTER_ASSIGNMENT_LOOKUP_FAILED", "Invalid POS register lookup result.", 500)
    }
  }
  const registerById = new Map(registerRecords.map((register) => [String(register.id), register]))
  const joined: Array<{ assignment: PosRecord; register: PosRecord }> = []

  for (const assignment of validAssignments) {
    const assignmentId = String(assignment.id || "")
    const registerId = String(assignment.register_id)
    const register = registerById.get(registerId)
    if (!register || register.deleted_at) {
      excluded.push({ assignmentId, registerId, reason: register?.deleted_at ? "REGISTER_DELETED" : "REGISTER_NOT_FOUND" })
      continue
    }
    joined.push({ assignment, register })
  }

  const activeRegisters = joined.filter(({ assignment, register }) => {
    if (isActiveRegister(register)) return true
    excluded.push({
      assignmentId: String(assignment.id || ""),
      registerId: String(register.id || assignment.register_id || ""),
      reason: "REGISTER_INACTIVE",
    })
    return false
  })

  const seenRegisterIds = new Set<string>()
  const registers: SerializedPosRegister[] = []
  for (const entry of activeRegisters) {
    const authorized = await assertOperatorAssignedToRegister({
      service,
      operatorId,
      registerId: String(entry.register.id),
      assignments,
      register: entry.register,
      route: "/pos/me/registers",
    })
    const serialized = serializePosRegister(authorized.register)
    if (seenRegisterIds.has(serialized.id)) continue
    seenRegisterIds.add(serialized.id)
    registers.push(serialized)
  }
  registers.sort((left, right) => left.code.localeCompare(right.code))

  const trace: PosRegisterFilterTrace = {
    allAssignments: assignments.length,
    afterDeletedFilter: afterDeleted.length,
    afterActiveAssignmentFilter: afterActive.length,
    afterRegisterJoin: joined.length,
    afterActiveRegisterFilter: activeRegisters.length,
    finalRegisters: registers.length,
    excluded,
  }

  if (afterActive.length > 0 && registers.length === 0) {
    throw new PosError("POS_REGISTER_INVARIANT_FAILED", "Active POS assignments did not resolve to active registers.", 500, {
      raw_assignment_count: assignments.length,
      active_assignment_count: afterActive.length,
      raw_register_count: registerRecords.length,
      active_register_count: activeRegisters.length,
      excluded,
    })
  }

  return { assignments, registers, trace }
}

export function safeRuntimeDatabase(databaseUrl = process.env.DATABASE_URL || "") {
  let databaseHost = ""
  let databasePort = ""
  let databaseName = ""
  try {
    const parsed = new URL(databaseUrl)
    databaseHost = parsed.hostname
    databasePort = parsed.port || "5432"
    databaseName = parsed.pathname.replace(/^\//, "")
  } catch {
    // Keep diagnostics blank rather than exposing an invalid connection string.
  }
  return {
    databaseHost,
    databasePort,
    databaseName,
    environment: process.env.NODE_ENV || "development",
    backendPid: process.pid,
    expectedDatabaseMatched: databaseName === "medusa-backend",
  }
}
