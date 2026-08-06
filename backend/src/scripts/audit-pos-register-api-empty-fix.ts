import type { ExecArgs } from "@medusajs/framework/types"
import { POS_MODULE } from "../modules/pos"
import type { PosRecord, PosService } from "../utils/pos/contracts"
import { loadAssignedPosRegisters } from "../utils/pos/register-assignments"

const OPERATOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"
const CANADA_REGISTER_ID = "01KYMKWP9FAB13SGT4Z5XTW6R2"
const USA_REGISTER_ID = "01KYMKWP9T4YWNMZA47AZNQSY3"

async function retrieveRegister(service: PosService, id: string) {
  try {
    return await service.retrievePosRegister(id) as PosRecord
  } catch {
    return null
  }
}

function registerAudit(register: PosRecord | null) {
  return {
    id: String(register?.id || ""),
    exists: Boolean(register),
    status: String(register?.status || ""),
    deleted: Boolean(register?.deleted_at),
    currencyCode: String(register?.currency_code || ""),
    regionId: String(register?.region_id || ""),
    stockLocationId: String(register?.stock_location_id || ""),
    salesChannelId: String(register?.sales_channel_id || ""),
    requiredScopePresent: Boolean(register?.region_id && register?.stock_location_id && register?.sales_channel_id),
  }
}

export default async function auditPosRegisterApiEmptyFix({ container }: ExecArgs) {
  const service = container.resolve(POS_MODULE) as PosService
  const [canada, usa, pipeline] = await Promise.all([
    retrieveRegister(service, CANADA_REGISTER_ID),
    retrieveRegister(service, USA_REGISTER_ID),
    loadAssignedPosRegisters(service, OPERATOR_ID),
  ])

  const assignments = pipeline.assignments
  const safeAssignments = assignments.map((assignment) => ({
    id: String(assignment.id || ""),
    registerId: String(assignment.register_id || ""),
    active: assignment.active === true,
    deleted: Boolean(assignment.deleted_at),
    role: String(assignment.role || ""),
  }))
  const activeExpected = safeAssignments.filter((assignment) =>
    assignment.active && !assignment.deleted &&
    [CANADA_REGISTER_ID, USA_REGISTER_ID].includes(assignment.registerId)
  )
  const duplicatesPrevented = [CANADA_REGISTER_ID, USA_REGISTER_ID].reduce((total, registerId) => {
    const matching = safeAssignments.filter((assignment) => assignment.registerId === registerId && !assignment.deleted)
    return total + Math.max(0, matching.length - 1)
  }, 0)
  const canadaAssignmentAlreadyExisted = activeExpected.some((assignment) => assignment.registerId === CANADA_REGISTER_ID)
  const usaAssignmentAlreadyExisted = activeExpected.some((assignment) => assignment.registerId === USA_REGISTER_ID)
  const registerRecordsPassed = Boolean(
    canada && !canada.deleted_at && canada.status === "ACTIVE" && canada.currency_code === "cad" &&
    usa && !usa.deleted_at && usa.status === "ACTIVE" && usa.currency_code === "usd" &&
    canada.region_id && canada.stock_location_id && canada.sales_channel_id &&
    usa.region_id && usa.stock_location_id && usa.sales_channel_id
  )
  const repairRequired = !canadaAssignmentAlreadyExisted || !usaAssignmentAlreadyExisted || !registerRecordsPassed

  console.log("[POS_OPERATOR_ASSIGNMENT_AUDIT]")
  console.log(JSON.stringify({
    operatorId: OPERATOR_ID,
    allAssignmentCount: assignments.length,
    assignments: safeAssignments,
  }, null, 2))

  console.log("[POS_REGISTER_RECORD_AUDIT]")
  console.log(JSON.stringify({
    canada: registerAudit(canada),
    usa: registerAudit(usa),
    passed: registerRecordsPassed,
  }, null, 2))

  console.log("[POS_REGISTER_FILTER_TRACE]")
  console.log(JSON.stringify(pipeline.trace, null, 2))

  console.log("[POS_ASSIGNMENT_REPAIR]")
  console.log(JSON.stringify({
    repairRequired,
    canadaAssignmentAlreadyExisted,
    usaAssignmentAlreadyExisted,
    assignmentsCreated: 0,
    assignmentsReactivated: 0,
    duplicatesPrevented,
    passed: !repairRequired && duplicatesPrevented === 0,
  }, null, 2))
}
