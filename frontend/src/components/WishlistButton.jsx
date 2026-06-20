import { useDispatch, useSelector } from "react-redux";
import { toggleWishlist } from "../redux/wishlistSlice";
import useToast from "../hooks/useToast";

/**
 * @param {{ id: string; title?: string; thumbnail?: string; variants?: unknown[]; description?: string; vendor?: string; rating?: number }} item
 * @param {"card" | "overlay" | "inline"} variant
 * @param {string} [positionClass] Tailwind position classes when variant is overlay (default right-2 top-2)
 */
export default function WishlistButton({
  item,
  variant = "overlay",
  positionClass = "right-2 top-2",
}) {
  const dispatch = useDispatch();
  const { items } = useSelector((state) => state.wishlist);
  const { showToast } = useToast();

  const isWishlisted = items.some((i) => i.id === item.id);

  const baseRing =
    "flex items-center justify-center rounded-full border border-stone-200/90 bg-white/95 text-organic-primary shadow-md backdrop-blur-sm transition hover:border-organic-primary/40 hover:bg-white";

  const sizeClass =
    variant === "inline"
      ? "h-10 w-10"
      : variant === "card"
        ? "h-9 w-9"
        : "h-9 w-9 sm:h-10 sm:w-10";

  return (
    <button
      type="button"
      title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={isWishlisted}
      aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dispatch(toggleWishlist(item));
        showToast(
          isWishlisted ? "Removed from wishlist" : "Saved to wishlist",
          "success",
          1400
        );
      }}
      className={`${baseRing} ${sizeClass} ${
        variant === "overlay" ? `absolute z-20 ${positionClass}` : ""
      }`}
    >
      <HeartIcon filled={isWishlisted} />
    </button>
  );
}

function HeartIcon({ filled }) {
  if (filled) {
    return (
      <svg
        className="h-[44%] w-[44%] text-red-500"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  return (
    <svg
      className="h-[42%] w-[42%] text-organic-primary"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}
