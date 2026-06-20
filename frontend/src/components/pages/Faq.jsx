const faqs = [
  {
    q: "How do I track my order?",
    a: "Go to Profile > Order History and open your active order.",
  },
  {
    q: "Can I cancel an order?",
    a: "Yes, you can cancel until the order is marked as preparing.",
  },
  {
    q: "Do you support guest checkout?",
    a: "Yes, you can place an order without creating an account.",
  },
];

export default function Faq() {
  return (
    <section className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold">FAQs</h1>
      <div className="mt-6 space-y-4">
        {faqs.map((item) => (
          <article key={item.q} className="rounded-xl border p-4">
            <h2 className="font-semibold">{item.q}</h2>
            <p className="mt-2 text-sm text-gray-600">{item.a}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
