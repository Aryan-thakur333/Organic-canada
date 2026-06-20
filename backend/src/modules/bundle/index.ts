import BundleModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const BUNDLE_MODULE = "bundle"

export default Module(BUNDLE_MODULE, {
  service: BundleModuleService,
})
