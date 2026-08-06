import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { COMMISSION_MODULE } from "../../../modules/commission"

function isMissingCommissionSchemaError(error: any) {
  const message = String(error?.message || "")
  return (
    message.includes("commission_record") &&
    (message.includes("does not exist") || message.includes("relation"))
  )
}

function parsePaginationValue(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const commissionService: any = req.scope.resolve(COMMISSION_MODULE)
    const {
      limit = "10",
      offset = "0",
      account_type,
      status,
      order_id,
    } = req.query as Record<string, string | undefined>

    const parsedLimit = parsePaginationValue(limit, 10)
    const parsedOffset = parsePaginationValue(offset, 0)
    const filters: Record<string, any> = {}

    if (account_type) filters.account_type = account_type
    if (status) filters.status = status
    if (order_id) filters.order_id = order_id

    const [records, count] = await commissionService.listAndCountCommissionRecords(filters, {
      skip: parsedOffset,
      take: parsedLimit,
      order: { created_at: "DESC" },
    })

    return res.status(200).json({
      records,
      count,
      limit: parsedLimit,
      offset: parsedOffset,
    })
  } catch (error: any) {
    console.error("[COMMISSION_RECORDS_ROUTE_ERROR]", {
      path: req.url,
      message: error?.message,
      stack: error?.stack,
    })

    if (isMissingCommissionSchemaError(error)) {
      return res.status(500).json({ message: "Commission schema missing. Run repair-commission-schema.ts" })
    }

    return res.status(500).json({ message: "An unexpected error occurred while retrieving commission records." })
  }
}
