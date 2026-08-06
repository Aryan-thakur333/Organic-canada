import { model } from "@medusajs/framework/utils"
import { PersonalizationTemplate } from "./personalization-template"

export const PersonalizationField = model.define("personalization_field", {
  id: model.id({ prefix: "pfld" }).primaryKey(),
  template_id: model.text(),
  key: model.text(),
  label: model.text(),
  field_type: model.enum([
    "text",
    "textarea",
    "number",
    "date",
    "select",
    "radio",
    "checkbox",
    "boolean",
    "color",
    "image_upload",
  ]).default("text"),
  is_required: model.boolean().default(false),
  min_length: model.number().nullable(),
  max_length: model.number().nullable(),
  min_value: model.number().nullable(),
  max_value: model.number().nullable(),
  allowed_values: model.json().nullable(),
  placeholder: model.text().nullable(),
  help_text: model.text().nullable(),
  price_adjustment: model.number().default(0),
  price_adjustment_type: model.enum(["fixed"]).default("fixed"),
  sort_order: model.number().default(0),
  validation_rules: model.json().nullable(),
  metadata: model.json().nullable(),
})
