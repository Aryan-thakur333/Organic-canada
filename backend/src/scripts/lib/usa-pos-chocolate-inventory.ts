import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../../modules/pos"

export const USA_POS_REGISTER_ID = "01KYMKWP9T4YWNMZA47AZNQSY3"
export const USA_POS_LOCATION_ID = "sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ"
export const USA_POS_SESSION_ID = "01KYP39VH0W0JKFYZMNNYPA6A9"
export const USA_POS_OPERATOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16"
export const CHOCOLATE_BARCODE = "999999999"
export const CHOCOLATE_USD_PRICE = 16.99
export const CHOCOLATE_APPROVED_USA_STOCKED_QUANTITY = 20
export const CHOCOLATE_CANADA_STOCKED_BASELINE = 991
export const INVENTORY_APPROVAL_EVENT = "USA_POS_INVENTORY_APPROVAL_APPLIED"

export const USA_POS_INVENTORY_HEADERS = [
  "product_id",
  "variant_id",
  "inventory_item_id",
  "stock_location_id",
  "current_stocked_quantity",
  "current_reserved_quantity",
  "current_available_quantity",
  "approved_stocked_quantity",
  "approval_status",
  "approved_by",
  "approval_reference",
  "snapshot_updated_at",
  "notes",
] as const

export type ApprovalValues = Record<(typeof USA_POS_INVENTORY_HEADERS)[number] | string, string>

export type UsaPosInventorySnapshot = {
  productId: string
  productTitle: string
  variantId: string
  variantTitle: string
  barcode: string
  sku: string
  inventoryItemId: string
  usaLocationId: string
  usaLevelId: string
  usaLevelExists: boolean
  usaLevelUpdatedAt: string
  usaStockedQuantity: number
  usaReservedQuantity: number
  usaAvailableQuantity: number
  canadaLocationId: string
  canadaStockedQuantity: number
  canadaReservedQuantity: number
  canadaAvailableQuantity: number
  globalDisplayedQuantity: number
  usdPrice: number
  currencyCode: string
  posChannelLinked: boolean
  salesChannelId: string
  allowBackorder: boolean
}

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase()
const quantity = (value: unknown) => Number(value || 0)
const available = (levels: any[]) => Math.max(0, levels.reduce(
  (total, level) => total + quantity(level.stocked_quantity) - quantity(level.reserved_quantity),
  0
))

export async function loadUsaPosChocolateInventorySnapshot(container: any): Promise<UsaPosInventorySnapshot> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const inventory = container.resolve(Modules.INVENTORY) as any
  const pos = container.resolve(POS_MODULE) as any
  const [usaRegister, registers, graph] = await Promise.all([
    pos.retrievePosRegister(USA_POS_REGISTER_ID),
    pos.listPosRegisters({}, { take: 100 }),
    query.graph({
      entity: "variant",
      fields: [
        "id", "title", "sku", "barcode", "allow_backorder", "prices.amount", "prices.currency_code",
        "product.id", "product.title", "product.status", "product.sales_channels.id",
        "inventory_items.inventory_item_id",
      ],
      pagination: { take: 10000 },
    }),
  ])
  if (!usaRegister || usaRegister.status !== "ACTIVE") throw new Error("The approved USA POS register is missing or inactive")
  if (usaRegister.stock_location_id !== USA_POS_LOCATION_ID || lower(usaRegister.currency_code) !== "usd") {
    throw new Error("The USA register location/currency snapshot has changed")
  }
  const matches = (graph.data || []).filter((entry: any) =>
    String(entry.barcode || "") === CHOCOLATE_BARCODE && lower(entry.product?.title) === "chocolate"
  )
  if (matches.length !== 1) throw new Error(`Expected one exact chocolate barcode match; found ${matches.length}`)
  const variant = matches[0]
  if (lower(variant.title) !== "standard") throw new Error("The chocolate Standard variant snapshot has changed")
  if (variant.product?.status !== "published") throw new Error("Chocolate is not published")
  const itemIds: string[] = [...new Set<string>(
    (variant.inventory_items || []).map((entry: any): string => String(entry.inventory_item_id || "")).filter(Boolean)
  )]
  if (itemIds.length !== 1) throw new Error(`Expected one linked chocolate inventory item; found ${itemIds.length}`)
  const inventoryItemId = itemIds[0]
  const levels = await inventory.listInventoryLevels({ inventory_item_id: inventoryItemId })
  const usaLevels = levels.filter((entry: any) => entry.location_id === USA_POS_LOCATION_ID)
  if (usaLevels.length > 1) throw new Error("Duplicate USA inventory levels detected for chocolate")
  const canadaRegister = (registers as any[]).find((entry) => lower(entry.currency_code) === "cad")
  if (!canadaRegister?.stock_location_id) throw new Error("Canada POS stock location was not found")
  const canadaLevels = levels.filter((entry: any) => entry.location_id === canadaRegister.stock_location_id)
  const usdPrices = (variant.prices || []).filter((entry: any) => lower(entry.currency_code) === "usd")
  if (usdPrices.length !== 1) throw new Error(`Expected one USD chocolate price; found ${usdPrices.length}`)
  const usdPrice = Number(usdPrices[0].amount)
  const usaLevel = usaLevels[0]
  return {
    productId: String(variant.product.id),
    productTitle: String(variant.product.title || ""),
    variantId: String(variant.id),
    variantTitle: String(variant.title || ""),
    barcode: String(variant.barcode || ""),
    sku: String(variant.sku || ""),
    inventoryItemId,
    usaLocationId: USA_POS_LOCATION_ID,
    usaLevelId: String(usaLevel?.id || ""),
    usaLevelExists: Boolean(usaLevel),
    usaLevelUpdatedAt: usaLevel?.updated_at ? new Date(usaLevel.updated_at).toISOString() : "",
    usaStockedQuantity: quantity(usaLevel?.stocked_quantity),
    usaReservedQuantity: quantity(usaLevel?.reserved_quantity),
    usaAvailableQuantity: available(usaLevels),
    canadaLocationId: String(canadaRegister.stock_location_id),
    canadaStockedQuantity: canadaLevels.reduce((sum: number, entry: any) => sum + quantity(entry.stocked_quantity), 0),
    canadaReservedQuantity: canadaLevels.reduce((sum: number, entry: any) => sum + quantity(entry.reserved_quantity), 0),
    canadaAvailableQuantity: available(canadaLevels),
    globalDisplayedQuantity: available(levels),
    usdPrice,
    currencyCode: "usd",
    posChannelLinked: Boolean(variant.product.sales_channels?.some((entry: any) => entry.id === usaRegister.sales_channel_id)),
    salesChannelId: String(usaRegister.sales_channel_id),
    allowBackorder: variant.allow_backorder === true,
  }
}

export type EvaluatedApproval = {
  rowNumber: number
  values: ApprovalValues
  approvedQuantity: number | null
  state: "APPROVED" | "PENDING" | "INVALID" | "STALE"
  reasons: string[]
  action: "CREATE" | "UPDATE" | "NO_CHANGE" | "NONE"
  idempotentAuditMatch: boolean
}

const integerText = (value: string) => /^\d+$/.test(value)
const sameInstant = (left: string, right: string) => Boolean(left && right)
  && new Date(left).getTime() === new Date(right).getTime()

export function evaluateUsaPosInventoryApprovals({
  rows,
  snapshot,
  usedApprovalReferences = new Set<string>(),
  idempotentApprovalReferences = new Set<string>(),
  now = new Date(),
}: {
  rows: Array<{ rowNumber: number; values: ApprovalValues }>
  snapshot: UsaPosInventorySnapshot
  usedApprovalReferences?: Set<string>
  idempotentApprovalReferences?: Set<string>
  now?: Date
}) {
  const seenRows = new Set<string>()
  const seenReferences = new Set<string>()
  const evaluated: EvaluatedApproval[] = rows.map((row) => {
    const values = row.values
    const reasons: string[] = []
    const staleReasons: string[] = []
    const key = `${values.variant_id}:${values.inventory_item_id}:${values.stock_location_id}`
    if (seenRows.has(key)) reasons.push("duplicate product/variant/inventory/location row")
    seenRows.add(key)
    if (values.product_id !== snapshot.productId) reasons.push("product_id does not match the live chocolate product")
    if (values.variant_id !== snapshot.variantId) reasons.push("variant_id does not match the live chocolate variant")
    if (values.inventory_item_id !== snapshot.inventoryItemId) reasons.push("inventory_item_id link has changed")
    if (values.stock_location_id !== USA_POS_LOCATION_ID || values.stock_location_id !== snapshot.usaLocationId) {
      reasons.push("stock_location_id is not the approved USA POS location")
    }

    for (const field of ["current_stocked_quantity", "current_reserved_quantity", "current_available_quantity"] as const) {
      if (!integerText(values[field])) reasons.push(`${field} must be an integer >= 0`)
    }
    const currentStocked = integerText(values.current_stocked_quantity) ? Number(values.current_stocked_quantity) : NaN
    const currentReserved = integerText(values.current_reserved_quantity) ? Number(values.current_reserved_quantity) : NaN
    const currentAvailable = integerText(values.current_available_quantity) ? Number(values.current_available_quantity) : NaN
    const status = String(values.approval_status || "").trim().toUpperCase()
    const approvedQuantity = integerText(values.approved_stocked_quantity) ? Number(values.approved_stocked_quantity) : null
    const reference = String(values.approval_reference || "").trim()
    const idempotentAuditMatch = status === "APPROVED" && reference.length > 0 && idempotentApprovalReferences.has(reference)

    if (!idempotentAuditMatch) {
      if (currentStocked !== snapshot.usaStockedQuantity) staleReasons.push("current stocked quantity no longer matches")
      if (currentReserved !== snapshot.usaReservedQuantity) staleReasons.push("current reserved quantity no longer matches")
      if (currentAvailable !== snapshot.usaAvailableQuantity) staleReasons.push("current available quantity no longer matches")
      const capturedAt = new Date(values.snapshot_updated_at)
      if (!values.snapshot_updated_at || Number.isNaN(capturedAt.getTime())) {
        reasons.push("snapshot_updated_at must be a valid timestamp")
      } else {
        const age = now.getTime() - capturedAt.getTime()
        if (age < -5 * 60 * 1000 || age > 24 * 60 * 60 * 1000) staleReasons.push("snapshot timestamp is stale")
        if (snapshot.usaLevelExists && !sameInstant(values.snapshot_updated_at, snapshot.usaLevelUpdatedAt)) {
          staleReasons.push("inventory level updated_at no longer matches")
        }
      }
    }

    if (!status) reasons.push("approval_status is required")
    if (status === "PENDING") {
      if (values.approved_stocked_quantity || values.approved_by || reference) {
        reasons.push("PENDING rows must leave approval fields blank")
      }
    } else if (status === "APPROVED") {
      if (approvedQuantity == null) reasons.push("approved_stocked_quantity must be an integer >= 0")
      if (!String(values.approved_by || "").trim()) reasons.push("approved_by is required")
      if (!reference) reasons.push("approval_reference is required")
      if (reference && !/^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/.test(reference)) reasons.push("approval_reference format is invalid")
      if (reference && seenReferences.has(reference)) reasons.push("duplicate approval_reference in CSV")
      if (reference && usedApprovalReferences.has(reference)) reasons.push("approval_reference was already used")
      if (approvedQuantity != null && approvedQuantity < snapshot.usaReservedQuantity) {
        reasons.push("approved quantity cannot be below live reservations")
      }
      if (reference) seenReferences.add(reference)
    } else if (status) {
      reasons.push("approval_status must be exactly PENDING or APPROVED")
    }

    const state: EvaluatedApproval["state"] = reasons.length
      ? "INVALID"
      : staleReasons.length
        ? "STALE"
        : status === "PENDING"
          ? "PENDING"
          : "APPROVED"
    const action: EvaluatedApproval["action"] = state !== "APPROVED" || approvedQuantity == null
      ? "NONE"
      : approvedQuantity === snapshot.usaStockedQuantity
        ? "NO_CHANGE"
        : snapshot.usaLevelExists
          ? "UPDATE"
          : "CREATE"
    return { rowNumber: row.rowNumber, values, approvedQuantity, state, reasons: [...reasons, ...staleReasons], action, idempotentAuditMatch }
  })

  return {
    rows: evaluated,
    rowsRead: evaluated.length,
    approvedRows: evaluated.filter((entry) => entry.state === "APPROVED").length,
    plannedUpdates: evaluated.filter((entry) => ["CREATE", "UPDATE"].includes(entry.action)).length,
    alreadyCorrect: evaluated.filter((entry) => entry.action === "NO_CHANGE").length,
    pendingRows: evaluated.filter((entry) => entry.state === "PENDING").length,
    invalidRows: evaluated.filter((entry) => entry.state === "INVALID").length,
    staleRows: evaluated.filter((entry) => entry.state === "STALE").length,
    passed: evaluated.length === 1 && evaluated[0].state === "APPROVED",
  }
}
