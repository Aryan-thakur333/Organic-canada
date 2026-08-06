import type { ExecArgs } from "@medusajs/framework/types"
import {
  createInventoryLevelsWorkflow,
  deleteInventoryLevelsWorkflow,
  updateInventoryLevelsWorkflow,
} from "@medusajs/core-flows"
import * as fs from "fs"
import * as path from "path"
import { POS_MODULE } from "../modules/pos"
import { readApprovedCsv } from "./lib/approved-pos-csv"
import {
  CHOCOLATE_BARCODE,
  CHOCOLATE_USD_PRICE,
  INVENTORY_APPROVAL_EVENT,
  USA_POS_INVENTORY_HEADERS,
  USA_POS_LOCATION_ID,
  USA_POS_REGISTER_ID,
  evaluateUsaPosInventoryApprovals,
  loadUsaPosChocolateInventorySnapshot,
  type ApprovalValues,
  type UsaPosInventorySnapshot,
} from "./lib/usa-pos-chocolate-inventory"

const DEFAULT_FILE = "usa-pos-chocolate-inventory-review.csv"

function argumentsMap(argumentsList: string[]) {
  const normalized = argumentsList.map((entry) => entry.startsWith("--") ? entry.slice(2) : entry)
  const flags = new Set(normalized.filter((entry) => !entry.includes("=")))
  const values = new Map<string, string>()
  for (const entry of normalized.filter((value) => value.includes("="))) {
    const index = entry.indexOf("=")
    values.set(entry.slice(0, index), entry.slice(index + 1))
  }
  return { flags, values }
}

function resolveApprovalFile(reference: string) {
  const reportsRoot = path.resolve(process.cwd(), "reports")
  const candidate = path.isAbsolute(reference) ? path.resolve(reference) : path.resolve(reportsRoot, reference)
  if (candidate !== reportsRoot && !candidate.startsWith(reportsRoot + path.sep)) {
    throw new Error("Approval CSV must be inside backend/reports")
  }
  return candidate
}

function verifyInventoryBackup(reference: string) {
  if (!reference || path.basename(reference) !== reference || !/^before-usa-pos-inventory-.+\.backup$/.test(reference)) {
    throw new Error("A current inventory-specific backup filename is required")
  }
  const backupRoot = path.resolve(process.cwd(), "..", "backups")
  const backupPath = path.resolve(backupRoot, reference)
  if (!backupPath.startsWith(backupRoot + path.sep) || !fs.existsSync(backupPath)) {
    throw new Error("Referenced inventory backup does not exist in the project backup directory")
  }
  const stat = fs.statSync(backupPath)
  const descriptor = fs.openSync(backupPath, "r")
  const headerBuffer = Buffer.alloc(5)
  try {
    fs.readSync(descriptor, headerBuffer, 0, 5, 0)
  } finally {
    fs.closeSync(descriptor)
  }
  const age = Date.now() - stat.mtimeMs
  if (!stat.isFile() || stat.size <= 0 || headerBuffer.toString("ascii") !== "PGDMP" || age < 0 || age > 4 * 60 * 60 * 1000) {
    throw new Error("Referenced inventory backup is empty, invalid, or stale")
  }
  return { backupPath, backupSize: stat.size }
}

function assertCatalogAndIsolation(snapshot: UsaPosInventorySnapshot) {
  if (snapshot.barcode !== CHOCOLATE_BARCODE) throw new Error("Chocolate barcode changed")
  if (snapshot.usdPrice !== CHOCOLATE_USD_PRICE || snapshot.currencyCode !== "usd") throw new Error("Chocolate USD price changed")
  if (!snapshot.posChannelLinked) throw new Error("Chocolate is no longer linked to the USA POS sales channel")
  if (snapshot.usaLocationId !== USA_POS_LOCATION_ID) throw new Error("USA stock location changed")
}

function auditMetadata(event: any) {
  return (event?.metadata || {}) as Record<string, any>
}

async function compensateInventoryWrite(container: any, action: "CREATE" | "UPDATE", before: UsaPosInventorySnapshot) {
  if (action === "UPDATE") {
    await updateInventoryLevelsWorkflow(container).run({
      input: { updates: [{
        id: before.usaLevelId,
        inventory_item_id: before.inventoryItemId,
        location_id: USA_POS_LOCATION_ID,
        stocked_quantity: before.usaStockedQuantity,
      }] },
    })
    return
  }
  const current = await loadUsaPosChocolateInventorySnapshot(container)
  if (current.usaLevelId) {
    await deleteInventoryLevelsWorkflow(container).run({ input: { id: [current.usaLevelId], force: true } })
  }
}

export default async function applyApprovedUsaPosInventory({ container, args }: ExecArgs) {
  const { flags, values } = argumentsMap(args || [])
  const apply = flags.has("apply")
  const dryRun = flags.has("dry-run") || !apply
  if (flags.has("apply") && flags.has("dry-run")) throw new Error("Choose only dry-run or apply")
  const fileReference = values.get("file") || DEFAULT_FILE
  if (apply && !values.has("file")) throw new Error("Apply requires an explicit file argument")
  const csvPath = resolveApprovalFile(fileReference)
  const rows = readApprovedCsv(csvPath, USA_POS_INVENTORY_HEADERS) as Array<{ rowNumber: number; values: ApprovalValues }>
  const pos = container.resolve(POS_MODULE) as any
  const [snapshot, auditEvents] = await Promise.all([
    loadUsaPosChocolateInventorySnapshot(container),
    pos.listPosAuditEvents({ event_type: INVENTORY_APPROVAL_EVENT }, { take: 10000 }),
  ])
  assertCatalogAndIsolation(snapshot)

  const usedReferences = new Set<string>()
  const idempotentReferences = new Set<string>()
  for (const row of rows) {
    const reference = String(row.values.approval_reference || "").trim()
    if (!reference) continue
    const matching = (auditEvents as any[]).filter((event) => {
      const metadata = auditMetadata(event)
      return metadata.approval_reference === reference
        && metadata.product_id === row.values.product_id
        && metadata.variant_id === row.values.variant_id
        && metadata.inventory_item_id === row.values.inventory_item_id
        && metadata.stock_location_id === row.values.stock_location_id
        && String(metadata.approved_stocked_quantity) === row.values.approved_stocked_quantity
    })
    const allWithReference = (auditEvents as any[]).filter((event) => auditMetadata(event).approval_reference === reference)
    if (matching.length === 1 && allWithReference.length === 1
      && /^\d+$/.test(row.values.approved_stocked_quantity)
      && snapshot.usaStockedQuantity === Number(row.values.approved_stocked_quantity)) {
      idempotentReferences.add(reference)
    } else if (allWithReference.length) {
      usedReferences.add(reference)
    }
  }

  const evaluation = evaluateUsaPosInventoryApprovals({
    rows,
    snapshot,
    usedApprovalReferences: usedReferences,
    idempotentApprovalReferences: idempotentReferences,
  })
  console.log("[USA_POS_INVENTORY_DRY_RUN]")
  console.log(JSON.stringify({
    rowsRead: evaluation.rowsRead,
    approvedRows: evaluation.approvedRows,
    plannedUpdates: evaluation.plannedUpdates,
    alreadyCorrect: evaluation.alreadyCorrect,
    pendingRows: evaluation.pendingRows,
    invalidRows: evaluation.invalidRows,
    staleRows: evaluation.staleRows,
    databaseWrites: 0,
    passed: evaluation.passed,
    rowResults: evaluation.rows.map((entry) => ({ rowNumber: entry.rowNumber, state: entry.state, action: entry.action, reasons: entry.reasons })),
  }, null, 2))
  if (dryRun) return
  if (!evaluation.passed) throw new Error("Inventory apply blocked: approval is pending, invalid, or stale")

  const backupReference = values.get("backup-reference") || ""
  const backup = verifyInventoryBackup(backupReference)
  const approved = evaluation.rows[0]
  const approvedQuantity = approved.approvedQuantity as number
  if (approved.action === "NO_CHANGE" && approved.idempotentAuditMatch) {
    console.log("[USA_POS_INVENTORY_APPLY]")
    console.log(JSON.stringify({
      approvedQuantity,
      previousUsaStocked: snapshot.usaStockedQuantity,
      newUsaStocked: snapshot.usaStockedQuantity,
      usaReserved: snapshot.usaReservedQuantity,
      usaAvailable: snapshot.usaAvailableQuantity,
      canadaInventoryChanged: false,
      barcodeChanged: false,
      priceChanged: false,
      alreadyCorrect: 1,
      databaseWrites: 0,
      passed: true,
    }, null, 2))
    return
  }

  const action = approved.action === "CREATE" ? "CREATE" : "UPDATE"
  let inventoryWriteCompleted = false
  try {
    if (approved.action === "CREATE") {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: [{
          inventory_item_id: snapshot.inventoryItemId,
          location_id: USA_POS_LOCATION_ID,
          stocked_quantity: approvedQuantity,
        }] },
      })
      inventoryWriteCompleted = true
    } else if (approved.action === "UPDATE") {
      await updateInventoryLevelsWorkflow(container).run({
        input: { updates: [{
          id: snapshot.usaLevelId,
          inventory_item_id: snapshot.inventoryItemId,
          location_id: USA_POS_LOCATION_ID,
          stocked_quantity: approvedQuantity,
        }] },
      })
      inventoryWriteCompleted = true
    }

    const after = await loadUsaPosChocolateInventorySnapshot(container)
    const expectedGlobal = snapshot.globalDisplayedQuantity + approvedQuantity - snapshot.usaStockedQuantity
    const verified = after.usaStockedQuantity === approvedQuantity
      && after.usaReservedQuantity === snapshot.usaReservedQuantity
      && after.usaAvailableQuantity === Math.max(0, approvedQuantity - snapshot.usaReservedQuantity)
      && after.canadaStockedQuantity === snapshot.canadaStockedQuantity
      && after.canadaReservedQuantity === snapshot.canadaReservedQuantity
      && after.globalDisplayedQuantity === expectedGlobal
      && after.barcode === snapshot.barcode
      && after.usdPrice === snapshot.usdPrice
      && after.salesChannelId === snapshot.salesChannelId
      && after.posChannelLinked === snapshot.posChannelLinked
    if (!verified) throw new Error("Post-apply inventory isolation verification failed")

    await pos.createPosAuditEvents({
      register_id: USA_POS_REGISTER_ID,
      event_type: INVENTORY_APPROVAL_EVENT,
      message: "Merchant-approved USA POS inventory applied",
      metadata: {
        product_id: snapshot.productId,
        variant_id: snapshot.variantId,
        inventory_item_id: snapshot.inventoryItemId,
        stock_location_id: USA_POS_LOCATION_ID,
        previous_stocked_quantity: snapshot.usaStockedQuantity,
        approved_stocked_quantity: approvedQuantity,
        approved_by: approved.values.approved_by,
        approval_reference: approved.values.approval_reference,
        backup_reference: backupReference,
        approval_file: path.basename(csvPath),
      },
    })

    console.log("[USA_POS_INVENTORY_APPLY]")
    console.log(JSON.stringify({
      approvedQuantity,
      previousUsaStocked: snapshot.usaStockedQuantity,
      newUsaStocked: after.usaStockedQuantity,
      usaReserved: after.usaReservedQuantity,
      usaAvailable: after.usaAvailableQuantity,
      canadaInventoryChanged: false,
      barcodeChanged: false,
      priceChanged: false,
      alreadyCorrect: approved.action === "NO_CHANGE" ? 1 : 0,
      databaseWrites: (inventoryWriteCompleted ? 1 : 0) + 1,
      passed: true,
    }, null, 2))
  } catch (error) {
    if (inventoryWriteCompleted) {
      try {
        await compensateInventoryWrite(container, action, snapshot)
      } catch (compensationError) {
        throw new AggregateError([error, compensationError], "Inventory apply failed and compensation also failed; manual reconciliation is required")
      }
    }
    throw error
  }
}
