import { Module } from "@medusajs/framework/utils"
import PersonalizationService from "./service"

export const PERSONALIZATION_MODULE = "personalization"

export default Module(PERSONALIZATION_MODULE, {
  service: PersonalizationService,
})