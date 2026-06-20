import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({
    status: "ok",
    message: "Medusa Backend is running",
    documentation: "https://docs.medusajs.com"
  });
}
