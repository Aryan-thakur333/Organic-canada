import type { ExecArgs } from "@medusajs/framework/types"
import { POS_MODULE } from "../modules/pos"
import type { PosRecord, PosService } from "../utils/pos/contracts"
import { requirePosRegisterAssignment } from "../utils/pos/security"

const OPERATOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"
const USA_REGISTER_ID = "01KYMKWP9T4YWNMZA47AZNQSY3"

export default async function auditPosSessionAssignment403({ container }: ExecArgs) {
  const service = container.resolve(POS_MODULE) as PosService
  const assignments = await service.listPosOperatorAssignments(
    { operator_id: OPERATOR_ID, register_id: USA_REGISTER_ID },
    { take: 10 }
  ) as PosRecord[]
  const assignment = assignments.find((entry) =>
    entry.operator_id === OPERATOR_ID &&
    entry.register_id === USA_REGISTER_ID &&
    entry.active === true &&
    !entry.deleted_at
  ) || null
  let register: PosRecord | null = null
  try {
    register = await service.retrievePosRegister(USA_REGISTER_ID) as PosRecord
  } catch {
    register = null
  }
  let helperPassed = false
  let helperErrorCode = ""
  try {
    await requirePosRegisterAssignment({ service, operatorId: OPERATOR_ID, registerId: USA_REGISTER_ID })
    helperPassed = true
  } catch (error) {
    helperErrorCode = String((error as { code?: string })?.code || "POS_UNEXPECTED_ERROR")
  }
  const sessions = await service.listPosRegisterSessions({
    operator_id: OPERATOR_ID,
    register_id: USA_REGISTER_ID,
    status: "OPEN",
  }, { take: 10 }) as PosRecord[]
  const matchingSession = sessions.find((session) =>
    session.operator_id === OPERATOR_ID &&
    session.register_id === USA_REGISTER_ID &&
    session.status === "OPEN" &&
    !session.deleted_at
  ) || null

  console.log("[POS_USA_ASSIGNMENT_RUNTIME_AUDIT]")
  console.log(JSON.stringify({
    operatorId: OPERATOR_ID,
    registerId: USA_REGISTER_ID,
    assignmentFound: Boolean(assignment),
    assignmentId: String(assignment?.id || ""),
    active: assignment?.active === true,
    deleted: Boolean(assignment?.deleted_at),
    role: String(assignment?.role || ""),
    registerFound: Boolean(register),
    registerStatus: String(register?.status || ""),
    currentHelperPassed: helperPassed,
    currentHelperErrorCode: helperErrorCode,
    passed: Boolean(assignment && register && register.status === "ACTIVE" && helperPassed),
  }, null, 2))

  console.log("[POS_SESSION_REUSE_TRACE]")
  console.log(JSON.stringify({
    authorizationPassed: helperPassed,
    openSessionsFound: sessions.length,
    matchingUsaSessionFound: Boolean(matchingSession),
    sessionId: String(matchingSession?.id || ""),
    newSessionCreated: false,
    wrongRegisterSessionReturned: Boolean(matchingSession && matchingSession.register_id !== USA_REGISTER_ID),
    passed: Boolean(helperPassed && matchingSession),
  }, null, 2))
}
