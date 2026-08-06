import { Module } from "@medusajs/framework/utils"
import OmsModuleService from "./service"

export const OMS_MODULE = "oms"

export default Module(OMS_MODULE, {
  service: OmsModuleService,
})
