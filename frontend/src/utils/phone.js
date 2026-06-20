/** Last 10 digits used for order lookup when longer numbers include country codes. */
export function normalizePhoneDigits(str) {
  const d = String(str || "").replace(/\D/g, "");
  if (d.length <= 10) return d;
  return d.slice(-10);
}
