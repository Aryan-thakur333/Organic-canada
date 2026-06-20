import { Modules } from "@medusajs/framework/utils"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const orderModuleService = req.scope.resolve(Modules.ORDER) as any
  const id = req.body.id;
  try {
    const updated = await orderModuleService.updateOrders({
      id: id,
      customer_id: req.body.customer_id
    });
    return res.json({ success: true, updated });
  } catch (err) {
    try {
      const updated2 = await orderModuleService.updateOrders(id, {
        customer_id: req.body.customer_id
      });
      return res.json({ success: true, updated2 });
    } catch (err2) {
      return res.status(500).json({ error1: err.message, error2: err2.message });
    }
  }
}
