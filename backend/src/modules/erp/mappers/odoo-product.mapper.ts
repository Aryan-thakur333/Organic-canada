import type { OdooProduct } from "../types"

export type MedusaProductSyncDraft = {
  title: string
  variantSku: string
  sellingPrice: number
  inventoryQuantity: number
  availableForSync: boolean
  metadata: {
    odoo_product_id: number
    erp_provider: "odoo"
    erp_cost_price: number
  }
}

export function mapOdooProductToMedusaDraft(
  product: OdooProduct
): MedusaProductSyncDraft {
  return {
    title: product.name.trim(),
    variantSku:
      typeof product.default_code === "string"
        ? product.default_code.trim()
        : "",
    sellingPrice: Number(product.list_price),
    inventoryQuantity: Math.max(
      0,
      Number(product.qty_available)
    ),
    availableForSync: Boolean(product.active),
    metadata: {
      odoo_product_id: product.id,
      erp_provider: "odoo",
      erp_cost_price: Number(product.standard_price),
    },
  }
}
