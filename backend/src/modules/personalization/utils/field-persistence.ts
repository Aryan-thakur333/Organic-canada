/** Only persist the supported public field-definition properties. */
export function toPersonalizationFieldRecord(templateId: string, field: any) {
  return {
    template_id: templateId,
    key: field.key,
    label: field.label,
    field_type: field.field_type,
    is_required: Boolean(field.is_required),
    min_length: field.min_length ?? null,
    max_length: field.max_length ?? null,
    min_value: field.min_value ?? null,
    max_value: field.max_value ?? null,
    allowed_values: field.allowed_values ?? null,
    placeholder: field.placeholder ? String(field.placeholder).slice(0, 250) : null,
    help_text: field.help_text ? String(field.help_text).slice(0, 500) : null,
    price_adjustment: field.price_adjustment,
    price_adjustment_type: "fixed",
    sort_order: field.sort_order,
    validation_rules:
      field.validation_rules && typeof field.validation_rules === "object"
        ? field.validation_rules
        : null,
    metadata: null,
  }
}
