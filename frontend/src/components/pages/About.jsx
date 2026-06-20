export default function About() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900">About Eatsie</h1>
      <p className="mt-4 text-gray-600 leading-7">
        Eatsie helps customers discover nearby restaurants, order quickly, and
        get meals delivered fast. We focus on quality food, transparent pricing,
        and reliable delivery support.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold">Fast Delivery</h2>
          <p className="mt-2 text-sm text-gray-600">
            Optimized rider allocation for quick doorstep delivery.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold">Top Restaurants</h2>
          <p className="mt-2 text-sm text-gray-600">
            Handpicked partners with trusted ratings and consistency.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold">Secure Checkout</h2>
          <p className="mt-2 text-sm text-gray-600">
            Smooth payments with reliable order tracking.
          </p>
        </div>
      </div>
    </section>
  );
}
