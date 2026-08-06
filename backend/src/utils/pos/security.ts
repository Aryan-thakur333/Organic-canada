import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../modules/pos"
import { PosError, type PosRecord, type PosRole, type PosService } from "./contracts"
import { assertOperatorAssignedToRegister, isActiveAssignment, isPosActive, loadAssignedPosRegisters } from "./register-assignments"

export { assertOperatorAssignedToRegister } from "./register-assignments"

export type ResolvedPosOperator = {
  operatorId: string
  operatorUserId: string
  actorId: string
  operatorStatus: string
  identitySource: string
  role: PosRole | "UNASSIGNED"
  email: string
  permissions: string[]
}

const ROLE_PERMISSIONS: Record<PosRole, string[]> = {
  POS_OPERATOR: ["POS_SELL", "POS_LOOKUP"],
  POS_MANAGER: ["POS_SELL", "POS_LOOKUP", "POS_OPEN_REGISTER", "POS_CLOSE_REGISTER", "POS_RETURNS"],
  ADMIN: ["POS_SELL", "POS_LOOKUP", "POS_OPEN_REGISTER", "POS_CLOSE_REGISTER", "POS_RETURNS", "POS_ADMIN"],
}

const rolePriority = (role: unknown) => ({ ADMIN: 3, POS_MANAGER: 2, POS_OPERATOR: 1 }[String(role)] || 0)

export function isPosSessionOpen(session: PosRecord | null | undefined): boolean {
  return Boolean(session && !session.deleted_at && String(session.status || "").trim().toUpperCase() === "OPEN")
}

async function listActiveAssignments(service: PosService, operatorId: string) {
  try {
    const assignments = await service.listPosOperatorAssignments(
      { operator_id: operatorId },
      { take: 100 }
    ) as PosRecord[]
    return assignments.filter(isActiveAssignment)
  } catch {
    throw new PosError("POS_REGISTER_ASSIGNMENT_QUERY_FAILED", "Unable to verify register assignment.", 500)
  }
}

function resolveOperatorIdentity(service: PosService, actorId: string) {
  // The actual POS module schema intentionally has no pos_operator model.
  // Its canonical identity relation is auth user id -> assignment.operator_id.
  if (typeof service.listPosOperatorAssignments !== "function") {
    throw new PosError("POS_OPERATOR_LOOKUP_UNAVAILABLE", "POS operator assignment service is unavailable.", 500)
  }
  return {
    operatorId: actorId,
    operatorUserId: actorId,
    operatorStatus: "ACTIVE",
    identitySource: "pos_operator_assignment.operator_id",
  }
}

export async function resolveAuthenticatedPosOperator(req: MedusaRequest, options: { resolveRole?: boolean } = {}): Promise<ResolvedPosOperator> {
  const authContext = (req as MedusaRequest & { auth_context?: { actor_id?: string; actor_type?: string } }).auth_context
  const actorId = String(authContext?.actor_id || "").trim()
  if (!actorId || (authContext?.actor_type && authContext.actor_type !== "user")) {
    throw new PosError("POS_UNAUTHENTICATED", "POS authentication required", 401)
  }
  let service: PosService
  try {
    service = req.scope.resolve(POS_MODULE) as PosService
  } catch (error) {
    logOperatorLookupFailure(req, actorId, false, error)
    throw new PosError("POS_OPERATOR_LOOKUP_UNAVAILABLE", "POS operator service is unavailable.", 500)
  }
  let identity: ReturnType<typeof resolveOperatorIdentity>
  try {
    identity = resolveOperatorIdentity(service, actorId)
  } catch (error) {
    logOperatorLookupFailure(req, actorId, true, error)
    throw error
  }
  const assignments = options.resolveRole === false ? [] : await listActiveAssignments(service, identity.operatorId)
  const highest = [...assignments].sort((left, right) => rolePriority(right.role) - rolePriority(left.role))[0]
  const role = highest ? String(highest.role) as PosRole : "UNASSIGNED"
  let email = ""
  try {
    const userService = req.scope.resolve(Modules.USER) as { retrieveUser(id: string): Promise<{ email?: string }> }
    email = String((await userService.retrieveUser(actorId))?.email || "")
  } catch { /* identity remains canonical even when optional profile enrichment is unavailable */ }
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
  logger.info(`[POS_OPERATOR_RESOLVED] ${JSON.stringify({
    actorId,
    operatorId: identity.operatorId,
    operatorUserId: identity.operatorUserId,
    operatorStatus: identity.operatorStatus,
    identitySource: identity.identitySource,
    role,
  })}`)
  return {
    actorId,
    operatorId: identity.operatorId,
    operatorUserId: identity.operatorUserId,
    operatorStatus: identity.operatorStatus,
    identitySource: identity.identitySource,
    role,
    email,
    permissions: role === "UNASSIGNED" ? [] : ROLE_PERMISSIONS[role],
  }
}

// Canonical public name for every POS route: authenticated actor -> POS operator.
export const resolvePosOperatorFromAuth = resolveAuthenticatedPosOperator

function logOperatorLookupFailure(req: MedusaRequest, actorId: string, serviceResolved: boolean, error: unknown) {
  if (process.env.NODE_ENV === "production") return
  try {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
    logger.info(`[POS_OPERATOR_LOOKUP_FAILED] ${JSON.stringify({
      actorId,
      serviceResolved,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown operator lookup failure",
    })}`)
  } catch { /* diagnostics must not mask the classified lookup failure */ }
}

export async function requirePosRegisterAssignment({
  service,
  operatorId,
  registerId,
  allowedRoles = ["POS_OPERATOR", "POS_MANAGER", "ADMIN"],
}: {
  service: PosService
  operatorId: string
  registerId: string
  allowedRoles?: PosRole[]
}) {
  return assertOperatorAssignedToRegister({ service, operatorId, registerId, allowedRoles })
}

export async function requirePosContext(req: MedusaRequest, registerId?: string, allowed: PosRole[] = ["POS_OPERATOR", "POS_MANAGER", "ADMIN"]) {
  const operator = await resolveAuthenticatedPosOperator(req)
  const service = req.scope.resolve(POS_MODULE) as PosService
  if (!registerId) return { service, ...operator, assignment: null, register: null }
  const normalizedRegisterId = String(registerId || "").trim()
  const request = req as MedusaRequest & {
    auth_context?: { actor_id?: string; auth_identity_id?: string }
    originalUrl?: string
    url?: string
  }
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
  const route = String(request.originalUrl || request.url || "")
  if (process.env.NODE_ENV !== "production") {
    logger.info(`[POS_ASSIGNMENT_AUTH_ID_TRACE] ${JSON.stringify({
      route,
      actorId: String(request.auth_context?.actor_id || ""),
      authIdentityId: String(request.auth_context?.auth_identity_id || ""),
      operatorIdUsedForQuery: operator.operatorId,
      operatorUserId: operator.operatorUserId,
      identitySource: operator.identitySource,
      actorMapsToOperatorUser: String(request.auth_context?.actor_id || "") === operator.operatorUserId,
    })}`)
  }
  const guarded = await assertOperatorAssignedToRegister({
    service,
    operatorId: operator.operatorId,
    registerId: normalizedRegisterId,
    allowedRoles: allowed,
    logger,
    route,
  })
  return { service, ...operator, ...guarded, role: guarded.role, permissions: ROLE_PERMISSIONS[guarded.role] }
}

export async function resolveCurrentPosContext(req: MedusaRequest, requestedRegisterId?: string) {
  const operator = await resolveAuthenticatedPosOperator(req, { resolveRole: false })
  const service = req.scope.resolve(POS_MODULE) as PosService
  const assignmentSnapshot = await loadAssignedPosRegisters(service, operator.operatorId)
  const highestAssignment = [...assignmentSnapshot.assignments]
    .filter(isActiveAssignment)
    .sort((left, right) => rolePriority(right.role) - rolePriority(left.role))[0]
  const resolvedRole = highestAssignment ? String(highestAssignment.role) as PosRole : "UNASSIGNED"
  const sessions = await service.listPosRegisterSessions(
    { operator_id: operator.operatorId },
    { take: 20 }
  ) as PosRecord[]
  const openSessions = sessions.filter((session) =>
    String(session.operator_id || "") === operator.operatorId &&
    isPosSessionOpen(session)
  )
  if (openSessions.length > 1) throw new PosError("POS_OPERATOR_OPEN_SESSION_CONFLICT", "Operator has conflicting open register sessions", 409)

  let session: PosRecord | null = openSessions[0] || null
  let activeRegister: PosRecord | null = null
  if (session) {
    activeRegister = assignmentSnapshot.registers.find((register) => register.id === String(session?.register_id || "")) || null
    if (!activeRegister) {
      // Bootstrap/session inspection must still represent a valid operator with
      // zero current assignments as an empty state. Register-bound operations
      // pass requestedRegisterId and remain authorization-strict.
      if (requestedRegisterId) throw new PosError("POS_REGISTER_NOT_ASSIGNED", "The active session register is no longer assigned to this operator.", 403)
      session = null
    }
    if (!session) activeRegister = null
    // Assignment visibility is data-first. A configuration error is enforced
    // only for a register-bound operation, never by bootstrap list resolution.
    if (requestedRegisterId && activeRegister && !activeRegister.sales_channel_id) throw new PosError("POS_REGISTER_SALES_CHANNEL_MISSING", "This register is missing a sales channel configuration.", 422)
    if (requestedRegisterId && activeRegister && !activeRegister.stock_location_id) throw new PosError("POS_REGISTER_LOCATION_MISSING", "This register is missing a stock location configuration.", 422)
    if (requestedRegisterId && activeRegister && !activeRegister.currency_code) throw new PosError("POS_REGISTER_CURRENCY_MISSING", "This register is missing a currency configuration.", 422)
  }
  const requestedId = String(requestedRegisterId || "").trim()
  if (requestedId && session && requestedId !== String(session.register_id || "")) {
    throw new PosError("POS_REGISTER_SESSION_MISMATCH", "Your active POS session belongs to another register.", 409, {
      session_register_id: String(session.register_id || ""),
      requested_register_id: requestedId,
    })
  }
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
  logger.info(`[POS_CONTEXT_RESOLVED] ${JSON.stringify({
    actorId: operator.actorId,
    operatorId: operator.operatorId,
    sessionId: String(session?.id || ""),
    registerId: String(activeRegister?.id || ""),
    assignedRegisterCount: assignmentSnapshot.registers.length,
  })}`)
  return {
    service,
    ...operator,
    role: resolvedRole,
    permissions: resolvedRole === "UNASSIGNED" ? [] : ROLE_PERMISSIONS[resolvedRole],
    assignedRegisters: assignmentSnapshot.registers,
    assignmentCount: assignmentSnapshot.assignments.length,
    activeAssignmentCount: assignmentSnapshot.trace.afterActiveAssignmentFilter,
    activeRegisterCount: assignmentSnapshot.trace.afterActiveRegisterFilter,
    session,
    activeRegister,
    register: activeRegister,
  }
}

export async function getOpenRegisterSession(service: PosService, registerId: string, operatorId?: string) {
  const filters: Record<string, unknown> = { register_id: String(registerId || "").trim() }
  if (operatorId) filters.operator_id = String(operatorId).trim()
  let records: PosRecord[]
  try {
    records = await service.listPosRegisterSessions(filters, { take: 10 }) as PosRecord[]
  } catch {
    throw new PosError("POS_SESSION_QUERY_FAILED", "Unable to load register session.", 500)
  }
  const sessions = records.filter((session) =>
    !session.deleted_at &&
    session.register_id === filters.register_id &&
    isPosSessionOpen(session) &&
    (!operatorId || session.operator_id === filters.operator_id)
  )
  if (sessions.length > 1) throw new PosError("POS_SESSION_ALREADY_OPEN", "Register has conflicting open sessions", 409)
  return sessions[0] || null
}

export async function requireOpenSession(service: PosService, registerId: string, operatorId?: string) {
  const session = await getOpenRegisterSession(service, registerId, operatorId)
  if (!session && operatorId) {
    const otherSession = await getOpenRegisterSession(service, registerId)
    if (otherSession) throw new PosError("POS_SESSION_OPEN_BY_OTHER_OPERATOR", "This register is open under another operator", 409)
  }
  if (!session) throw new PosError("POS_SESSION_NOT_OPEN", "Register session is not open", 409)
  return session
}

export async function openPosRegisterSession(service: PosService, register: PosRecord, operatorId: string, openingCashMinor: number) {
  const current = await getOpenRegisterSession(service, register.id)
  if (current?.operator_id === operatorId) return { session: current, created: false }
  if (current) throw new PosError("POS_SESSION_OPEN_BY_OTHER_OPERATOR", "This register is open under another operator", 409)
  const operatorSessions = await service.listPosRegisterSessions({ operator_id: operatorId }, { take: 20 }) as PosRecord[]
  const incompatible = operatorSessions.find((session) => isPosSessionOpen(session) && session.register_id !== register.id)
  if (incompatible) throw await operatorSessionAlreadyOpenError(service, incompatible)
  try {
    const session = await service.createPosRegisterSessions({ register_id: register.id, operator_id: operatorId, opened_at: new Date(), opening_cash_minor: openingCashMinor, expected_cash_minor: openingCashMinor, status: "OPEN", metadata: { currency_code: register.currency_code } }) as PosRecord
    return { session, created: true }
  } catch (error) {
    // The unique open-session index is the final race guard. A simultaneous retry
    // by the same operator is idempotent; a different owner remains a conflict.
    const raced = await getOpenRegisterSession(service, register.id)
    if (raced?.operator_id === operatorId) return { session: raced, created: false }
    if (raced) throw new PosError("POS_SESSION_OPEN_BY_OTHER_OPERATOR", "This register is open under another operator", 409)
    const racedOperatorSessions = await service.listPosRegisterSessions({ operator_id: operatorId }, { take: 20 }) as PosRecord[]
    const racedIncompatible = racedOperatorSessions.find((session) => isPosSessionOpen(session) && session.register_id !== register.id)
    if (racedIncompatible) throw await operatorSessionAlreadyOpenError(service, racedIncompatible)
    throw error
  }
}

async function operatorSessionAlreadyOpenError(service: PosService, session: PosRecord) {
  let register: PosRecord | null = null
  try {
    register = await service.retrievePosRegister(String(session.register_id)) as PosRecord
  } catch { /* conflict remains valid even when register enrichment is unavailable */ }

  return new PosError("POS_OPERATOR_SESSION_ALREADY_OPEN", "Operator already has another open register session", 409, {
    session: sanitizeSession(session),
    register: register ? sanitizeRegister(register) : null,
  })
}

export function sanitizeRegister(register: PosRecord | null | undefined) {
  if (!register) return null
  return {
    id: String(register.id || ""),
    name: String(register.name || ""),
    code: String(register.code || ""),
    currency_code: String(register.currency_code || ""),
    status: String(register.status || "").toLowerCase(),
    region_id: String(register.region_id || ""),
    sales_channel_id: String(register.sales_channel_id || ""),
    stock_location_id: String(register.stock_location_id || ""),
  }
}

export function sanitizeSession(session: PosRecord | null | undefined) {
  if (!session) return null
  return {
    id: String(session.id || ""),
    register_id: String(session.register_id || ""),
    operator_id: String(session.operator_id || ""),
    status: String(session.status || ""),
    opened_at: session.opened_at || null,
    opening_cash_minor: Number(session.opening_cash_minor || 0),
    expected_cash_minor: Number(session.expected_cash_minor || 0),
  }
}

export async function appendPosAudit(service: PosService, input: Record<string, unknown>) {
  return service.createPosAuditEvents({ message: String(input.event_type || "POS_EVENT"), ...input })
}
