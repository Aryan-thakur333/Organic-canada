const coupons = [
  { code: "WELCOME50", offer: "Get 50% off up to $5", minOrder: "$15" },
  { code: "FREESHIP", offer: "Free delivery on selected stores", minOrder: "$10" },
  { code: "EATSIE20", offer: "Flat 20% off on dinner orders", minOrder: "$20" },
];

export default function Cupons() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900">Cupons</h1>
      <p className="mt-3 text-gray-600">Apply these codes at checkout.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {coupons.map((item) => (
          <div key={item.code} className="rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Code</p>
            <h2 className="text-xl font-semibold">{item.code}</h2>
            <p className="mt-2 text-gray-700">{item.offer}</p>
            <p className="mt-2 text-sm text-gray-500">Min order: {item.minOrder}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
