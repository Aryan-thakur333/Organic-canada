import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { OMS_MODULE } from "../../modules/oms"
import { assertTransition, type OmsStatus } from "./status"

export async function transitionOmsOrder(scope: any, order: any, nextStatus: OmsStatus, actorType: string, actorId?: string, message?: string) {
  const service: any = scope.resolve(OMS_MODULE)
  const logger: any = scope.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    assertTransition(order.oms_status, nextStatus)
  } catch (error) {
    await service.createOmsOrderEvents({
      oms_order_id: order.id, event_type: "ERROR", previous_status: order.oms_status, new_status: nextStatus,
      actor_type: actorType, actor_id: actorId || null, message: `Rejected transition ${order.oms_status} -> ${nextStatus}`,
      metadata: { code: "OMS_TRANSITION_REJECTED" },
    })
    logger.warn(`[OMS_TRANSITION_REJECTED] oms_order_id=${order.id} from=${order.oms_status} to=${nextStatus} actor_type=${actorType}`)
    throw error
  }
  if (order.oms_status === nextStatus) return order
  const updated = await service.updateOmsOrders({ id: order.id, oms_status: nextStatus })
  await service.createOmsOrderEvents({
    oms_order_id: order.id, event_type: "STATUS_CHANGED", previous_status: order.oms_status, new_status: nextStatus,
    actor_type: actorType, actor_id: actorId || null, message: message || `Status changed to ${nextStatus}`, metadata: null,
  })
  logger.info(`[OMS_STATUS_CHANGED] oms_order_id=${order.id} from=${order.oms_status} to=${nextStatus} actor_type=${actorType}`)
  return updated
}

export async function transitionVendorOrder(scope: any, vendorOrder: any, nextStatus: OmsStatus, actorType: string, actorId?: string, metadata?: Record<string, unknown>) {
  const service: any = scope.resolve(OMS_MODULE)
  const logger: any = scope.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    assertTransition(vendorOrder.status, nextStatus)
  } catch (error) {
    await service.createOmsOrderEvents({
      oms_order_id: vendorOrder.oms_order_id, vendor_order_id: vendorOrder.id, event_type: "ERROR",
      previous_status: vendorOrder.status, new_status: nextStatus, actor_type: actorType, actor_id: actorId || null,
      message: `Rejected vendor transition ${vendorOrder.status} -> ${nextStatus}`, metadata: { code: "OMS_TRANSITION_REJECTED" },
    })
    logger.warn(`[OMS_TRANSITION_REJECTED] oms_vendor_order_id=${vendorOrder.id} from=${vendorOrder.status} to=${nextStatus} actor_type=${actorType}`)
    throw error
  }
  const updated = await service.updateOmsVendorOrders({ id: vendorOrder.id, status: nextStatus, metadata: { ...(vendorOrder.metadata || {}), ...(metadata || {}) } })
  await service.createOmsOrderEvents({
    oms_order_id: vendorOrder.oms_order_id, vendor_order_id: vendorOrder.id, event_type: nextStatus === "SHIPPED" ? "SHIPMENT_CREATED" : "STATUS_CHANGED",
    previous_status: vendorOrder.status, new_status: nextStatus, actor_type: actorType, actor_id: actorId || null,
    message: `Vendor order status changed to ${nextStatus}`, metadata: metadata || null,
  })
  logger.info(`[OMS_STATUS_CHANGED] oms_vendor_order_id=${vendorOrder.id} from=${vendorOrder.status} to=${nextStatus} actor_type=${actorType}`)
  return updated
}
