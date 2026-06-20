import { useDispatch } from "react-redux";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addToCart } from "../redux/cartSlice";
import useToast from "../hooks/useToast";
import { CURRENCY_SYMBOL } from "../utils/constants";
import WishlistButton from "./WishlistButton";
import QuantityStepper from "./common/QuantityStepper";
import { PRODUCT_IMAGE_FALLBACK, resolveMedusaImageUrl } from "../utils/medusaImage";
import { isMedusaConfigured } from "../config/publicEnv";
import useMedusaCart from "../hooks/useMedusaCart";

function priceOf(product) {
  const v = product?.variants?.[0];
  if (v?.calculated_price?.calculated_amount != null) {
    return Number(v.calculated_price.calculated_amount) / 100;
  }
  const amt = v?.prices?.[0]?.amount;
  return amt != null ? amt / 100 : 0;
}

export default function QuickViewModal({ product, onClose }) {
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const { addVariant } = useMedusaCart();
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const tid = window.setTimeout(() => setQuantity(1), 0);
    return () => window.clearTimeout(tid);
  }, [product?.id]);

  if (!product) return null;

  const image = resolveMedusaImageUrl(product.thumbnail);

  const price = priceOf(product);
  const subtitle =
    product.subtitle ||
    product.vendor ||
    product?.metadata?.vendor ||
    "Organic Canada";

  const variantId = product?.variants?.[0]?.id ? String(product.variants[0].id) : "";

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleAdd = async () => {
    setAdding(true);
    try {
      if (isMedusaConfigured() && variantId) {
        await addVariant({ variantId, quantity });
      } else {
        dispatch(
          addToCart({
            id: product.id,
            title: product.title,
            price,
            image,
            quantity,
          })
        );
      }
      showToast(`Added ${quantity} to cart`, "success", 1500);
      setQuantity(1);
      onClose();
    } catch (e) {
      showToast(e?.message || "Could not add to cart", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-organic-brown/10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qv-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg text-organic-brown shadow hover:bg-organic-cream"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="relative aspect-[16/10] w-full overflow-hidden bg-organic-cream">
          <img
            src={image}
            alt={product.title}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PRODUCT_IMAGE_FALLBACK;
            }}
          />
          <WishlistButton item={product} variant="overlay" positionClass="right-14 top-3" />
        </div>

        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-organic-brown/50">
            {subtitle}
          </p>
          <h2 id="qv-title" className="mt-1 text-2xl font-bold text-organic-brown">
            {product.title}
          </h2>
          <p className="mt-3 text-lg font-semibold text-organic-terracotta">
            {CURRENCY_SYMBOL}
            {price.toFixed(2)}
          </p>
          {product.description ? (
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              {product.description}
            </p>
          ) : null}

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Quantity
            </p>
            <QuantityStepper value={quantity} onChange={setQuantity} min={1} max={99} />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding || (isMedusaConfigured() && !variantId)}
              className="flex-1 rounded-xl bg-organic-brown py-3 text-sm font-semibold text-white transition hover:bg-organic-brownMuted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add to cart"}
            </button>
            <Link
              to={`/product/${product.id}`}
              onClick={onClose}
              className="flex flex-1 items-center justify-center rounded-xl border border-organic-brown/20 py-3 text-center text-sm font-semibold text-organic-brown transition hover:bg-organic-cream"
            >
              Full details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
