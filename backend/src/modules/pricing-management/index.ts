import { Module } from "@medusajs/framework/utils"
import PricingManagementService from "./service"
import { PRICING_MANAGEMENT_MODULE } from "./constants"
export { PRICING_MANAGEMENT_MODULE }
export default Module(PRICING_MANAGEMENT_MODULE, { service: PricingManagementService })
