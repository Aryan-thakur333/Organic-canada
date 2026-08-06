import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
export async function GET(req: MedusaRequest, res: MedusaResponse) { return res.status(404).json({ message: "Deprecated" }) }
export async function POST(req: MedusaRequest, res: MedusaResponse) { return res.status(404).json({ message: "Deprecated" }) }
