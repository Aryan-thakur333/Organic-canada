import { Minus, Plus, Trash2 } from "lucide-react";

const formatMoney = (amount, currency = "cad") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(Number(amount || 0) / 100);

export default function POSCart({ items, onQty, onRemove, subtotal }) {
  const currency = items[0]?.currency_code || "cad";

  return (
    <section className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-3">
        <h2 className="text-sm font-black uppercase text-zinc-600">Cart</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-sm font-semibold text-zinc-400">No items added</div>
        ) : (
          items.map((item) => (
            <div key={item.variant_id} className="border-b border-zinc-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{item.title}</p>
                  <p className="truncate text-xs text-zinc-500">{item.sku || item.variant_title || item.barcode}</p>
                  <p className="mt-1 text-sm font-bold text-zinc-700">{formatMoney(item.unit_price, item.currency_code)}</p>
                </div>
                <button onClick={() => onRemove(item.variant_id)} className="rounded p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600" title="Remove item">
                  <Trash2 size={17} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex h-10 items-center rounded border border-zinc-200">
                  <button onClick={() => onQty(item.variant_id, item.quantity - 1)} className="flex h-10 w-10 items-center justify-center" title="Decrease quantity">
                    <Minus size={16} />
                  </button>
                  <input
                    value={item.quantity}
                    onChange={(event) => onQty(item.variant_id, event.target.value)}
                    className="h-10 w-12 border-x border-zinc-200 text-center text-sm font-black outline-none"
                  />
                  <button onClick={() => onQty(item.variant_id, item.quantity + 1)} className="flex h-10 w-10 items-center justify-center" title="Increase quantity">
                    <Plus size={16} />
                  </button>
                </div>
                <p className="text-base font-black">{formatMoney(item.line_total, item.currency_code)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-zinc-200 p-4">
        <div className="flex items-center justify-between text-sm font-bold text-zinc-500">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal, currency)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-lg font-black">
          <span>Total</span>
          <span>{formatMoney(subtotal, currency)}</span>
        </div>
      </div>
    </section>
  );
}
