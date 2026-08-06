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
      healthCheck(): Promise<Record<string, unknown>>
    }>("erp")

    const health = await erpService.healthCheck()

    return res.status(200).json({
      success: true,
      ...health,
    })
  } catch (error) {
    const code =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "ERP_CONNECTION_FAILED"

    return res.status(503).json({
      success: false,
      connected: false,
      error: {
        code,
        message:
          error instanceof Error
            ? error.message
            : "Unknown ERP error",
      },
    })
  }
}
