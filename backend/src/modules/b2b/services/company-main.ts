import { MedusaService } from "@medusajs/framework/utils"
import { Company } from "../models/company"
import { Quote } from "../models/quote"

class CompanyService extends MedusaService({
  Company,
  Quote,
}) {}

export default CompanyService
