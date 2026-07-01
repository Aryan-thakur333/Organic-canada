import { MedusaService } from "@medusajs/framework/utils"
import { Company } from "../models/company"
import { Quote } from "../models/quote"
import { CompanyMember } from "../models/company-member"

class B2BService extends MedusaService({
  Company,
  Quote,
  CompanyMember,
}) {}

export default B2BService
