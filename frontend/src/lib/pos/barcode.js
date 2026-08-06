export const POS_BARCODE_MAX_LENGTH = 128;

export function normalizeBarcode(value) {
  const raw = String(value ?? "");
  const filtered = [...raw]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  const normalized = filtered.trim();

  if (!normalized) throw new Error("Enter or scan a barcode");
  if (normalized.length > POS_BARCODE_MAX_LENGTH) throw new Error("Barcode is too long");

  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code < 32 || code > 126) {
      throw new Error("Barcode contains unsupported characters");
    }
  }
  return normalized;
}
