import { Link } from "react-router-dom";
import WishlistButton from "../WishlistButton";
import { PRODUCT_IMAGE_FALLBACK, resolveMedusaImageUrl } from "../../utils/medusaImage";

const CATALOG_LABEL = "Medusa Product";

export default function OrganicProductCard({ item, onQuickView }) {
  const img = resolveMedusaImageUrl(item.thumbnail);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] transition duration-300 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-lg">
      <div className="relative">
        <Link
          to={`/product/${item.id}`}
          className="block flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-organic-primary/30"
        >
          <div className="relative aspect-square border-b border-stone-100 bg-white p-4">
            <img
              src={img}
              alt={item.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = PRODUCT_IMAGE_FALLBACK;
              }}
            />
          </div>
          <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
            <h3 className="line-clamp-2 min-h-[2.75rem] text-sm font-bold leading-snug text-gray-950 md:text-base">
              {item.title}
            </h3>
            <p className="mt-1 text-xs font-semibold text-gray-600">{CATALOG_LABEL}</p>
          </div>
        </Link>
        <WishlistButton item={item} variant="overlay" />
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-stone-100 bg-organic-pageMuted/50 px-4 py-3">
        <Link
          to={`/product/${item.id}`}
          className="text-sm font-semibold text-organic-primary transition hover:text-organic-brownMuted"
        >
          View details
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onQuickView?.(item);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-organic-primary shadow-sm transition hover:border-organic-primary/30 hover:bg-organic-peach/50"
          aria-label={`Quick view ${item.title}`}
        >
          <EyeIcon />
        </button>
      </div>
    </article>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}
