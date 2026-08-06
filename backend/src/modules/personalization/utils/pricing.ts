import { QueryContext } from "@medusajs/framework/utils"

export async function loadPersonalizationVariant(scope: any, variantId: string, regionId: string) {
  const query = scope.resolve("query")
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
    filters: { id: regionId },
  })
  const currencyCode = String(regions?.[0]?.currency_code || "").toLowerCase()
  if (!currencyCode) throw new Error("Region not found or has no currency")
  const { data } = await query.graph({
    entity: "variant",
    fields: ["id", "product_id", "calculated_price.*", "product.id", "product.metadata", "product.title"],
    filters: { id: variantId },
    context: { calculated_price: QueryContext({ region_id: regionId, currency_code: currencyCode }) },
  })
  const variant = data?.[0]
  const amount = variant?.calculated_price?.calculated_amount
  const calculatedCurrencyCode = variant?.calculated_price?.currency_code
  if (!variant) throw new Error("Variant not found")
  if (!Number.isFinite(amount) || !calculatedCurrencyCode) throw new Error("Variant has no calculated price in this region")
  if (String(calculatedCurrencyCode).toLowerCase() !== currencyCode) throw new Error("Calculated price currency does not match the selected region")
  return { variant, basePrice: Number(amount), currencyCode }
}

export function templateSnapshot(template: any) {
  return {
    id: template.id,
    name: template.name || template.title,
    version: template.version,
    schema_hash: template.schema_hash,
    requires_vendor_approval: template.requires_vendor_approval,
    requires_production: template.requires_production,
    allow_normal_purchase: template.metadata?.allow_normal_purchase !== false,
    personalization_required: Boolean(template.metadata?.personalization_required),
    fields: (template.fields || []).map((field: any) => ({
      id: field.id, key: field.key, label: field.label, field_type: field.field_type,
      is_required: field.is_required, min_length: field.min_length, max_length: field.max_length,
      min_value: field.min_value, max_value: field.max_value, allowed_values: field.allowed_values,
      price_adjustment: field.price_adjustment, sort_order: field.sort_order, help_text: field.help_text,
    })),
  }
}
