import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { POS_MODULE } from "../../../../modules/pos"
import type { PosService } from "../../../../utils/pos/contracts"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Not allowed in production environment" })
    }

    const operatorId = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id
    if (!operatorId) {
      return res.status(401).json({ message: "Unauthorized admin access required" })
    }

    const service = req.scope.resolve(POS_MODULE) as PosService

    // Fetch assignments for this operator
    const assignments = await service.listPosOperatorAssignments(
      { operator_id: operatorId },
      { take: 100 }
    ) as unknown[]

    // Fetch all registers
    const registers = await service.listPosRegisters({}, { take: 100 }) as unknown[]

    // Database name safely parsed
    const databaseUrl = process.env.DATABASE_URL || ""
    let databaseName = "medusa-backend"
    if (databaseUrl) {
      try {
        const pathname = new URL(databaseUrl).pathname
        databaseName = pathname.replace(/^\//, "")
      } catch (e) {
        const match = databaseUrl.match(/\/([^\/?]+)(?:\?|$)/)
        if (match) databaseName = match[1]
      }
    }

    return res.json({
      operator_id: operatorId,
      assignment_count: assignments.length,
      assignments,
      registers,
      database_name: databaseName,
      environment: process.env.NODE_ENV || "development"
    })
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : String(error)
    })
  }
}
