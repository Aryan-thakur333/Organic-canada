import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const ORDER_FIELDS = [
  "id",
  "email",
  "customer_id",
  "cart_id",
  "sales_channel_id",
  "created_at",
]

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const customerId = (req as any).auth_context?.actor_id

  if (!customerId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const orderModuleService = req.scope.resolve(Modules.ORDER) as any

  const { data: customers } = await query.graph({
    entity: "customer",
    filters: { id: customerId },
    fields: ["id", "email"],
  })

  const customer = customers?.[0]
  if (!customer?.email) {
    return res.status(404).json({ message: "Authenticated customer profile not found" })
  }

  const normalizedEmail = String(customer.email).trim().toLowerCase()
  const requestedOrderIds = Array.isArray((req.body as any)?.order_ids)
    ? (req.body as any).order_ids.filter((id: unknown) => typeof id === "string").slice(0, 20)
    : []

  if (!requestedOrderIds.length) {
    return res.status(400).json({ message: "At least one guest order ID is required" })
  }

  const { data: matchingOrders } = await query.graph({
    entity: "order",
    filters: {
      id: requestedOrderIds,
      email: normalizedEmail,
    },
    fields: ORDER_FIELDS,
  })

  const unlinkedOrders = ((matchingOrders || []) as any[]).filter((order: any) => {
    return !order.customer_id && String(order.email || "").trim().toLowerCase() === normalizedEmail
  })

  console.log("[OrdersClaim] Claiming customer orders:", {
    customerId,
    customerEmail: normalizedEmail,
    matchingOrderCount: matchingOrders?.length || 0,
    unlinkedOrderIds: unlinkedOrders.map((order: any) => order.id),
  })

  const remoteLink = req.scope.resolve(ContainerRegistrationKeys.REMOTE_LINK)

  const claimedOrders: any[] = []

  for (const order of unlinkedOrders) {
    const updatedOrder: any = await orderModuleService.updateOrders(order.id, {
      customer_id: customerId,
    })

    try {
      await remoteLink.create({
        [Modules.ORDER]: { order_id: order.id },
        [Modules.CUSTOMER]: { customer_id: customerId },
      })
    } catch (linkErr) {
      console.warn("[OrdersClaim] Remote link might already exist or failed:", linkErr.message)
    }

    console.log("[OrdersClaim] Linked order to customer:", {
      customerId,
      cartId: order.cart_id,
      orderId: order.id,
      salesChannelId: order.sales_channel_id,
    })

    claimedOrders.push(updatedOrder)
  }

  return res.json({
    customer_id: customerId,
    email: normalizedEmail,
    claimed_count: claimedOrders.length,
    claimed_orders: claimedOrders.map((order: any) => ({
      id: order.id,
      customer_id: order.customer_id,
      cart_id: order.cart_id,
      sales_channel_id: order.sales_channel_id,
    })),
  })
}
