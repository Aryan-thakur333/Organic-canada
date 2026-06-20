import { Link } from "react-router-dom";

const packages = [
  { id: "pkg-basic", name: "Basic", price: "$9/mo", features: "5 deliveries free" },
  { id: "pkg-plus", name: "Plus", price: "$19/mo", features: "15 deliveries free" },
  { id: "pkg-pro", name: "Pro", price: "$29/mo", features: "Unlimited free delivery" },
];

export default function Packages() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900">Subscription Packages</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {packages.map((pkg) => (
          <article key={pkg.id} className="rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold">{pkg.name}</h2>
            <p className="mt-2 text-2xl font-bold">{pkg.price}</p>
            <p className="mt-2 text-sm text-gray-600">{pkg.features}</p>
            <Link
              to={`/packages/payment?plan=${pkg.id}`}
              className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800 transition"
            >
              Choose Plan
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
