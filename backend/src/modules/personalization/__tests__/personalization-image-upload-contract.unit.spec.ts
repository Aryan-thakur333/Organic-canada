import { validateFieldConfiguration } from "../utils/field-configuration"
import { PersonalizationDomainError } from "../errors"

const imageField = (overrides: Record<string, unknown> = {}) => ({
  key: "reference_image",
  label: "Reference Image",
  field_type: "image_upload",
  is_required: true,
  min_length: null,
  max_length: null,
  min_value: null,
  max_value: null,
  allowed_values: ["image/jpeg", "image/png", "image/webp"],
  placeholder: null,
  help_text: null,
  price_adjustment: 0,
  sort_order: 1,
  validation_rules: { max_file_size_mb: 5, max_files: 1 },
  ...overrides,
})

describe("personalization image upload contract", () => {
  it("accepts a valid image upload field with MIME array", () => {
    const result = validateFieldConfiguration(imageField())
    expect(result.field_type).toBe("image_upload")
    expect(result.allowed_values).toEqual(["image/jpeg", "image/png", "image/webp"])
    expect(result.validation_rules).toEqual({ max_file_size_mb: 5, max_files: 1 })
  })

  it("rejects MIME string when array is required", () => {
    expect(() => validateFieldConfiguration(imageField({
      allowed_values: "image/jpeg,image/png",
    }))).toThrow(expect.objectContaining({
      code: "PERSONALIZATION_IMAGE_MIME_TYPES_REQUIRED",
    }))
  })

  it("rejects invalid MIME type", () => {
    expect(() => validateFieldConfiguration(imageField({
      allowed_values: ["image/jpeg", "image/gif"],
    }))).toThrow(expect.objectContaining({
      code: "PERSONALIZATION_IMAGE_MIME_TYPE_INVALID",
    }))
  })

  it("rejects missing allowed MIME types", () => {
    expect(() => validateFieldConfiguration(imageField({
      allowed_values: [],
    }))).toThrow(expect.objectContaining({
      code: "PERSONALIZATION_IMAGE_MIME_TYPES_REQUIRED",
    }))
  })

  it("rejects invalid max file size", () => {
    expect(() => validateFieldConfiguration(imageField({
      validation_rules: { max_file_size_mb: 0, max_files: 1 },
    }))).toThrow(expect.objectContaining({
      code: "PERSONALIZATION_IMAGE_MAX_SIZE_INVALID",
    }))
  })

  it("rejects invalid max files", () => {
    expect(() => validateFieldConfiguration(imageField({
      validation_rules: { max_file_size_mb: 5, max_files: 0 },
    }))).toThrow(expect.objectContaining({
      code: "PERSONALIZATION_IMAGE_MAX_FILES_INVALID",
    }))
  })

  it("rejects irrelevant validation keys for image upload", () => {
    expect(() => validateFieldConfiguration(imageField({
      min_length: 1,
    }))).toThrow(expect.objectContaining({
      code: "PERSONALIZATION_FIELD_VALIDATION_INVALID",
    }))
  })

  it("applies default validation rules when none provided", () => {
    const result = validateFieldConfiguration(imageField({
      validation_rules: null,
    }))
    expect(result.validation_rules).toEqual({ max_file_size_mb: 5, max_files: 1 })
  })

  it("normalizes and deduplicates MIME types", () => {
    const result = validateFieldConfiguration(imageField({
      allowed_values: ["image/jpeg", "IMAGE/JPEG", "image/png"],
    }))
    expect(result.allowed_values).toEqual(["image/jpeg", "image/png"])
  })
})
