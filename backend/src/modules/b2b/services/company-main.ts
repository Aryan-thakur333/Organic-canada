import { MedusaService } from "@medusajs/framework/utils"
import { Company } from "../models/company"

class CompanyService extends MedusaService({
  Company,
}) {}

export default CompanyService
