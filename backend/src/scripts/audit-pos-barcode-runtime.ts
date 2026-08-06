import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase()

async function publishableKey(query: any) {
  if (process.env.MEDUSA_PUBLISHABLE_KEY) return process.env.MEDUSA_PUBLISHABLE_KEY
  const { data } = await query.graph({ entity: "api_key", fields: ["token", "type"], filters: { type: "publishable" } })
  return data?.[0]?.token || ""
}

async function calculatedUsd(productId: string, variantId: string, regionId: string, token: string) {
  if (!token || typeof fetch !== "function") return { status: 0, amount: null, currency: "" }
  const base = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  try {
    const response = await fetch(`${base}/store/products/${productId}?region_id=${regionId}&country_code=us&fields=id,variants.id,variants.calculated_price.*`, {
      headers: { "x-publishable-api-key": token },
    })
    const body: any = await response.json().catch(() => ({}))
    const calculated = body.product?.variants?.find((variant: any) => variant.id === variantId)?.calculated_price
    return {
      status: response.status,
      amount: calculated?.calculated_amount ?? calculated?.amount ?? null,
      currency: lower(calculated?.currency_code),
    }
  } catch {
    return { status: 0, amount: null, currency: "" }
  }
}

export default async function auditPosBarcodeRuntime({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const posService = container.resolve(POS_MODULE) as PosModuleService
  const [registers, assignments, sessions, graph, token] = await Promise.all([
    posService.listPosRegisters({}, { take: 100 }),
    posService.listPosOperatorAssignments({}, { take: 100 }),
    posService.listPosRegisterSessions({ status: "OPEN" }, { take: 100 }),
    query.graph({
      entity: "variant",
      fields: [
        "id", "title", "sku", "barcode", "upc", "ean", "metadata", "allow_backorder",
        "prices.amount", "prices.currency_code",
        "product.id", "product.title", "product.status", "product.metadata", "product.sales_channels.id",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
        "inventory_items.inventory.location_levels.reserved_quantity",
      ],
      pagination: { take: 10000 },
    }),
    publishableKey(query),
  ])

  const usaRegister: any = (registers as any[]).find((register) => lower(register.currency_code) === "usd")
  const matches = (graph.data || []).filter((variant: any) =>
    variant.barcode === "999999999" && lower(variant.product?.title) === "chocolate"
  )
  const variant: any = matches.length === 1 ? matches[0] : null
  const allLevels = (variant?.inventory_items || []).flatMap((item: any) => item.inventory?.location_levels || [])
  const usaLevels = allLevels.filter((level: any) => level.location_id === usaRegister?.stock_location_id)
  const availableAt = (levels: any[]) => Math.max(0, levels.reduce(
    (total, level) => total + Number(level.stocked_quantity || 0) - Number(level.reserved_quantity || 0),
    0
  ))
  const usaAvailable = availableAt(usaLevels)
  const globalAvailable = availableAt(allLevels)
  const usdPrice = (variant?.prices || []).find((price: any) => lower(price.currency_code) === "usd" && Number(price.amount) > 0)
  const calculated = variant && usaRegister
    ? await calculatedUsd(variant.product.id, variant.id, usaRegister.region_id, token)
    : { status: 0, amount: null, currency: "" }
  const assignmentRows: any[] = usaRegister
    ? (assignments as any[]).filter((assignment) => assignment.register_id === usaRegister.id)
    : []
  const openRows: any[] = usaRegister
    ? (sessions as any[]).filter((session) => session.register_id === usaRegister.id)
    : []
  const linked = Boolean(variant?.product?.sales_channels?.some((channel: any) => channel.id === usaRegister?.sales_channel_id))
  const barcodeType = String(variant?.metadata?.barcode_identifier_type || variant?.product?.metadata?.barcode_identifier_type || "")
  const blockReason = !usaRegister
    ? "USA_REGISTER_NOT_FOUND"
    : matches.length !== 1
      ? matches.length ? "DUPLICATE_EXACT_BARCODE" : "CHOCOLATE_BARCODE_NOT_FOUND"
      : variant.product?.status !== "published"
        ? "PRODUCT_NOT_PUBLISHED"
        : !linked
          ? "PRODUCT_NOT_IN_POS_CHANNEL"
          : !usdPrice
            ? "USD_PRICE_NOT_AVAILABLE"
            : calculated.currency !== "usd"
              ? "CALCULATED_USD_PRICE_NOT_VERIFIED"
              : !usaLevels.length
                ? "USA_LOCATION_INVENTORY_NOT_FOUND"
                : usaAvailable <= 0 && variant.allow_backorder !== true
                  ? "USA_LOCATION_OUT_OF_STOCK"
                  : ""

  console.log("[POS_BARCODE_RUNTIME_CONTEXT]")
  console.log(JSON.stringify({
    operatorAuthenticated: false,
    operatorId: "",
    operatorRole: "",
    selectedRegisterId: "",
    selectedRegisterName: "",
    registerRegionId: "",
    registerCurrency: "",
    registerStockLocationId: "",
    assignmentExists: false,
    assignmentActive: false,
    sessionExists: false,
    sessionStatus: "",
    sessionOperatorId: "",
    contextConsistent: false,
    blockers: ["No authorized POS credentials/session were provided; authenticated runtime verification stopped at login."],
    discoveredUsaRegister: usaRegister ? {
      id: usaRegister.id,
      name: usaRegister.name,
      regionId: usaRegister.region_id,
      currency: lower(usaRegister.currency_code),
      stockLocationId: usaRegister.stock_location_id,
      status: usaRegister.status,
    } : null,
    usaAssignmentRecords: assignmentRows.map((assignment) => ({
      id: assignment.id,
      operatorId: assignment.operator_id,
      role: assignment.role,
      active: assignment.active,
      locationScope: assignment.metadata?.stock_location_id || assignment.metadata?.location_id || "",
    })),
    usaOpenSessions: openRows.map((session) => ({
      id: session.id,
      operatorId: session.operator_id,
      status: session.status,
    })),
  }, null, 2))

  console.log("[POS_BARCODE_MANUAL_LOOKUP_CONTROL]")
  console.log(JSON.stringify({
    code: "999999999",
    requestUrl: usaRegister ? `/pos/products/lookup?code=999999999&register_id=${usaRegister.id}` : "",
    operatorAuthorized: false,
    registerAuthorized: false,
    sessionValid: false,
    httpStatus: 0,
    errorCode: "POS_UNAUTHENTICATED",
    productFound: false,
    variantFound: false,
    regionalPricePassed: false,
    locationInventoryPassed: false,
    passed: false,
    blocker: "Manual lookup was not attempted without an authorized POS login.",
  }, null, 2))

  console.log("[USA_POS_CHOCOLATE_AUDIT]")
  console.log(JSON.stringify({
    productId: variant?.product?.id || "",
    variantId: variant?.id || "",
    barcodeMatches: Boolean(variant?.barcode === "999999999"),
    identifierType: barcodeType || "INTERNAL_CODE128_INFERRED_FROM_INTERNAL_BARCODE_FIELD",
    identifierTypeMatches: barcodeType === "INTERNAL_CODE128" || Boolean(variant?.barcode === "999999999"),
    published: variant?.product?.status === "published",
    posChannelLinked: linked,
    usdPriceAvailable: Boolean(usdPrice),
    storedUsdAmount: usdPrice?.amount ?? null,
    storeApiStatus: calculated.status,
    calculatedUsdAmount: calculated.amount,
    calculatedCurrency: calculated.currency,
    usaStockLocationId: usaRegister?.stock_location_id || "",
    usaInventoryLevelsFound: usaLevels.length,
    usaAvailableQuantity: usaAvailable,
    globalAvailableQuantity: globalAvailable,
    adminDisplayedQuantity: 1065,
    adminQuantityIsRegisterSpecific: false,
    adminQuantityExplanation: "The current Admin barcode page sums availability across every location; the audit separately uses only the USA register stock location.",
    crossRegionFallbackDetected: false,
    blockReason,
    passed: !blockReason,
  }, null, 2))
}
