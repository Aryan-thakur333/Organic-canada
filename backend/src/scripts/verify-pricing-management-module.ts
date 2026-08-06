import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PRICING_MANAGEMENT_MODULE } from "../modules/pricing-management/index.js"
export default async function verifyPricingManagementModule({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service:any = container.resolve(PRICING_MANAGEMENT_MODULE)
  logger.info("[PRICING_MANAGEMENT_MODULE_VERIFICATION]")
  logger.info(JSON.stringify({moduleResolved:Boolean(service),remediationRecordServiceAvailable:typeof service.listPricingRemediationRecords === "function",applyBatchServiceAvailable:typeof service.listPricingApplyBatches === "function",applyActionServiceAvailable:typeof service.listPricingApplyActions === "function",importPreviewServiceAvailable:typeof service.listPricingImportPreviews === "function",livePriceWrites:0},null,2))
}
