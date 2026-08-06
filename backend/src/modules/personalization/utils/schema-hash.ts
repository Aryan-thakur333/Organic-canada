import * as crypto from "crypto"

function sortKeys(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    return obj === undefined ? null : obj
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeys)
  }
  const sortedKeys = Object.keys(obj).sort()
  const sortedObj: any = {}
  for (const key of sortedKeys) {
    const val = obj[key]
    sortedObj[key] = val === undefined ? null : sortKeys(val)
  }
  return sortedObj
}

function normalizeAllowedValues(val: any): any {
  if (!Array.isArray(val)) {
    return val === undefined || val === null ? null : val
  }
  return val
    .slice()
    .sort((a, b) => {
      if (typeof a === "object" || typeof b === "object") return 0
      return String(a).localeCompare(String(b))
    })
    .map(sortKeys)
}

export function generatePersonalizationSchemaHash(schema: {
  product_id: string
  variant_id?: string | null
  requires_vendor_approval: boolean
  requires_production: boolean
  fields: Array<{
    key: string
    field_type: string
    is_required: boolean
    min_length?: number | null
    max_length?: number | null
    min_value?: number | null
    max_value?: number | null
    allowed_values?: any[] | null
    price_adjustment?: number | null
    sort_order?: number | null
    validation_rules?: any
  }>
}): string {
  const normalized = {
    product_id: schema.product_id,
    variant_id: schema.variant_id || null,
    requires_vendor_approval: !!schema.requires_vendor_approval,
    requires_production: !!schema.requires_production,
    fields: (schema.fields || [])
      .map((f) => ({
        key: f.key,
        field_type: f.field_type,
        is_required: !!f.is_required,
        min_length: f.min_length ?? null,
        max_length: f.max_length ?? null,
        min_value: f.min_value ?? null,
        max_value: f.max_value ?? null,
        allowed_values: normalizeAllowedValues(f.allowed_values),
        price_adjustment: Number(f.price_adjustment) || 0,
        sort_order: Number(f.sort_order) || 0,
        validation_rules: f.validation_rules ? sortKeys(f.validation_rules) : null,
      }))
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order
        }
        return a.key.localeCompare(b.key)
      }),
  }

  const json = JSON.stringify(sortKeys(normalized))
  const hash = crypto.createHash("sha256").update(json).digest("hex")
  return `sha256:${hash}`
}