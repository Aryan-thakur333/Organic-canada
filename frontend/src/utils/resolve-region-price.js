function finiteAmount(value) {
  if (value === "" || value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function missingReason(currencyCode) {
  if (currencyCode === "usd") return "missing_usd_price";
  if (currencyCode === "cad") return "missing_cad_price";
  return "missing_price";
}

/**
 * Resolves a variant only against the actively selected regional currency.
 * Product amounts are Medusa major units and deliberately remain unscaled here.
 */
export function resolveRegionPrice(variant, { regionId = "", currencyCode = "" } = {}) {
  const selectedCurrency = String(currencyCode || "").trim().toLowerCase();
  if (!variant) {
    return { available: false, amount: null, currencyCode: null, source: "unavailable", reason: "missing_variant", regionId };
  }
  const calculated = variant.calculated_price;
  const calculatedCurrency = String(variant.currency_code || calculated?.currency_code || "").trim().toLowerCase();
  const calculatedAmount = finiteAmount(variant.calculated_amount ?? calculated?.calculated_amount ?? calculated?.amount);
  if ((!selectedCurrency || calculatedCurrency === selectedCurrency) && calculatedCurrency && calculatedAmount !== null) {
    return { available: true, amount: calculatedAmount, currencyCode: calculatedCurrency, source: "calculated_price", regionId };
  }
  if (!selectedCurrency) {
    return { available: false, amount: null, currencyCode: null, source: "unavailable", reason: "currency_mismatch", regionId };
  }

  const matchingPrices = (Array.isArray(variant.prices) ? variant.prices : []).filter(
    (price) => String(price?.currency_code || "").trim().toLowerCase() === selectedCurrency
  );
  const validPrices = matchingPrices
    .map((price) => ({ price, amount: finiteAmount(price?.amount) }))
    .filter((entry) => entry.amount !== null);
  if (validPrices.length === 1) {
    return { available: true, amount: validPrices[0].amount, currencyCode: selectedCurrency, source: "variant_price", regionId };
  }
  if (validPrices.length > 1) {
    const amounts = new Set(validPrices.map((entry) => entry.amount));
    if (amounts.size > 1) {
      return { available: false, amount: null, currencyCode: null, source: "unavailable", reason: "malformed_price", regionId };
    }
    return { available: true, amount: validPrices[0].amount, currencyCode: selectedCurrency, source: "variant_price", regionId };
  }
  if (matchingPrices.length > 0 || (calculatedCurrency === selectedCurrency && calculatedAmount === null)) {
    return { available: false, amount: null, currencyCode: null, source: "unavailable", reason: "INVALID_AMOUNT", regionId };
  }
  if (calculatedCurrency && calculatedCurrency !== selectedCurrency) {
    return { available: false, amount: null, currencyCode: null, source: "unavailable", reason: "currency_mismatch", regionId };
  }
  return { available: false, amount: null, currencyCode: null, source: "unavailable", reason: missingReason(selectedCurrency), regionId };
}
