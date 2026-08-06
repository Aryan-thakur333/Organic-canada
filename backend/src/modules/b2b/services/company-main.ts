import { MedusaService } from "@medusajs/framework/utils"
import { Company } from "../models/company"
import { Quote } from "../models/quote"
import { CompanyMember } from "../models/company-member"
import { QuoteMessage } from "../models/quote-message"

class B2BService extends MedusaService({
  Company,
  Quote,
  CompanyMember,
  QuoteMessage,
}) {}

export default B2BService
