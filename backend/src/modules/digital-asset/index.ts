import DigitalAssetModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const DIGITAL_ASSET_MODULE = "digitalAsset"

export default Module(DIGITAL_ASSET_MODULE, {
  service: DigitalAssetModuleService,
})
