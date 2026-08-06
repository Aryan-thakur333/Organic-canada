import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    const erpService = req.scope.resolve<{
      getProducts(input?: {
        sku?: string
        limit?: number
      }): Promise<unknown[]>
    }>("erp")

    const sku =
      typeof req.query.sku === "string"
        ? req.query.sku.trim()
        : undefined

    const requestedLimit =
      typeof req.query.limit === "string"
        ? Number(req.query.limit)
        : 20

    const limit =
      Number.isInteger(requestedLimit) &&
      requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 20

    const products = await erpService.getProducts({
      sku,
      limit,
    })

    return res.status(200).json({
      success: true,
      count: products.length,
      products,
    })
  } catch (error) {
    const code =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "ERP_PRODUCT_FETCH_FAILED"

    return res.status(502).json({
      success: false,
      error: {
        code,
        message:
          error instanceof Error
            ? error.message
            : "Unknown ERP product error",
      },
    })
  }
}
