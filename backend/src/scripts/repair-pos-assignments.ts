import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

// Explicit, opt-in repair only. It is never imported by request handlers.
// Run with MEDUSA_POS_REPAIR_OPERATOR_ID=<user_id> and POS_REPAIR_APPLY=true.
export default async function repairPosAssignments({ container }: ExecArgs) {
  const operatorId = String(process.env.MEDUSA_POS_REPAIR_OPERATOR_ID || "").trim()
  const apply = process.env.POS_REPAIR_APPLY === "true"
  if (!operatorId) throw new Error("MEDUSA_POS_REPAIR_OPERATOR_ID is required")
  const service = container.resolve(POS_MODULE) as PosModuleService
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as { info(message: string): void }
  const registers = await service.listPosRegisters({ code: ["CA-POS-01", "US-POS-01"] }, { take: 10 })
  const report = [] as Array<Record<string, unknown>>
  for (const register of registers) {
    const assignments = await service.listPosOperatorAssignments({ operator_id: operatorId, register_id: register.id }, { take: 10 })
    if (assignments.length > 1) throw new Error(`Duplicate POS assignments require manual review for register ${register.id}`)
    if (assignments[0]) report.push({ registerId: register.id, action: "UNCHANGED", assignmentId: assignments[0].id })
    else if (apply) {
      const assignment = await service.createPosOperatorAssignments({ operator_id: operatorId, register_id: register.id, role: "ADMIN", active: true, metadata: { repaired_by: "repair-pos-assignments" } })
      report.push({ registerId: register.id, action: "CREATED", assignmentId: assignment.id })
      logger.info(`[POS_ASSIGNMENT_MUTATION] ${JSON.stringify({ action: "CREATE", assignmentId: assignment.id, operatorId, registerId: register.id, source: "repair-pos-assignments" })}`)
    } else report.push({ registerId: register.id, action: "MISSING" })
  }
  logger.info(`[POS_ASSIGNMENT_REPAIR_REPORT] ${JSON.stringify({ operatorId, apply, report })}`)
}
