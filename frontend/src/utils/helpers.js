import { CURRENCY_SYMBOL } from "./constants";

export function formatCurrency(amount, symbol = CURRENCY_SYMBOL) {
  const numeric = Number(amount || 0);
  return `${symbol}${numeric.toFixed(2)}`;
}

export function formatOrderId(id) {
  if (!id) return "N/A";
  return `#${String(id).slice(0, 8).toUpperCase()}`;
}

export function calculateCartTotals(items = []) {
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const deliveryFee = subtotal > 0 && subtotal < 20 ? 2.5 : 0;
  const tax = subtotal * 0.05;
  const total = subtotal + deliveryFee + tax;

  return {
    subtotal,
    deliveryFee,
    tax,
    total,
  };
}

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
