import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export default function PackagesPayment() {
  const [searchParams] = useSearchParams();
  const plan = searchParams.get("plan");

  const readablePlan = useMemo(() => {
    if (!plan) return "No plan selected";
    return plan.replace("pkg-", "").toUpperCase();
  }, [plan]);

  return (
    <section className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900">Package Payment</h1>
      <p className="mt-3 text-gray-600">Selected plan: {readablePlan}</p>

      <div className="mt-6 rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold">Payment Details</h2>
        <p className="mt-2 text-sm text-gray-600">
          Integrate your payment gateway here to complete package purchase.
        </p>
        <button className="mt-4 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 transition">
          Pay Now
        </button>
      </div>
    </section>
  );
}
