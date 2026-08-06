import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { OMS_MODULE } from "../../modules/oms"
import { validateRegionCurrency } from "../../utils/oms/region-safety"
import { locationSupportsOrder } from "../../utils/oms/location-policy"

export type IngestOmsOrderInput = { order_id: string }

export function isDigital(item: any): boolean {
  const metadata = { ...(item.variant?.product?.metadata || {}), ...(item.variant?.metadata || {}), ...(item.metadata || {}) }
  return metadata.is_digital === true || metadata.product_type === "digital" || (item.variant?.product?.digital_assets || []).length > 0
}

export function itemSnapshot(item: any, vendorId: string, currencyCode: string) {
  const metadata = item.metadata || {}
  const quantity = Number(item.quantity || 0)
  const unitPrice = Number(item.unit_price || 0)
  return {
    line_item_id: item.id,
    product_id: item.product_id || item.variant?.product?.id || null,
    variant_id: item.variant_id || item.variant?.id || null,
    vendor_id: vendorId,
    title: item.title,
    quantity,
    unit_price: unitPrice,
    subtotal: Number(item.subtotal ?? quantity * unitPrice),
    tax: Number(item.tax_total || 0),
    discount: Number(item.discount_total || 0),
    currency_code: currencyCode,
    requires_shipping: !isDigital(item),
    is_digital: isDigital(item),
    is_personalized: Boolean(metadata.personalization_hash || metadata.personalization),
    is_subscription: metadata.is_subscription === true || metadata.subscription_plan != null,
    bundle_parent_id: metadata.bundle_parent_id || null,
    bundle_child_ids: metadata.bundle_child_ids || null,
    metadata,
  }
}

async function appendEvent(service: any, data: Record<string, any>) {
  return service.createOmsOrderEvents({
    actor_type: "system",
    message: data.event_type,
    ...data,
  })
}

const ingestOmsOrderStep = createStep(
  "ingest-oms-order",
  async ({ order_id }: IngestOmsOrderInput, { container }) => {
    const service: any = container.resolve(OMS_MODULE)
    const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger: any = container.resolve(ContainerRegistrationKeys.LOGGER)

    const existing = await service.listOmsOrders({ order_id }, { take: 1 })
    const existingOmsOrder = existing?.[0]
    if (existingOmsOrder?.metadata?.ingestion_complete === true) {
      return new StepResponse({ oms_order: existingOmsOrder, reused: true }, { created: false })
    }

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id", "display_id", "region_id", "currency_code", "customer_id", "sales_channel_id",
        "total", "payment_status", "fulfillment_status", "metadata", "created_at",
        "region.id", "region.currency_code", "region.countries.iso_2", "shipping_address.country_code",
        "items.id", "items.title", "items.quantity", "items.unit_price", "items.subtotal",
        "items.tax_total", "items.discount_total", "items.product_id", "items.variant_id", "items.metadata",
        "items.variant.id", "items.variant.metadata", "items.variant.product.id", "items.variant.product.metadata",
        "items.variant.product.vendor.id", "items.variant.product.digital_assets.id",
      ],
      filters: { id: order_id },
    })
    const order = orders?.[0]
    if (!order) throw new Error(`Medusa order ${order_id} was not found`)

    const countryCode = order.shipping_address?.country_code || null
    const holdReasons = validateRegionCurrency({
      regionId: order.region_id,
      regionCurrency: order.region?.currency_code,
      orderCurrency: order.currency_code,
      countryCode,
      regionCountryCodes: (order.region?.countries || []).map((entry: any) => entry.iso_2).filter(Boolean),
      items: order.items,
    })
    if (!order.sales_channel_id) holdReasons.push("SALES_CHANNEL_MISSING")

    let createdParent = false
    let omsOrder = existingOmsOrder
    if (!omsOrder) {
      const createData = {
      order_id: order.id,
      display_id: order.display_id ?? null,
      region_id: order.region_id || null,
      currency_code: order.currency_code?.toLowerCase() || null,
      customer_id: order.customer_id || null,
      sales_channel_id: order.sales_channel_id || null,
      oms_status: holdReasons.length ? "ON_HOLD" : ["captured", "paid", "partially_refunded"].includes(String(order.payment_status || "").toLowerCase()) ? "CONFIRMED" : "PENDING",
      payment_status: String(order.payment_status || "NOT_PAID").toUpperCase(),
      fulfillment_status: String(order.fulfillment_status || "NOT_FULFILLED").toUpperCase(),
      total: Number(order.total || 0),
        metadata: { idempotency_key: `oms:${order.id}`, hold_reasons: holdReasons, ingestion_complete: false },
      }
      try {
        omsOrder = await service.createOmsOrders(createData)
        createdParent = true
      } catch (error: any) {
        if (!/duplicate|unique/i.test(String(error?.message || error))) throw error
        omsOrder = (await service.listOmsOrders({ order_id }, { take: 1 }))?.[0]
        if (!omsOrder) throw error
      }
    }

    if (createdParent) {
      await appendEvent(service, { oms_order_id: omsOrder.id, event_type: "ORDER_RECEIVED", new_status: omsOrder.oms_status, message: `Order ${order.display_id || order.id} received by OMS` })
      if (["captured", "paid", "partially_refunded"].includes(String(order.payment_status || "").toLowerCase())) {
        await appendEvent(service, { oms_order_id: omsOrder.id, event_type: "PAYMENT_CONFIRMED", new_status: omsOrder.oms_status, message: "Payment confirmed by Medusa" })
      }
      for (const reason of holdReasons) {
        await appendEvent(service, { oms_order_id: omsOrder.id, event_type: "ORDER_ON_HOLD", previous_status: "PENDING", new_status: "ON_HOLD", message: reason, metadata: { reason } })
        logger.warn(`[OMS_ORDER_ON_HOLD] order_id=${order.id} reason=${reason}`)
      }
    }

    const productIds = [...new Set((order.items || []).map((item: any) => item?.product_id || item?.variant?.product?.id).filter(Boolean))]
    const vendorMap = new Map<string, string>()
    if (productIds.length) {
      const { data: products } = await query.graph({ entity: "product", fields: ["id", "metadata", "vendor.id"], filters: { id: productIds } })
      for (const product of products || []) vendorMap.set(product.id, product.vendor?.id || product.metadata?.vendor_id || "PLATFORM")
    }

    const buckets = new Map<string, any[]>()
    for (const item of order.items || []) {
      const productId = item?.product_id || item?.variant?.product?.id
      const vendorId = vendorMap.get(productId) || "PLATFORM"
      const snapshot = itemSnapshot(item, vendorId, order.currency_code)
      buckets.set(vendorId, [...(buckets.get(vendorId) || []), snapshot])
    }

    let hasUnassignedPhysical = false
    for (const [vendorId, items] of buckets) {
      const itemTotal = items.reduce((sum, item) => sum + item.subtotal, 0)
      const existingVendorOrders = await service.listOmsVendorOrders({ oms_order_id: omsOrder.id, vendor_id: vendorId }, { take: 1 })
      let vendorOrder = existingVendorOrders?.[0]
      const createdVendor = !vendorOrder
      if (!vendorOrder) vendorOrder = await service.createOmsVendorOrders({
        oms_order_id: omsOrder.id,
        order_id: order.id,
        vendor_id: vendorId,
        vendor_order_reference: `${order.display_id || order.id}-${vendorId === "PLATFORM" ? "PLATFORM" : vendorId.slice(-8)}`,
        status: holdReasons.length ? "ON_HOLD" : "PENDING",
        fulfillment_status: items.some((item) => item.requires_shipping) ? "NOT_FULFILLED" : "NOT_REQUIRED",
        item_total: itemTotal,
        currency_code: order.currency_code.toLowerCase(),
        metadata: { items, physical_item_count: items.filter((item) => item.requires_shipping).length, digital_item_count: items.filter((item) => item.is_digital).length },
      })
      const existingGroups = await service.listOmsOrderGroups({ oms_order_id: omsOrder.id, group_type: "VENDOR", reference: vendorId }, { take: 1 })
      if (!existingGroups?.length) await service.createOmsOrderGroups({ oms_order_id: omsOrder.id, group_type: "VENDOR", reference: vendorId, metadata: { vendor_order_id: vendorOrder.id, items } })
      if (createdVendor) {
        await appendEvent(service, { oms_order_id: omsOrder.id, vendor_order_id: vendorOrder.id, event_type: "VENDOR_ORDER_CREATED", new_status: vendorOrder.status, message: `Operational vendor order created for ${vendorId}`, metadata: { vendor_id: vendorId } })
        logger.info(`[OMS_VENDOR_ORDER_CREATED] order_id=${order.id} vendor_id=${vendorId} oms_vendor_order_id=${vendorOrder.id}`)
      }

      const physicalItems = items.filter((item) => item.requires_shipping)
      if (!physicalItems.length) continue
      const existingAssignments = await service.listOmsFulfillmentAssignments({ vendor_order_id: vendorOrder.id }, { take: 1 })
      if (existingAssignments?.length) continue
      if (!createdVendor && vendorOrder.status === "ON_HOLD" && !vendorOrder.assigned_location_id) {
        hasUnassignedPhysical = true
        continue
      }

      const { data: links } = vendorId === "PLATFORM" ? { data: [] } : await query.graph({ entity: "vendor_stock_location", fields: ["stock_location_id"], filters: { vendor_id: vendorId } })
      let locationIds = (links || []).map((link: any) => link.stock_location_id).filter(Boolean)
      if (vendorId === "PLATFORM") {
        const { data: platformLocations } = await query.graph({ entity: "stock_location", fields: ["id"] })
        locationIds = (platformLocations || []).map((location: any) => location.id)
      }
      let assignedLocation: string | null = null
      const reservationIds: string[] = []

      if (locationIds.length) {
        let compatibleLocations: any[] = []
        try {
          const { data } = await query.graph({
            entity: "stock_location",
            fields: ["id", "address.country_code", "sales_channels.id", "fulfillment_sets.id", "fulfillment_sets.service_zones.geo_zones.country_code"],
            filters: { id: locationIds },
          })
          compatibleLocations = (data || []).filter((location: any) => locationSupportsOrder(location, countryCode, order.sales_channel_id))
        } catch (error: any) {
          logger.warn(`[OMS_LOCATION_POLICY_ERROR] order_id=${order.id} message=${String(error?.message || error)}`)
        }
        locationIds = compatibleLocations.map((location: any) => location.id)
        const variantIds = physicalItems.map((item) => item.variant_id).filter(Boolean)
        const { data: variants } = await query.graph({
          entity: "variant",
          fields: ["id", "manage_inventory", "allow_backorder", "inventory_items.inventory_item_id", "inventory_items.inventory.location_levels.location_id", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity", "inventory_items.inventory.reservation_items.id", "inventory_items.inventory.reservation_items.location_id", "inventory_items.inventory.reservation_items.line_item_id"],
          filters: { id: variantIds },
        })
        for (const locationId of locationIds) {
          const allAvailable = physicalItems.every((item) => {
            const variant = (variants || []).find((entry: any) => entry.id === item.variant_id)
            if (!variant || variant.manage_inventory === false || variant.allow_backorder) return true
            const levels = (variant.inventory_items || []).flatMap((link: any) => link.inventory?.location_levels || [])
            return levels.some((level: any) => level.location_id === locationId && Number(level.stocked_quantity || 0) - Number(level.reserved_quantity || 0) >= item.quantity)
          })
          if (allAvailable) { assignedLocation = locationId; break }
        }
        for (const variant of variants || []) {
          for (const link of variant.inventory_items || []) {
            for (const reservation of link.inventory?.reservation_items || []) if (reservation.location_id === assignedLocation && physicalItems.some((item) => item.line_item_id === reservation.line_item_id)) reservationIds.push(reservation.id)
          }
        }
      }

      if (!assignedLocation) {
        hasUnassignedPhysical = true
        await service.updateOmsVendorOrders({ id: vendorOrder.id, status: "ON_HOLD" })
        await appendEvent(service, { oms_order_id: omsOrder.id, vendor_order_id: vendorOrder.id, event_type: "NO_FULFILLMENT_LOCATION", previous_status: "PENDING", new_status: "ON_HOLD", message: "No compatible vendor stock location has sufficient inventory", metadata: { region_id: order.region_id, sales_channel_id: order.sales_channel_id } })
        logger.warn(`[OMS_ORDER_ON_HOLD] order_id=${order.id} vendor_id=${vendorId} reason=NO_FULFILLMENT_LOCATION`)
      } else {
        await service.updateOmsVendorOrders({ id: vendorOrder.id, assigned_location_id: assignedLocation, fulfillment_status: "ALLOCATED" })
        await service.createOmsFulfillmentAssignments({ oms_order_id: omsOrder.id, vendor_order_id: vendorOrder.id, stock_location_id: assignedLocation, status: "ASSIGNED", region_id: order.region_id, sales_channel_id: order.sales_channel_id, reservation_ids: reservationIds, metadata: { inventory_source: "MEDUSA_RESERVATIONS", cross_region: false } })
        await appendEvent(service, { oms_order_id: omsOrder.id, vendor_order_id: vendorOrder.id, event_type: "FULFILLMENT_ASSIGNED", new_status: "ALLOCATED", message: "Fulfillment location assigned", metadata: { stock_location_id: assignedLocation } })
        await appendEvent(service, { oms_order_id: omsOrder.id, vendor_order_id: vendorOrder.id, event_type: "INVENTORY_RESERVED", new_status: "ALLOCATED", message: reservationIds.length ? "Medusa inventory reservations recorded" : "Inventory availability recorded; no reservation IDs exposed by order graph", metadata: { reservation_ids: reservationIds } })
        logger.info(`[OMS_FULFILLMENT_ASSIGNED] order_id=${order.id} vendor_id=${vendorId} location_id=${assignedLocation}`)
      }
    }

    if (!holdReasons.length && !hasUnassignedPhysical && [...buckets.values()].some((items) => items.some((item) => item.requires_shipping)) && omsOrder.oms_status === "CONFIRMED") {
      await service.updateOmsOrders({ id: omsOrder.id, oms_status: "ALLOCATED", fulfillment_status: "ALLOCATED" })
      await appendEvent(service, { oms_order_id: omsOrder.id, event_type: "STATUS_CHANGED", previous_status: "CONFIRMED", new_status: "ALLOCATED", message: "All physical vendor orders have compatible fulfillment assignments" })
    }

    omsOrder = await service.updateOmsOrders({ id: omsOrder.id, metadata: { ...(omsOrder.metadata || {}), idempotency_key: `oms:${order.id}`, hold_reasons: holdReasons, ingestion_complete: true, ingestion_completed_at: new Date().toISOString() } })

    logger.info(`[OMS_ORDER_INGESTED] order_id=${order.id} oms_order_id=${omsOrder.id} status=${omsOrder.oms_status}`)
    return new StepResponse({ oms_order: omsOrder, reused: Boolean(existingOmsOrder) }, { created: createdParent, oms_order_id: omsOrder.id })
  },
  async (state: any, { container }) => {
    if (!state?.created || !state.oms_order_id) return
    const service: any = container.resolve(OMS_MODULE)
    const order = await service.retrieveOmsOrder(state.oms_order_id)
    await service.updateOmsOrders({ id: order.id, oms_status: "FAILED", metadata: { ...(order.metadata || {}), ingestion_complete: false, ingestion_failed: true } })
  }
)

export const ingestOmsOrderWorkflow = createWorkflow("ingest-oms-order-workflow", (input: IngestOmsOrderInput) => {
  return new WorkflowResponse(ingestOmsOrderStep(input))
})
