import type { OdooProductCapabilities } from "../types"

export type OdooProductClassification =
  | "physical"
  | "service"
  | "consumable"

export type OdooInventoryProductFields = {
  type?: string
  is_storable?: boolean
  detailed_type?: string
}

/**
 * Determines how a Medusa product should be classified in Odoo.
 *
 * - physical  → inventory-trackable storable good (type=product, is_storable=true)
 * - service   → non-stock service (type=service, is_storable=false)
 * - consumable → non-tracked consumable (type=consu, is_storable=false)
 */
export function classifyOdooProduct(input: {
  isPhysical?: boolean
  isService?: boolean
  isInventoryManaged?: boolean
}): OdooProductClassification {
  if (input.isService) {
    return "service"
  }

  if (input.isPhysical && input.isInventoryManaged !== false) {
    return "physical"
  }

  return "consumable"
}

/**
 * Builds Odoo product fields for a physical/inventory-trackable good.
 * Only emits fields that are supported by the live Odoo schema.
 *
 * Odoo 18 contract (verified live):
 * - `type` selection supports "product" (storable good)
 * - `is_storable` boolean marks the product as inventory-trackable
 * - `detailed_type` is NOT available in this Odoo 18 instance
 */
export function buildOdooInventoryProductFields(
  capabilities: OdooProductCapabilities
): OdooInventoryProductFields {
  const fields: OdooInventoryProductFields = {}

  // Odoo 18: `type` does NOT accept "product" as a value.
  // The `is_storable` boolean is the authoritative field that marks
  // a product as inventory-trackable (supports stock.quant).
  if (capabilities.productProductFields.has("is_storable")) {
    fields.is_storable = true
  }

  if (capabilities.productProductFields.has("detailed_type")) {
    fields.detailed_type = "product"
  }

  return fields
}

/**
 * Builds Odoo product fields for a service/non-stock product.
 * Only emits fields that are supported by the live Odoo schema.
 */
export function buildOdooServiceProductFields(
  capabilities: OdooProductCapabilities
): OdooInventoryProductFields {
  const fields: OdooInventoryProductFields = {}

  if (capabilities.productProductFields.has("type")) {
    fields.type = "service"
  }

  if (capabilities.productProductFields.has("is_storable")) {
    fields.is_storable = false
  }

  if (capabilities.productProductFields.has("detailed_type")) {
    fields.detailed_type = "service"
  }

  return fields
}

/**
 * Builds Odoo product fields for a consumable/non-tracked good.
 * Only emits fields that are supported by the live Odoo schema.
 */
export function buildOdooConsumableProductFields(
  capabilities: OdooProductCapabilities
): OdooInventoryProductFields {
  const fields: OdooInventoryProductFields = {}

  if (capabilities.productProductFields.has("type")) {
    fields.type = "consu"
  }

  if (capabilities.productProductFields.has("is_storable")) {
    fields.is_storable = false
  }

  if (capabilities.productProductFields.has("detailed_type")) {
    fields.detailed_type = "consu"
  }

  return fields
}

/**
 * Determines whether an Odoo product is inventory-trackable.
 *
 * A product is inventory-trackable when:
 * - `type` is "product" (storable good), OR
 * - `is_storable` is true
 */
export function isOdooProductInventoryTrackable(input: {
  type?: string
  is_storable?: boolean
}): boolean {
  const isStorable = Boolean(input.is_storable)

  return isStorable
}
