import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { updateLineItemInCartWorkflow } from "@medusajs/medusa/core-flows"
import { PERSONALIZATION_MODULE } from "../../../../../../../modules/personalization"
import { validatePersonalizationInput } from "../../../../../../../modules/personalization/utils/validate-personalization-input"
import crypto from "crypto"

type VariantPriceProjection = {
  amount: number
  currencyCode: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readVariantPrices(value: unknown): VariantPriceProjection[] {
  if (!isRecord(value) || !Array.isArray(value.prices)) {
    return []
  }

  return value.prices.flatMap((price) => {
    if (!isRecord(price) || typeof price.amount !== "number") {
      return []
    }

    return [{
      amount: price.amount,
      currencyCode: typeof price.currency_code === "string" ? price.currency_code : null,
    }]
  })
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  try {
    const personalizationService: any = req.scope.resolve(PERSONALIZATION_MODULE)
    const cartId = req.params.id
    const lineItemId = req.params.line_id
    const { values } = req.body as any

    const cartModuleService: any = req.scope.resolve(Modules.CART)
    const cart = await cartModuleService.retrieveCart(cartId, {
      relations: ["items"]
    })

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" })
    }

    const lineItem = cart.items?.find((item: any) => item.id === lineItemId)
    if (!lineItem) {
      return res.status(404).json({ message: "Line item not found in cart" })
    }

    const variantId = lineItem.variant_id
    const query = req.scope.resolve("query")
    const { data: variants } = await query.graph({
      entity: "variant",
      fields: [
        "id", 
        "product_id", 
        "prices.amount", 
        "prices.currency_code", 
        "prices.region_id",
        "product.id",
        "product.metadata",
        "product.title",
      ],
      filters: { id: variantId }
    })

    const variant = variants?.[0]
    if (!variant) {
      return res.status(404).json({ message: "Variant not found" })
    }

    const productId = variant.product_id || variant.product?.id
    const template = await personalizationService.getActiveTemplate(productId, variantId)
    if (!template) {
      return res.status(404).json({
        code: "PERSONALIZATION_TEMPLATE_NOT_FOUND",
        message: "No active personalization template found"
      })
    }

    const validationResult = validatePersonalizationInput({
      template,
      fields: template.fields || [],
      submittedValues: values || {}
    })

    // Resolve price matching cart currency
    const cartCurrency = cart.currency_code?.toLowerCase() || "cad"
    let basePrice = 0
    const variantPrices = readVariantPrices(variant)
    const matchedPrice = variantPrices.find(
      (price) => price.currencyCode?.toLowerCase() === cartCurrency
    )
    if (matchedPrice) {
      basePrice = matchedPrice.amount
    } else if (variantPrices.length > 0) {
      basePrice = variantPrices[0].amount
    }

    const adjustmentCents = Math.round((validationResult.priceAdjustment || 0) * 100)
    const finalUnitPrice = basePrice + adjustmentCents

    // Generate deterministic personalization hash
    const valuesString = JSON.stringify(
      Object.keys(validationResult.normalizedValues)
        .sort()
        .reduce((r: any, k) => {
          r[k] = validationResult.normalizedValues[k]
          return r
        }, {})
    )
    const hashInput = `${variantId}:${valuesString}:${template.version}`
    const personalizationHash = crypto.createHash("sha256").update(hashInput).digest("hex")

    // Update metadata and unit price of the line item
    const updatedMetadata = {
      ...(lineItem.metadata || {}),
      personalization_hash: personalizationHash,
      personalization_values: validationResult.normalizedValues,
      price_adjustment: validationResult.priceAdjustment,
    }

    // Update line item unit price
    await updateLineItemInCartWorkflow(req.scope).run({
      input: {
        cart_id: cartId,
        item_id: lineItemId,
        update: {
          unit_price: finalUnitPrice,
          metadata: updatedMetadata
        }
      }
    })

    // Reconcile CartItemPersonalization
    const cpiList = await personalizationService.listCartItemPersonalizations({
      cart_item_id: lineItemId
    })

    if (cpiList && cpiList.length > 0) {
      await personalizationService.updateCartItemPersonalizations({
        id: cpiList[0].id,
        values: validationResult.normalizedValues,
        price_adjustment: validationResult.priceAdjustment,
      })
    } else {
      await personalizationService.createCartItemPersonalizations({
        cart_id: cartId,
        cart_item_id: lineItemId,
        item_id: lineItemId,
        template_id: template.id,
        product_id: productId,
        variant_id: variantId,
        values: validationResult.normalizedValues,
        price_adjustment: validationResult.priceAdjustment,
      })
    }

    const freshCart = await cartModuleService.retrieveCart(cartId, {
      relations: ["items"]
    })

    return res.status(200).json({
      success: true,
      cart: freshCart
    })

  } catch (error: any) {
    console.error("Update line item personalization error:", error)
    return res.status(422).json({
      code: "PERSONALIZATION_VALIDATION_FAILED",
      message: error.message || "Failed to update personalized line item",
      details: [
        {
          field: "unknown",
          reason: error.message
        }
      ]
    })
  }
}
