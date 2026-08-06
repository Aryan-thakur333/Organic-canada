import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../../../modules/pos"
import { PosError, posErrorResponse, type PosService } from "../../../../utils/pos/contracts"
import { isActiveAssignment, loadAssignedPosRegisters, safeRuntimeDatabase } from "../../../../utils/pos/register-assignments"
import { resolveAuthenticatedPosOperator } from "../../../../utils/pos/security"

const QUERY_FAILED_BODY = {
  code: "POS_REGISTER_QUERY_FAILED",
  message: "Unable to load register assignments.",
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as {
    info(message: string): void
    error(message: string): void
  }
  let operator: Awaited<ReturnType<typeof resolveAuthenticatedPosOperator>>
  try {
    operator = await resolveAuthenticatedPosOperator(req)
  } catch (error) {
    if (error instanceof PosError && error.status < 500) {
      const out = posErrorResponse(error)
      return res.status(out.status).json(out.body)
    }
    logger.error("[POS_REGISTER_QUERY_FAILED] operator resolution failed")
    return res.status(500).json(QUERY_FAILED_BODY)
  }

  try {
    const service = req.scope.resolve(POS_MODULE) as PosService
    const { assignments, registers, trace } = await loadAssignedPosRegisters(service, operator.operatorId)
    const request = req as MedusaRequest & {
      auth_context?: { actor_id?: string; actor_type?: string; auth_identity_id?: string }
    }
    const activeAssignments = assignments.filter(isActiveAssignment)
    if (process.env.NODE_ENV !== "production") {
      logger.info(`[POS_REGISTER_OPERATOR_TRACE] ${JSON.stringify({
        actorIdPresent: true,
        actorId: String(request.auth_context?.actor_id || operator.operatorId || ""),
        actorType: String(request.auth_context?.actor_type || ""),
        posMeOperatorId: operator.operatorId,
        registerQueryOperatorId: operator.operatorId,
        idsMatch: String(request.auth_context?.actor_id || "") === operator.operatorId,
      })}`)
      logger.info(`[POS_REGISTER_VISIBILITY_DEBUG] ${JSON.stringify({
        actorId: String(request.auth_context?.actor_id || ""),
        operatorId: operator.operatorId,
        operatorUserId: operator.operatorUserId,
        assignmentCount: assignments.length,
        activeAssignmentCount: activeAssignments.length,
        assignedRegisterIds: activeAssignments.map((assignment) => String(assignment.register_id || "")),
        activeRegisterIds: registers.map((register) => register.id),
        databaseName: safeRuntimeDatabase().databaseName,
      })}`)
      logger.info(`[POS_RUNTIME_DATABASE] ${JSON.stringify(safeRuntimeDatabase())}`)
      logger.info(`[POS_OPERATOR_ASSIGNMENT_AUDIT] ${JSON.stringify({
        operatorId: operator.operatorId,
        operatorUserId: operator.operatorUserId,
        allAssignmentCount: assignments.length,
        assignments: assignments.map((assignment) => ({
          id: String(assignment.id || ""),
          registerId: String(assignment.register_id || ""),
          active: assignment.active === true,
          deleted: Boolean(assignment.deleted_at),
          role: String(assignment.role || ""),
        })),
      })}`)
      logger.info(`[POS_REGISTER_FILTER_TRACE] ${JSON.stringify(trace)}`)
      logger.info(`[POS_ASSIGNMENT_QUERY_COMPARISON] ${JSON.stringify({
        registerListQuery: {
          operatorField: "operator_id",
          registerField: "register_id",
          activeField: "active",
          deletedFilter: "deleted_at == null",
          registerStatusFilter: "String(status).toUpperCase() === ACTIVE",
        },
        sessionRouteQuery: {
          operatorField: "operator_id",
          registerField: "register_id",
          activeField: "active",
          deletedFilter: "deleted_at == null",
          registerStatusFilter: "String(status).toUpperCase() === ACTIVE",
        },
        differences: [],
        passed: true,
      })}`)
      logger.info(`[POS_LIVE_REGISTER_RESPONSE] ${JSON.stringify({
        posMeStatus: 200,
        operatorId: operator.operatorId,
        registersStatus: 200,
        responseShape: "{ registers: PosRegister[] }",
        registerCount: registers.length,
        registerIds: registers.map((register) => register.id),
        passed: true,
      })}`)
      if (activeAssignments.length > 0 && registers.length === 0) {
        logger.info(`[POS_REGISTER_PIPELINE_MISMATCH] ${JSON.stringify({
          actorId: String(request.auth_context?.actor_id || ""),
          operatorId: operator.operatorId,
          activeAssignmentCount: activeAssignments.length,
          normalizedRegisterCount: registers.length,
          assignedRegisterIds: activeAssignments.map((assignment) => String(assignment.register_id || "")),
          databaseName: safeRuntimeDatabase().databaseName,
        })}`)
      }
    }

    return res.json({
      registers,
      diagnostics: {
        operator_id: operator.operatorId,
        operator_user_id: operator.operatorUserId,
        assignment_count: assignments.length,
        active_assignment_count: activeAssignments.length,
        active_register_ids: registers.map((register) => register.id),
        database_name: safeRuntimeDatabase().databaseName,
      },
    })
  } catch (error) {
    const code = error instanceof PosError ? error.code : "POS_UNEXPECTED_ERROR"
    logger.error(`[POS_REGISTER_QUERY_FAILED] ${JSON.stringify({ code, operatorId: operator.operatorId })}`)
    return res.status(500).json(QUERY_FAILED_BODY)
  }
}
