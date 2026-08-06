import { CUSTOMER_SAFE_EVENTS } from "./status"

export async function hydrateOmsOrder(omsService: any, order: any) {
  const [vendorOrders, timeline, assignments, cancellationRequests, returnRequests, groups] = await Promise.all([
    omsService.listOmsVendorOrders({ oms_order_id: order.id }, { order: { created_at: "ASC" } }),
    omsService.listOmsOrderEvents({ oms_order_id: order.id }, { order: { created_at: "ASC" } }),
    omsService.listOmsFulfillmentAssignments({ oms_order_id: order.id }, { order: { created_at: "ASC" } }),
    omsService.listOmsCancellationRequests({ oms_order_id: order.id }, { order: { created_at: "ASC" } }),
    omsService.listOmsReturnRequests({ oms_order_id: order.id }, { order: { created_at: "ASC" } }),
    omsService.listOmsOrderGroups({ oms_order_id: order.id }, { order: { created_at: "ASC" } }),
  ])
  return { ...order, vendor_orders: vendorOrders, line_items: groups, fulfillment_assignments: assignments, timeline, cancellation_requests: cancellationRequests, return_requests: returnRequests }
}

export function customerSafeOrder(order: any, vendorOrders: any[], events: any[]) {
  return {
    id: order.id,
    order_id: order.order_id,
    display_id: order.display_id,
    order_date: order.created_at,
    region_id: order.region_id,
    currency_code: order.currency_code,
    total: order.total,
    oms_status: order.oms_status,
    shipments: vendorOrders.map((vendorOrder) => ({
      status: vendorOrder.status,
      fulfillment_status: vendorOrder.fulfillment_status,
      tracking: vendorOrder.metadata?.tracking
        ? { carrier: vendorOrder.metadata.tracking.carrier, tracking_number: vendorOrder.metadata.tracking.tracking_number, tracking_url: vendorOrder.metadata.tracking.tracking_url }
        : null,
    })),
    timeline: events
      .filter((event) => CUSTOMER_SAFE_EVENTS.has(event.event_type))
      .map((event) => ({ event_type: event.event_type, status: event.new_status, message: event.message, created_at: event.created_at })),
  }
}
