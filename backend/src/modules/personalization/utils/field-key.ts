export function generatePersonalizationFieldKey(label: unknown, usedKeys: Iterable<string> = []) {
  const base = String(label || "field")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 56) || "field"
  const used = new Set(Array.from(usedKeys, (key) => String(key)))
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}_${suffix}`)) suffix++
  return `${base}_${suffix}`
}

export function normalizePersonalizationFieldKeys(fields: any[]) {
  const used = new Set<string>()
  return fields.map((field) => {
    const supplied = String(field?.key || "").trim()
    const key = supplied || generatePersonalizationFieldKey(field?.label, used)
    if (used.has(key)) throw new Error("PERSONALIZATION_FIELD_KEY_DUPLICATE")
    used.add(key)
    return { ...field, key }
  })
}
