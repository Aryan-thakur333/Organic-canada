import { MedusaService } from "@medusajs/framework/utils"
import { PricingRemediationRecord } from "./models/pricing-remediation-record"
import { PricingApplyBatch } from "./models/pricing-apply-batch"
import { PricingApplyAction } from "./models/pricing-apply-action"
import { PricingImportPreview } from "./models/pricing-import-preview"
class PricingManagementService extends MedusaService({ PricingRemediationRecord, PricingApplyBatch, PricingApplyAction, PricingImportPreview }) {}
export default PricingManagementService
