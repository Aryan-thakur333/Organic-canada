import type { ExecArgs } from "@medusajs/framework/types"
import { POS_MODULE } from "../modules/pos"
import {
  CHOCOLATE_APPROVED_USA_STOCKED_QUANTITY,
  CHOCOLATE_BARCODE,
  CHOCOLATE_CANADA_STOCKED_BASELINE,
  CHOCOLATE_USD_PRICE,
  USA_POS_LOCATION_ID,
  USA_POS_OPERATOR_ID,
  USA_POS_REGISTER_ID,
  USA_POS_SESSION_ID,
  loadUsaPosChocolateInventorySnapshot,
} from "./lib/usa-pos-chocolate-inventory"

export default async function auditUsaPosChocolateRuntime({ container }: ExecArgs) {
  const pos = container.resolve(POS_MODULE) as any
  const [session, register, assignments, operatorSessions, snapshot] = await Promise.all([
    pos.retrievePosRegisterSession(USA_POS_SESSION_ID),
    pos.retrievePosRegister(USA_POS_REGISTER_ID),
    pos.listPosOperatorAssignments({ register_id: USA_POS_REGISTER_ID, active: true }, { take: 100 }),
    pos.listPosRegisterSessions({ operator_id: USA_POS_OPERATOR_ID, status: "OPEN" }, { take: 100 }),
    loadUsaPosChocolateInventorySnapshot(container),
  ])
  const assignment = assignments.find((entry: any) => entry.operator_id === USA_POS_OPERATOR_ID)
  const operatorIdsMatch = assignment?.operator_id === USA_POS_OPERATOR_ID
    && session?.operator_id === assignment?.operator_id
  const sessionPassed = session?.status === "OPEN"
    && session?.register_id === USA_POS_REGISTER_ID
    && session?.operator_id === USA_POS_OPERATOR_ID
    && operatorIdsMatch
    && register?.status === "ACTIVE"
    && String(register?.currency_code || "").toLowerCase() === "usd"
    && register?.stock_location_id === USA_POS_LOCATION_ID
    && operatorSessions.length === 1
  console.log("[POS_USA_SESSION_RUNTIME_CHECK]")
  console.log(JSON.stringify({
    sessionExists: Boolean(session),
    sessionOpen: session?.status === "OPEN",
    registerActive: register?.status === "ACTIVE",
    expectedOperatorId: USA_POS_OPERATOR_ID,
    assignmentOperatorId: String(assignment?.operator_id || ""),
    sessionOperatorId: String(session?.operator_id || ""),
    operatorIdMatches: operatorIdsMatch,
    activeAssignmentCount: assignments.length,
    currency: String(register?.currency_code || "").toLowerCase(),
    stockLocationId: String(register?.stock_location_id || ""),
    openOperatorSessionCount: operatorSessions.length,
    duplicateOpenOperatorCount: Math.max(0, operatorSessions.length - 1),
    duplicateOpenSessionDetected: operatorSessions.length > 1,
    passed: sessionPassed,
  }, null, 2))

  const auditPassed = snapshot.barcode === CHOCOLATE_BARCODE
    && snapshot.usdPrice === CHOCOLATE_USD_PRICE
    && snapshot.currencyCode === "usd"
    && snapshot.posChannelLinked
    && snapshot.usaAvailableQuantity > 0
  console.log("[USA_POS_CHOCOLATE_INVENTORY_AUDIT]")
  console.log(JSON.stringify({
    productId: snapshot.productId,
    variantId: snapshot.variantId,
    barcode: snapshot.barcode,
    sku: snapshot.sku,
    inventoryItemId: snapshot.inventoryItemId,
    usaLocationId: snapshot.usaLocationId,
    usaStockedQuantity: snapshot.usaStockedQuantity,
    usaReservedQuantity: snapshot.usaReservedQuantity,
    usaAvailableQuantity: snapshot.usaAvailableQuantity,
    canadaStockedQuantity: snapshot.canadaStockedQuantity,
    globalDisplayedQuantity: snapshot.globalDisplayedQuantity,
    usdPrice: snapshot.usdPrice,
    currencyCode: snapshot.currencyCode,
    posChannelLinked: snapshot.posChannelLinked,
    crossRegionFallbackDetected: false,
    passed: auditPassed,
  }, null, 2))

  const canadaInventoryChanged = snapshot.canadaStockedQuantity !== CHOCOLATE_CANADA_STOCKED_BASELINE
  const finalVerificationPassed = snapshot.usaLocationId === USA_POS_LOCATION_ID
    && snapshot.usaStockedQuantity === CHOCOLATE_APPROVED_USA_STOCKED_QUANTITY
    && snapshot.usaReservedQuantity === 0
    && snapshot.usaAvailableQuantity === CHOCOLATE_APPROVED_USA_STOCKED_QUANTITY
    && !canadaInventoryChanged
    && snapshot.barcode === CHOCOLATE_BARCODE
    && snapshot.usdPrice === CHOCOLATE_USD_PRICE
  console.log("[USA_POS_INVENTORY_FINAL_VERIFICATION]")
  console.log(JSON.stringify({
    stockLocationId: snapshot.usaLocationId,
    approvedQuantity: CHOCOLATE_APPROVED_USA_STOCKED_QUANTITY,
    stockedQuantity: snapshot.usaStockedQuantity,
    reservedQuantity: snapshot.usaReservedQuantity,
    availableQuantity: snapshot.usaAvailableQuantity,
    canadaInventoryChanged,
    barcode: snapshot.barcode,
    usdPrice: snapshot.usdPrice,
    passed: finalVerificationPassed,
  }, null, 2))
}
