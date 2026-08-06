import { Banknote, CreditCard } from "lucide-react";

const methods = [{ id: "CASH", label: "Cash", icon: Banknote }, { id: "CARD_MANUAL", label: "External card terminal", icon: CreditCard }];

const formatMoney = (amount, currency) => new Intl.NumberFormat("en-CA", { style: "currency", currency: String(currency || "cad").toUpperCase() }).format(Number(amount || 0) / 100);

export default function POSPaymentPanel({ method, onMethod, onCheckout, disabled, loading, discountCode, onDiscountCode, note, onNote, tendered, onTendered, terminalReference, onTerminalReference, authorizationReference, onAuthorizationReference, currencyCode, amountDueMinor }) {
  const currency = String(currencyCode || "cad").toUpperCase();
  const tenderedMinor = /^\d+(\.\d{0,2})?$/.test(String(tendered || "").trim()) ? Math.round(Number(tendered || 0) * 100) : null;
  const changeMinor = tenderedMinor === null ? null : Math.max(0, tenderedMinor - Number(amountDueMinor || 0));
  return <section className="rounded border border-zinc-200 bg-white p-4">
    <h2 className="text-sm font-black uppercase text-zinc-600">Payment</h2>
    <div className="mt-3 grid grid-cols-2 gap-2">{methods.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onMethod(id)} className={`flex h-14 items-center justify-center gap-2 rounded border text-xs font-black ${method === id ? "border-emerald-700 bg-emerald-700 text-white" : "border-zinc-200 bg-white text-zinc-600"}`}><Icon size={18} />{label}</button>)}</div>
    {method === "CASH" ? <div className="mt-3 grid gap-2"><div className="flex justify-between text-sm font-bold text-zinc-700"><span>Amount Due</span><span>{formatMoney(amountDueMinor, currency)}</span></div><label className="text-xs font-black uppercase text-zinc-500">Amount Tendered ({currency})</label><input type="number" min="0" step="0.01" inputMode="decimal" value={tendered} onChange={(event) => onTendered(event.target.value)} placeholder="0.00" className="h-11 w-full rounded border px-3" />{changeMinor !== null ? <div className="flex justify-between text-sm font-bold text-emerald-800"><span>Change</span><span>{formatMoney(changeMinor, currency)}</span></div> : null}</div> : <div className="mt-3 grid gap-2"><input required value={terminalReference} onChange={(event) => onTerminalReference(event.target.value)} placeholder="Terminal reference" className="h-11 rounded border px-3" /><input required value={authorizationReference} onChange={(event) => onAuthorizationReference(event.target.value)} placeholder="Authorization reference" className="h-11 rounded border px-3" /></div>}
    <input value={discountCode} onChange={(event) => onDiscountCode(event.target.value)} placeholder="Promotion code" className="mt-3 h-11 w-full rounded border px-3" />
    <textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder="Sale note" className="mt-3 min-h-20 w-full rounded border p-3" />
    <button disabled={disabled || loading} onClick={onCheckout} className="mt-3 h-14 w-full rounded bg-zinc-950 text-base font-black text-white disabled:opacity-50">{loading ? "Completing sale..." : "Complete sale"}</button>
  </section>;
}
