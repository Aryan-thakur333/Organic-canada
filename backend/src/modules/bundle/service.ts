import { MedusaService } from "@medusajs/framework/utils"
import { BundleItem } from "./models/bundle-item"
import { BundleDefinition } from "./models/bundle-definition"
import { BundleLineSnapshot } from "./models/bundle-line-snapshot"

export default class BundleModuleService extends MedusaService({
  BundleItem,
  BundleDefinition,
  BundleLineSnapshot,
}) {}
