/**
 * Product flow: pass `value` + `onChange` (quantity 1…max).
 * Cart flow: pass `value` + `onIncrement` + `onDecrement` (each click adjusts by 1).
 */
export default function QuantityStepper({
  value,
  onChange,
  onIncrement,
  onDecrement,
  min = 1,
  max = 99,
  disabled = false,
  label = "Quantity",
  className = "",
}) {
  const cartMode = typeof onIncrement === "function" && typeof onDecrement === "function";

  const decrement = () => {
    if (disabled) return;
    if (cartMode) onDecrement();
    else onChange?.(Math.max(min, value - 1));
  };

  const increment = () => {
    if (disabled) return;
    if (cartMode) onIncrement();
    else onChange?.(Math.min(max, value + 1));
  };

  const decDisabled = cartMode ? disabled : disabled || value <= min;

  const incDisabled = disabled || value >= max;

  return (
    <div
      className={`inline-flex items-center gap-0 rounded-full border-2 border-stone-200 bg-white p-0.5 shadow-sm ${className}`}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={decrement}
        disabled={decDisabled}
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-organic-primary transition hover:bg-organic-peach/60 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="min-w-[2.25rem] select-none text-center text-sm font-bold tabular-nums text-gray-900">
        {value}
      </span>
      <button
        type="button"
        onClick={increment}
        disabled={incDisabled}
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-organic-primary transition hover:bg-organic-peach/60 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
