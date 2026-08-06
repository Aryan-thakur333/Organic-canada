import path from "path"
import sharp from "sharp"

export const PERSONALIZATION_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const PERSONALIZATION_IMAGE_MAX_DIMENSION = 8000
export const PERSONALIZATION_IMAGE_TYPES = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const)

export type AllowedImageMime = keyof typeof PERSONALIZATION_IMAGE_TYPES

export function validateImageFilename(filename: string, mimeType: string): string {
  const clean = path.basename(String(filename || "")).replace(/[^a-zA-Z0-9._-]/g, "_")
  if (!clean || clean.length > 120 || clean.startsWith(".")) throw new Error("Invalid file name")
  const expected = PERSONALIZATION_IMAGE_TYPES[mimeType as AllowedImageMime]
  if (!expected) throw new Error("Only JPEG, PNG, and WebP images are allowed")
  const extension = path.extname(clean).toLowerCase()
  const accepted = mimeType === "image/jpeg" ? [".jpg", ".jpeg"] : [expected]
  if (!accepted.includes(extension)) throw new Error("File extension does not match MIME type")
  return clean
}

export async function decodeImageDimensions(buffer: Buffer, mimeType: string): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer, { failOn: "error", limitInputPixels: PERSONALIZATION_IMAGE_MAX_DIMENSION ** 2 }).metadata()
  const detectedMime = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : ""
  if (detectedMime !== mimeType) throw new Error("Decoded image type does not match MIME type")
  const width = metadata.width || 0
  const height = metadata.height || 0
  if (!width || !height) throw new Error("Image could not be decoded")
  if (width > PERSONALIZATION_IMAGE_MAX_DIMENSION || height > PERSONALIZATION_IMAGE_MAX_DIMENSION) {
    throw new Error(`Image dimensions must not exceed ${PERSONALIZATION_IMAGE_MAX_DIMENSION}px`)
  }
  return { width, height }
}
