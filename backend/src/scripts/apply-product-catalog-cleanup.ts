import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/core-flows"
import * as fs from "fs"
import * as path from "path"
import { PRODUCTION_SALES_CHANNEL_ID, csvEscape, normalizeApprovedAction, salesChannelIds, validateCatalogCleanupRows } from "./lib/catalog-cleanup.js"

function isApply() { return process.argv.includes("apply") && !process.argv.includes("dry-run") }
function isLegitimateDigital(row: any) { return String(row.likely_test_product || "").includes("DIGITAL_PRODUCTION") }

async function writeBackup(validation: Awaited<ReturnType<typeof validateCatalogCleanupRows>>) {
  const rows = [["product_id", "product_title", "handle", "current_status", "current_sales_channel_ids", "approved_action", "timestamp"]]
  const timestamp = new Date().toISOString()
  for (const row of validation.rows) {
    const action = normalizeApprovedAction(row.approved_action)
    if (action !== "remove_from_sales_channel") continue
    const product = validation.productsById.get(row.product_id)
    if (!product) continue
    rows.push([product.id, product.title, product.handle || "", product.status, salesChannelIds(product).join("|"), action, timestamp])
  }
  const backupDir = path.resolve(process.cwd(), "reports", "backups")
  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `catalog-cleanup-before-${timestamp.replace(/[:.]/g, "-")}.csv`)
  fs.writeFileSync(backupPath, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8")
  return backupPath
}

export default async function applyProductCatalogCleanup({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const apply = isApply()
  const validation = await validateCatalogCleanupRows(query)
  const planned: any[] = []
  let blankRows = 0, keepSkips = 0, reviewSkips = 0, mergeSkips = 0, alreadyUnlinkedSkips = 0

  for (const row of validation.rows) {
    const action = normalizeApprovedAction(row.approved_action)
    const product = validation.productsById.get(row.product_id)
    if (!action) { blankRows++; continue }
    if (action === "keep") { keepSkips++; planned.push({ title: row.title, productId: row.product_id, handle: row.handle, action: "KEEP", reason: "Explicit keep approval" }); continue }
    if (action === "review") { reviewSkips++; planned.push({ title: row.title, productId: row.product_id, handle: row.handle, action: "REVIEW_REQUIRED", reason: "Explicit review approval" }); continue }
    if (action === "merge_manually") { mergeSkips++; planned.push({ title: row.title, productId: row.product_id, handle: row.handle, action: "MANUAL_MERGE_REQUIRED", duplicateGroup: row.duplicate_group, duplicateMembers: validation.rows.filter((candidate) => candidate.duplicate_group && candidate.duplicate_group === row.duplicate_group).map((candidate) => candidate.product_id), reason: "Duplicate products are never merged by this importer" }); continue }
    if (action !== "remove_from_sales_channel" || !product) continue
    const channels = salesChannelIds(product)
    if (!channels.includes(PRODUCTION_SALES_CHANNEL_ID)) { alreadyUnlinkedSkips++; planned.push({ title: row.title, productId: row.product_id, handle: row.handle, action: "SKIP_ALREADY_UNLINKED", reason: "Production sales-channel link is already absent" }); continue }
    planned.push({ title: row.title, productId: row.product_id, handle: row.handle, likelyTestProduct: row.likely_test_product, duplicateGroup: row.duplicate_group, currentSalesChannelMembership: channels, approvedAction: action, action: "REMOVE_FROM_PRODUCTION_SALES_CHANNEL", plannedSalesChannels: channels.filter((id) => id !== PRODUCTION_SALES_CHANNEL_ID), reason: isLegitimateDigital(row) ? "Warning: legitimate digital product explicitly approved for removal; manual review recommended" : "Explicit approved_action" })
  }

  logger.info("[PRODUCT_CATALOG_CLEANUP_DRY_RUN_PLAN]")
  logger.info(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", planned }, null, 2))
  const blockingIssues = validation.issues.filter((issue) => {
    const row = validation.rows.find((candidate) => candidate.product_id === issue.productId)
    return normalizeApprovedAction(row?.approved_action || "") === "remove_from_sales_channel"
  })
  if (blockingIssues.length) {
    logger.error(JSON.stringify({ message: "Approved removal validation failures; operation aborted", blockingIssues }, null, 2))
    process.exitCode = 1
    return
  }
  let backupPath = "", writesPerformed = 0
  const removals = planned.filter((item) => item.action === "REMOVE_FROM_PRODUCTION_SALES_CHANNEL")
  if (apply && removals.length) {
    backupPath = await writeBackup(validation)
    await updateProductsWorkflow(container).run({ input: { products: removals.map((item) => ({ id: item.productId, sales_channels: item.plannedSalesChannels.map((id: string) => ({ id })) })) } })
    writesPerformed = removals.length
  }
  logger.info("[PRODUCT_CATALOG_CLEANUP_DONE]")
  logger.info(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", totalRows: validation.rows.length, approvedRows: validation.rows.length - blankRows, blankRowsSkipped: blankRows, plannedRemovals: removals.length, keepSkips, reviewSkips, mergeManuallySkips: mergeSkips, alreadyUnlinkedSkips, validationFailures: validation.issues.length, writesPerformed, backupPath }, null, 2))
}
