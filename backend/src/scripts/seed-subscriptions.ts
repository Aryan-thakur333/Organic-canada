import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

export default async function seedSubscriptions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)

  logger.info("Starting subscription products seeding...")

  // 1. Get default sales channel
  const salesChannels = await salesChannelModule.listSalesChannels({
    name: "Default Sales Channel",
  })
  const sales_channel_id = salesChannels[0]?.id
  if (!sales_channel_id) {
    throw new Error("Default sales channel not found.")
  }

  // 2. Get default shipping profile
  const shippingProfiles = await fulfillmentModule.listShippingProfiles({
    type: "default",
  })
  const shipping_profile_id = shippingProfiles[0]?.id
  if (!shipping_profile_id) {
    throw new Error("Default shipping profile not found.")
  }

  const subscriptionProducts = [
    {
      title: "Weekly Organic Box",
      description: "Get fresh organic produce delivered directly from the farm to your door every week.",
      handle: "weekly-organic-box",
      price: 1500, // $15.00
      plan: "weekly",
      sku: "SUB-ORGBOX-WEEKLY",
    },
    {
      title: "Monthly Organic Box",
      description: "A large collection of seasonal organic harvests delivered once a month.",
      handle: "monthly-organic-box",
      price: 5000, // $50.00
      plan: "monthly",
      sku: "SUB-ORGBOX-MONTHLY",
    },
    {
      title: "Premium Membership",
      description: "Access to exclusive harvests, early-bird delivery, and zero service fees on all Eatsie orders.",
      handle: "premium-membership",
      price: 1000, // $10.00
      plan: "monthly",
      sku: "SUB-PREM-MEMBERSHIP",
    },
  ]

  const productsToCreate = subscriptionProducts.map((p) => ({
    title: p.title,
    description: p.description,
    handle: p.handle,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id,
    metadata: {
      is_subscription: true,
      subscription_plan: p.plan,
    },
    images: [{ url: "https://images.unsplash.com/photo-1542838132-92c53300491e" }],
    options: [{ title: "Plan", values: ["Subscription"] }],
    variants: [
      {
        title: "Subscription",
        sku: p.sku,
        options: { Plan: "Subscription" },
        manage_inventory: false,
        metadata: {
          is_subscription: true,
          subscription_plan: p.plan,
        },
        prices: [
          { amount: p.price, currency_code: "usd" },
          { amount: p.price, currency_code: "inr" },
        ],
      },
    ],
    sales_channels: [{ id: sales_channel_id }],
  }))

  try {
    const { result } = await createProductsWorkflow(container).run({
      input: { products: productsToCreate },
    })
    logger.info(`Successfully seeded ${result.length} subscription products!`)
  } catch (error: any) {
    logger.error(`Failed to seed subscription products: ${error.message}`)
    throw error
  }
}
