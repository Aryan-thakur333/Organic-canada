import { Module } from "@medusajs/framework/utils"

import ErpModuleService from "./service"

export const ERP_MODULE = "erp"

export default Module(ERP_MODULE, {
  service: ErpModuleService,
})