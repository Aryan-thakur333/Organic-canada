import { MedusaService } from "@medusajs/framework/utils"
import { BundleItem } from "./models/bundle-item"

export default class BundleModuleService extends MedusaService({
  BundleItem,
}) {}
