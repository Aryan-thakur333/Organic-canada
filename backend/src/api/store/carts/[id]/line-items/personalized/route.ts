import crypto from "crypto"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { PERSONALIZATION_MODULE } from "../../../../../../modules/personalization"
import { validatePersonalizationInput } from "../../../../../../modules/personalization/utils/validate-personalization-input"
import { loadPersonalizationVariant, templateSnapshot } from "../../../../../../modules/personalization/utils/pricing"

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result: any, key) => {
      result[key] = canonicalize(value[key]); return result
    }, {})
  }
  return value
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = req.body as any
    const variantId = body.variant_id
    const quantity = Number(body.quantity)
    const values = body.personalization_values ?? body.values
    const declaredUploadIds = Array.isArray(body.upload_ids) ? body.upload_ids : []
    if (!variantId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !values || typeof values !== "object" || Array.isArray(values)) {
      return res.status(400).json({ message: "variant_id, quantity (1-100), and personalization_values are required" })
    }
    const cartId = req.params.id
    const locking: any = req.scope.resolve(Modules.LOCKING)
    const result = await locking.execute(`personalized-cart:${cartId}`, async () => {
      const cartService: any = req.scope.resolve(Modules.CART)
      const cart = await cartService.retrieveCart(cartId)
      if (!cart || cart.completed_at) throw new Error("Cart is not available")
      const customerId = (req as any).auth_context?.actor_id
      if (cart.customer_id && cart.customer_id !== customerId) throw new Error("Cart not found")
      const service: any = req.scope.resolve(PERSONALIZATION_MODULE)
      const priced = await loadPersonalizationVariant(req.scope, variantId, cart.region_id)
      if (priced.currencyCode !== String(cart.currency_code).toLowerCase()) throw new Error("Cart currency does not match regional price")
      const productId = priced.variant.product_id || priced.variant.product?.id
      const template = await service.getActiveTemplate(productId, variantId)
      if (!template) throw new Error("No active personalization template found")
      const referencedUploads = Object.values(values).filter((value): value is string => typeof value === "string" && value.startsWith("past_"))
      if (referencedUploads.length !== declaredUploadIds.length || referencedUploads.some((id) => !declaredUploadIds.includes(id))) {
        throw new Error("upload_ids must exactly match image upload field values")
      }
      const verified = new Set<string>()
      if (referencedUploads.length) {
        if (!customerId) throw new Error("Authentication is required for uploaded images")
        const assets = await service.listPersonalizationAssets({ id: referencedUploads, owner_customer_id: customerId, template_id: template.id, status: "uploaded" })
        for (const asset of assets) verified.add(asset.id)
      }
      const validated = validatePersonalizationInput({ template, fields: template.fields || [], submittedValues: values, verifiedUploadIds: verified })
      const snapshot = templateSnapshot(template)
      const hash = stableHash({ variant_id: variantId, template_id: template.id, version: template.version, values: validated.normalizedValues })
      await addToCartWorkflow(req.scope).run({ input: { cart_id: cartId, items: [{
        variant_id: variantId, quantity, unit_price: priced.basePrice + validated.priceAdjustment,
        metadata: {
          custom_personalization: true, personalization_version: template.version,
          personalization_hash: hash, personalization_values: validated.normalizedValues,
          personalization_labels: Object.fromEntries((template.fields || []).map((field: any) => [field.key, field.label])),
          personalization_base_price: priced.basePrice,
          personalization_adjustment: validated.priceAdjustment, personalization_template_id: template.id,
          personalization_status: template.requires_vendor_approval ? "pending_review" : "approved",
        },
      }] } })
      const updatedCart = await cartService.retrieveCart(cartId, { relations: ["items"] })
      const line = [...(updatedCart.items || [])].reverse().find((item: any) => item.variant_id === variantId && item.metadata?.personalization_hash === hash)
      if (!line) throw new Error("Personalized cart line was not created")
      const existing = await service.listCartItemPersonalizations({ cart_item_id: line.id })
      let personalization = existing?.[0]
      if (!personalization) {
        personalization = await service.createCartItemPersonalizations({
          cart_id: cartId, cart_item_id: line.id, item_id: line.id, template_id: template.id,
          product_id: productId, variant_id: variantId, values: validated.normalizedValues,
          price_adjustment: validated.priceAdjustment, template_snapshot: snapshot,
          upload_references: referencedUploads, status: template.requires_vendor_approval ? "pending_review" : "approved",
          metadata: { personalization_hash: hash, currency_code: priced.currencyCode, base_price: priced.basePrice },
        })
      }
      if (referencedUploads.length) {
        await service.updatePersonalizationAssets(referencedUploads.map((id: string) => ({ id, status: "attached" })))
      }
      return { cart: updatedCart, personalization, hash, validated, priced, template }
    }, { timeout: 10 })
    return res.status(200).json({ success: true, cart: result.cart, personalization: {
      id: result.personalization.id, template_id: result.template.id, hash: result.hash,
      price_adjustment: result.validated.priceAdjustment, normalized_values: result.validated.normalizedValues,
    } })
  } catch (error: any) {
    return res.status(422).json({ code: "PERSONALIZATION_VALIDATION_FAILED", message: error.message || "Failed to add personalized item" })
  }
}
