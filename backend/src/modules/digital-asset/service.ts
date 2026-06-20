import { MedusaService } from "@medusajs/framework/utils"
import { DigitalAsset } from "./models/digital-asset"

export default class DigitalAssetModuleService extends MedusaService({
  DigitalAsset,
}) {}
