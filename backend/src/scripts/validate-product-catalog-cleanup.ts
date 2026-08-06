import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { validateCatalogCleanupRows } from "./lib/catalog-cleanup.js"

export default async function validateProductCatalogCleanup({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const validation = await validateCatalogCleanupRows(query)
  logger.info("[PRODUCT_CATALOG_CLEANUP_VALIDATION]")
  logger.info(JSON.stringify({
    totalCsvRows: validation.rows.length,
    blankApprovalRows: validation.actionCounts.blank,
    keepApprovals: validation.actionCounts.keep,
    removalApprovals: validation.actionCounts.remove_from_sales_channel,
    mergeApprovals: validation.actionCounts.merge_manually,
    reviewApprovals: validation.actionCounts.review,
    invalidActions: validation.actionCounts.invalid,
    missingProducts: validation.missingProducts,
    staleSalesChannelMemberships: validation.staleSalesChannelMemberships,
    duplicateProductIds: validation.duplicateProductIds,
    alreadyUnlinked: validation.alreadyUnlinked,
    validationFailures: validation.issues,
    writesPerformed: 0,
  }, null, 2))
  if (validation.issues.length) process.exitCode = 1
}
