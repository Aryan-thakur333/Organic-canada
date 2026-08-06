import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { OMS_MODULE } from "../modules/oms"
import { ingestOmsOrderWorkflow } from "../workflows/oms/ingest-order"

export default async function verifyOmsFoundation({ container }: ExecArgs) {
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger: any = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: any = container.resolve(OMS_MODULE)
  const { data: initialOrders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "currency_code", "region_id", "metadata", "shipping_address.country_code", "items.product_id", "items.variant.product.id", "items.variant.product.vendor.id", "items.variant.product.metadata"],
    pagination: { take: 100, order: { created_at: "DESC" } },
  })
  let orders: any[] = initialOrders || []

  if (!orders.some((order: any) => String(order.currency_code).toLowerCase() === "usd")) {
    const regionService: any = container.resolve(Modules.REGION)
    const orderService: any = container.resolve(Modules.ORDER)
    const salesChannelService: any = container.resolve(Modules.SALES_CHANNEL)
    const regions = await regionService.listRegions({ currency_code: "usd" }, { take: 1 })
    const salesChannels = await salesChannelService.listSalesChannels({}, { take: 1 })
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "title", "metadata", "sales_channels.id", "vendor.id", "variants.id", "variants.title", "variants.prices.amount", "variants.prices.currency_code"],
      pagination: { take: 200 },
    })
    const product = (products || []).find((entry: any) => entry.variants?.some((variant: any) => variant.prices?.some((price: any) => price.currency_code === "usd")))
    const variant = product?.variants?.find((entry: any) => entry.prices?.some((price: any) => price.currency_code === "usd"))
    const price = variant?.prices?.find((entry: any) => entry.currency_code === "usd")
    if (regions[0] && product && variant && price) {
      const fixture = await orderService.createOrders({
        email: "oms-usa-verification@eatsie.test",
        currency_code: "usd",
        region_id: regions[0].id,
        sales_channel_id: product.sales_channels?.[0]?.id || salesChannels[0]?.id,
        status: "pending",
        total: Number(price.amount || 0),
        shipping_address: { first_name: "OMS", last_name: "Verifier", address_1: "1 Test Way", city: "Seattle", province: "WA", postal_code: "98101", country_code: "us" },
        items: [{ title: product.title || variant.title || "OMS USA fixture", quantity: 1, unit_price: Number(price.amount || 0), product_id: product.id, variant_id: variant.id }],
        metadata: { oms_verification_fixture: true, safe_test_order: true, created_by: "verify-oms-foundation" },
      } as any)
      const { data: refreshed } = await query.graph({
        entity: "order",
        fields: ["id", "display_id", "currency_code", "region_id", "metadata", "shipping_address.country_code", "items.product_id", "items.variant.product.id", "items.variant.product.vendor.id", "items.variant.product.metadata"],
        filters: { id: fixture.id },
      })
      orders = [...(refreshed || []), ...orders]
      logger.info(`[OMS_TEST_FIXTURE_CREATED] order_id=${fixture.id} currency_code=usd`)
    }
  }

  const country = (order: any) => String(order.shipping_address?.country_code || "").toLowerCase()
  const canada = (orders || []).find((order: any) => String(order.currency_code).toLowerCase() === "cad" && (!country(order) || country(order) === "ca"))
  const usa = (orders || []).find((order: any) => String(order.currency_code).toLowerCase() === "usd" && (!country(order) || country(order) === "us"))
  const distinctVendors = (order: any) => new Set((order.items || []).map((item: any) => item.variant?.product?.vendor?.id || item.variant?.product?.metadata?.vendor_id || "PLATFORM"))
  const multiVendor = (orders || []).find((order: any) => distinctVendors(order).size > 1)
  const candidates = [...new Map([canada, usa, multiVendor].filter(Boolean).map((order: any) => [order.id, order])).values()]
  let locationPolicyGraphWorking = false
  try {
    await query.graph({ entity: "stock_location", fields: ["id", "address.country_code", "sales_channels.id", "fulfillment_sets.id", "fulfillment_sets.service_zones.geo_zones.country_code"], pagination: { take: 1 } })
    locationPolicyGraphWorking = true
  } catch (error: any) {
    logger.warn(`[OMS_LOCATION_POLICY_GRAPH_FAILED] ${String(error?.message || error)}`)
  }

  const results: any[] = []
  for (const order of candidates as any[]) {
    const first = await ingestOmsOrderWorkflow(container).run({ input: { order_id: order.id } })
    const second = await ingestOmsOrderWorkflow(container).run({ input: { order_id: order.id } })
    const omsOrders = await service.listOmsOrders({ order_id: order.id })
    const omsOrder = omsOrders[0]
    const vendorOrders = omsOrder ? await service.listOmsVendorOrders({ oms_order_id: omsOrder.id }) : []
    const events = omsOrder ? await service.listOmsOrderEvents({ oms_order_id: omsOrder.id }) : []
    results.push({
      order_id: order.id,
      display_id: order.display_id,
      currency_code: order.currency_code,
      country_code: country(order) || null,
      oms_order_id: omsOrder?.id || null,
      status: omsOrder?.oms_status || null,
      hold_reasons: omsOrder?.metadata?.hold_reasons || [],
      first_reused: first.result.reused,
      second_reused: second.result.reused,
      oms_record_count: omsOrders.length,
      vendor_order_count: vendorOrders.length,
      expected_vendor_groups: distinctVendors(order).size,
      timeline_event_count: events.length,
      idempotent: omsOrders.length === 1 && second.result.reused === true,
    })
  }

  const output = {
    checked_at: new Date().toISOString(),
    available_order_count: (orders || []).length,
    canada_order_found: Boolean(canada),
    usa_order_found: Boolean(usa),
    multi_vendor_order_found: Boolean(multiVendor),
    location_policy_graph_working: locationPolicyGraphWorking,
    results,
    canada_passed: results.some((item) => item.order_id === canada?.id && item.currency_code?.toLowerCase() === "cad" && item.hold_reasons.length === 0),
    usa_passed: results.some((item) => item.order_id === usa?.id && item.currency_code?.toLowerCase() === "usd" && item.hold_reasons.length === 0),
    multi_vendor_passed: results.some((item) => item.order_id === multiVendor?.id && item.vendor_order_count === item.expected_vendor_groups && item.vendor_order_count > 1),
    idempotence_passed: results.length > 0 && results.every((item) => item.idempotent),
    timeline_passed: results.length > 0 && results.every((item) => item.timeline_event_count > 0),
  }
  logger.info(`[OMS_RUNTIME_VERIFICATION] ${JSON.stringify(output)}`)
}
