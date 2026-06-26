import { MedusaService } from "@medusajs/framework/utils"
import { DigitalAsset } from "./models/digital-asset"
import { DigitalOrderDownload } from "./models/digital-order-download"

class DigitalAssetModuleService extends MedusaService({
  DigitalAsset,
  DigitalOrderDownload,
}) {}

export default DigitalAssetModuleService
