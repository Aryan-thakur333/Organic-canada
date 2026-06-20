import { Link, useLocation } from "react-router-dom";
import { formatMoney } from "../../lib/medusa/money";

export default function SuccessOrder() {
  const location = useLocation();
  const order = location.state?.order;
  const currency = String(order?.currency_code || "usd").toLowerCase();

  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl shadow-inner">
        ✓
      </div>
      <h1 className="mt-6 font-display text-3xl font-bold text-gray-900">Thank you</h1>
      <p className="mt-3 text-gray-600">
        Your order has been recorded. You will receive updates from the store.
      </p>
      {order?.id ? (
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order reference</p>
          <p className="mt-1 font-mono text-sm text-gray-900">{order.id}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">Total</dt>
            <dd className="text-right font-semibold text-gray-900">
              {formatMoney(Number(order.total ?? 0), currency)}
            </dd>
            <dt className="text-gray-500">Payment</dt>
            <dd className="text-right text-gray-900 capitalize">{order.fulfillment || "—"}</dd>
            <dt className="text-gray-500">Status</dt>
            <dd className="text-right text-gray-900 capitalize">{order.status || "—"}</dd>
          </dl>
        </div>
      ) : null}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          to="/orders"
          className="inline-flex rounded-full bg-organic-terracotta px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-md transition hover:brightness-105"
        >
          View orders
        </Link>
        <Link
          to="/"
          className="inline-flex rounded-full border border-stone-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-stone-50"
        >
          Back to home
        </Link>
      </div>
    </section>
  );
}
