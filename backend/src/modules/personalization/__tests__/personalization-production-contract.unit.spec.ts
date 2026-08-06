import sharp from "sharp"
import { validatePersonalizationInput } from "../utils/validate-personalization-input"
import { decodeImageDimensions, validateImageFilename } from "../utils/image-security"
import { validateFieldConfiguration } from "../utils/field-configuration"

const field = (overrides: Record<string, unknown> = {}) => ({
  key: "message", label: "Message", field_type: "text", is_required: false,
  min_length: null, max_length: 100, min_value: null, max_value: null,
  allowed_values: null, price_adjustment: 250, ...overrides,
})

describe("personalization production contract", () => {
  it("normalizes text and calculates adjustments in minor units", () => {
    const result = validatePersonalizationInput({
      template: { is_active: true }, fields: [field()] as any, submittedValues: { message: "  hello  " },
    })
    expect(result.normalizedValues).toEqual({ message: "hello" })
    expect(result.priceAdjustment).toBe(250)
  })

  it("charges boolean adjustment only when enabled", () => {
    const fields = [field({ key: "rush", field_type: "boolean", price_adjustment: 500 })] as any
    expect(validatePersonalizationInput({ template: { is_active: true }, fields, submittedValues: { rush: false } }).priceAdjustment).toBe(0)
    expect(validatePersonalizationInput({ template: { is_active: true }, fields, submittedValues: { rush: true } }).priceAdjustment).toBe(500)
  })

  it("requires an ownership-verified upload reference", () => {
    const fields = [field({ key: "art", field_type: "image_upload", price_adjustment: 100 })] as any
    expect(() => validatePersonalizationInput({ template: { is_active: true }, fields, submittedValues: { art: "past_other" } })).toThrow(/not owned/)
    expect(validatePersonalizationInput({ template: { is_active: true }, fields, submittedValues: { art: "past_owned" }, verifiedUploadIds: new Set(["past_owned"]) }).priceAdjustment).toBe(100)
  })

  it("rejects unknown fields, invalid selections, excessive text and excessive schema size", () => {
    expect(() => validatePersonalizationInput({ template: { is_active: true }, fields: [field()] as any, submittedValues: { injected_price: 1 } })).toThrow(/Unknown/)
    expect(() => validatePersonalizationInput({ template: { is_active: true }, fields: [field({ field_type: "select", allowed_values: ["red"] })] as any, submittedValues: { message: "blue" } })).toThrow(/Invalid select/)
    expect(() => validatePersonalizationInput({ template: { is_active: true }, fields: [field({ max_length: 2 })] as any, submittedValues: { message: "long" } })).toThrow(/max length/)
    expect(() => validatePersonalizationInput({ template: { is_active: true }, fields: Array.from({ length: 26 }, (_, i) => field({ key: `f${i}` })) as any, submittedValues: {} })).toThrow(/at most 25/)
  })

  it("enforces minor-unit admin configuration", () => {
    expect(() => validateFieldConfiguration(field({ price_adjustment: 1.25 }))).toThrow(/integer minor-unit/)
    // A select field must not carry the text-only max_length default when
    // exercising the empty-options guard (production payloads never send it).
    expect(() => validateFieldConfiguration(field({ field_type: "select", allowed_values: [], max_length: null }))).toThrow(/allowed values/)
    expect(validateFieldConfiguration(field({ price_adjustment: 125 })).price_adjustment).toBe(125)
  })

  it("rejects executable/SVG extensions and MIME mismatches", () => {
    expect(() => validateImageFilename("payload.exe", "image/png")).toThrow(/extension/)
    expect(() => validateImageFilename("art.svg", "image/svg+xml")).toThrow(/JPEG/)
    expect(validateImageFilename("safe-photo.JPEG", "image/jpeg")).toBe("safe-photo.JPEG")
  })

  it("decodes real allowed images and rejects spoofed content", async () => {
    const png = await sharp({ create: { width: 4, height: 3, channels: 4, background: "red" } }).png().toBuffer()
    await expect(decodeImageDimensions(png, "image/png")).resolves.toEqual({ width: 4, height: 3 })
    await expect(decodeImageDimensions(Buffer.from("not-an-image"), "image/png")).rejects.toThrow()
    await expect(decodeImageDimensions(png, "image/jpeg")).rejects.toThrow(/does not match/)
  })
})
