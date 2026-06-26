import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const cartIdFromRequest = (req: MedusaRequest) => {
  const fromQuery = (req.query as any)?.cart_id
  if (typeof fromQuery === "string") return fromQuery
  return (req.originalUrl || req.url || "").match(/\/store\/carts\/([^/?]+)/)?.[1]
}

/**
 * Emits configuration-only checkout diagnostics. Customer data and addresses
 * are intentionally excluded from logs.
 */
export async function shippingDiagnostics(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const cartId = cartIdFromRequest(req)
  if (!cartId) return next()

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment: any = req.scope.resolve(Modules.FULFILLMENT)

  let profileIds: string[] = []
  let selectedMethodIds: string[] = []
  try {
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "items.variant.product.shipping_profile.id",
        "shipping_methods.id",
        "shipping_methods.shipping_option_id",
      ],
      filters: { id: cartId },
    })
    const cart: any = carts[0]
    profileIds = [...new Set((cart?.items || [])
      .map((item: any) => item.variant?.product?.shipping_profile?.id)
      .filter(Boolean))] as string[]
    selectedMethodIds = (cart?.shipping_methods || [])
      .map((method: any) => method.shipping_option_id || method.id)
      .filter(Boolean)
  } catch (error: any) {
    console.warn(JSON.stringify({
      event: "shipping_diagnostics_failed",
      cart_id: cartId,
      stage: "cart_graph",
      message: error.message,
    }))
  }

  let configuredOptions: any[] = []
  try {
    configuredOptions = await fulfillment.listShippingOptions(
      profileIds.length ? { shipping_profile_id: profileIds } : {},
      { relations: ["service_zone", "service_zone.fulfillment_set"] }
    )
  } catch (error: any) {
    console.warn(JSON.stringify({
      event: "shipping_diagnostics_failed",
      cart_id: cartId,
      stage: "shipping_options",
      message: error.message,
    }))
  }

  const configuredMethodIds = configuredOptions.map((option: any) => option.id)
  const fulfillmentSetIds = [...new Set(configuredOptions
    .map((option: any) => option.service_zone?.fulfillment_set?.id || option.service_zone?.fulfillment_set_id)
    .filter(Boolean))]

  const originalJson = res.json.bind(res)
  ;(res as any).json = (body: any) => {
    const returnedOptions = Array.isArray(body?.shipping_options) ? body.shipping_options : null
    const availableMethodIds = returnedOptions
      ? returnedOptions.map((option: any) => option.id)
      : configuredMethodIds

    const entry = {
      event: "shipping_checkout_diagnostics",
      cart_id: cartId,
      shipping_profile_ids: profileIds,
      available_shipping_method_ids: availableMethodIds,
      selected_shipping_method_ids: selectedMethodIds,
      fulfillment_set_ids: fulfillmentSetIds,
      endpoint: (req.originalUrl || req.url || "").split("?")[0],
      response_status: res.statusCode,
    }
    if (res.statusCode >= 400 || !profileIds.length || !availableMethodIds.length) {
      console.warn(JSON.stringify(entry))
    } else {
      console.log(JSON.stringify(entry))
    }
    return originalJson(body)
  }

  next()
}
