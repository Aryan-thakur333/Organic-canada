export const PERSONALIZATION_FIELD_TYPES = [
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
] as const

export type PersonalizationFieldType = (typeof PERSONALIZATION_FIELD_TYPES)[number]

export const INVALID_FIELD_TYPE_ERROR = {
  code: "INVALID_PERSONALIZATION_FIELD_TYPE",
  message: "Unsupported personalization field type.",
}
