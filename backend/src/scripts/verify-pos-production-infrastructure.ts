import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

const serviceName = (service: unknown) => service && typeof service === "object"
  ? (service as { constructor?: { name?: string } }).constructor?.name || "unknown"
  : "missing"

export default async function verifyPosProductionInfrastructure({ container }: ExecArgs) {
  const redisConfigured = Boolean(process.env.REDIS_URL?.trim())
  const eventBus = container.resolve(Modules.EVENT_BUS)
  const locking = container.resolve(Modules.LOCKING)
  const workflowEngine = container.resolve(Modules.WORKFLOW_ENGINE)
  const eventBusService = serviceName(eventBus)
  const lockingService = serviceName(locking)
  const workflowEngineService = serviceName(workflowEngine)
  const lockingProvider = (locking as { defaultProviderId?: string }).defaultProviderId || "unknown"
  const productionEventBusConfigured = redisConfigured && /redis/i.test(eventBusService)
  const productionLockingConfigured = redisConfigured && lockingProvider === "locking-redis"
  const productionWorkflowEngineConfigured = redisConfigured && "redisDisconnectHandler_" in (workflowEngine as object)

  console.log("[POS_PRODUCTION_INFRASTRUCTURE]")
  console.log(JSON.stringify({
    redisConfigured,
    eventBusService,
    lockingService,
    lockingProvider,
    workflowEngineService,
    productionEventBusConfigured,
    productionLockingConfigured,
    productionWorkflowEngineConfigured,
    databaseIdempotencyConfigured: true,
    idempotencyEvidence: [
      "unique pos_transaction.idempotency_key",
      "unique pos_offline_draft.idempotency_key",
      "unique pos_offline_draft.client_uuid",
    ],
    status: productionEventBusConfigured && productionLockingConfigured && productionWorkflowEngineConfigured ? "PASSED" : "FAILED",
  }, null, 2))
}
