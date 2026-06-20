import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BRAND } from "../../config/branding";

const SLIDES = [
  {
    title: "SuperMarket Daily Fresh Grocery",
    subtitle:
      "Introduced a new model for online grocery shopping and convenient home delivery.",
    image:
      "https://images.unsplash.com/photo-1584483766114-49cea5e29f27?auto=format&fit=crop&w=900&q=80",
    alt: "Customer with fresh groceries",
  },
  {
    title: "Organic Produce, Straight to Your Door",
    subtitle:
      "Seasonal fruits and vegetables sourced from trusted Canadian growers.",
    image:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    alt: "Fresh vegetables",
  },
  {
    title: "Restaurants & Ready Meals",
    subtitle:
      "Order chef-made meals and local favourites with the same fast delivery.",
    image:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
    alt: "Prepared food",
  },
];

const FLOATING = [
  { label: "Kiwi — 4 pcs", rating: "★★★★★", top: "12%", left: "4%" },
  { label: "Avocado", rating: "★★★★☆", top: "58%", left: "2%" },
  { label: "Delivery Done!", badge: true, top: "18%", right: "8%" },
];

export default function OrganicHeroCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      7000
    );
    return () => clearInterval(t);
  }, []);

  const slide = SLIDES[index];

  return (
    <section className="relative bg-organic-headerBg px-4 pb-8 pt-2 md:pb-12 md:pt-4">
      <div className="container relative overflow-hidden rounded-[28px] bg-organic-mint shadow-[0_8px_30px_-8px_rgba(45,125,120,0.2)] ring-1 ring-organic-teal/25">
        {/* decorative — slightly stronger so shapes read on mint */}
        <div
          className="pointer-events-none absolute -left-12 top-6 h-44 w-44 rounded-full border-[12px] border-organic-teal/25 bg-organic-teal/5"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-8 left-1/3 h-36 w-36 rounded-full bg-organic-terracotta/15"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-10 top-1/4 h-40 w-40 rotate-12 rounded-full border-[10px] border-organic-terracotta/25 bg-white/20"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-organic-mintDeep/25"
          aria-hidden
        />

        <button
          type="button"
          aria-label="Previous slide"
          onClick={() =>
            setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length)
          }
          className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-stone-200/80 bg-white p-2.5 text-organic-primary shadow-lg transition hover:bg-organic-cream md:left-4"
        >
          <Chevron direction="left" />
        </button>
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => setIndex((i) => (i + 1) % SLIDES.length)}
          className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-stone-200/80 bg-white p-2.5 text-organic-primary shadow-lg transition hover:bg-organic-cream md:right-4"
        >
          <Chevron direction="right" />
        </button>

        <div className="relative z-10 grid items-center gap-8 px-5 py-10 md:grid-cols-2 md:gap-6 md:px-12 md:py-14 lg:px-16">
          <div className="max-w-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-organic-primary md:text-xs">
              {BRAND.domain}
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-[1.15] tracking-tight text-gray-950 md:text-4xl lg:text-[2.65rem]">
              {slide.title}
            </h1>
            <p className="mt-4 text-base font-medium leading-relaxed text-gray-800 md:text-lg">
              {slide.subtitle}
            </p>
            <Link
              to="/listing"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-organic-terracotta px-8 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg ring-1 ring-black/5 transition hover:brightness-105 active:scale-[0.99]"
            >
              Shop now
            </Link>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            {FLOATING.map((card) => (
              <div
                key={card.label}
                className={`absolute z-10 max-w-[118px] rounded-2xl border border-stone-200/90 bg-white p-2.5 text-[11px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:max-w-[140px] sm:p-3 sm:text-xs ${
                  card.badge
                    ? "font-bold uppercase tracking-wide text-organic-primary"
                    : ""
                }`}
                style={{
                  top: card.top,
                  ...(card.left != null ? { left: card.left } : {}),
                  ...(card.right != null ? { right: card.right } : {}),
                }}
              >
                {card.badge ? (
                  <span className="inline-flex items-center rounded-full border-2 border-organic-terracotta bg-white px-2 py-1 text-[10px] text-organic-primary sm:text-[11px]">
                    {card.label}
                  </span>
                ) : (
                  <>
                    <p className="font-bold text-gray-950">{card.label}</p>
                    <p className="mt-1 text-sm font-semibold text-amber-600">
                      {card.rating}
                    </p>
                  </>
                )}
              </div>
            ))}

            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)] md:aspect-square">
              <img
                key={slide.image}
                src={slide.image}
                alt={slide.alt}
                className="h-full w-full object-cover transition duration-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-2 pb-6">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-2.5 rounded-full transition-all ${
                i === index ? "w-9 bg-organic-primary" : "w-2.5 bg-organic-primary/35"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Chevron({ direction }) {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      {direction === "left" ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      )}
    </svg>
  );
}
