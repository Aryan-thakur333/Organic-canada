import { Link } from "react-router-dom";

const CATEGORIES = [
  {
    title: "Groceries & Essentials",
    to: "/listing",
    bg: "bg-organic-cardGreen",
    art: "🛒",
    caption: "Pantry staples & household",
  },
  {
    title: "Pickup & Drop",
    to: "/packages",
    bg: "bg-organic-cardBlue",
    art: "📦",
    caption: "Send parcels locally",
  },
  {
    title: "Restaurants",
    to: "/listing",
    bg: "bg-organic-cardCoral",
    art: "🍽️",
    caption: "Hot meals from kitchens nearby",
  },
  {
    title: "Fruits & Vegetables",
    to: "/listing",
    bg: "bg-organic-cardLime",
    art: "🥬",
    caption: "Farm-fresh produce daily",
  },
];

export default function CategoryShowcase() {
  return (
    <section className="px-4 pb-10">
      <div className="container grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.title}
            to={cat.to}
            className={`group relative flex min-h-[200px] flex-col justify-between overflow-hidden rounded-3xl ${cat.bg} p-6 text-organic-primary shadow-md ring-1 ring-stone-300/40 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-stone-400/50`}
          >
            <div>
              <h3 className="font-display text-xl font-bold leading-snug text-gray-900">
                {cat.title}
              </h3>
              <p className="mt-2 max-w-[14rem] text-sm font-medium leading-snug text-gray-800">
                {cat.caption}
              </p>
            </div>

            <div className="relative mt-6 flex items-end justify-between">
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-2xl shadow-md transition duration-300 group-hover:scale-105"
                aria-hidden
              >
                {cat.art}
              </span>
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-lg font-bold text-organic-primary shadow-md ring-2 ring-white transition group-hover:bg-organic-peach"
                aria-hidden
              >
                →
              </span>
            </div>

            <div
              className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/25"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
