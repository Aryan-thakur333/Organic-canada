import { useDispatch, useSelector } from "react-redux";
import { useMemo, useState } from "react";
import {
  addToCart,
  clearCart,
  clearCartPromo,
  decreaseQty,
  increaseQty,
  removeFromCart,
  setCartPromo,
} from "../redux/cartSlice";
import { applyCoupon } from "../services/api";
import { computeCheckoutTotals } from "../utils/checkoutTotals";
import { formatMoney } from "../lib/medusa/money";
import { isMedusaConfigured } from "../config/publicEnv";
import useMedusaCart from "./useMedusaCart";
import useToast from "./useToast";
import apiClient from "../services/apiClient";

function safeTotals(items, discount) {
  try {
    return computeCheckoutTotals(items, { discount });
  } catch {
    return {
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      totalCents: 0,
      subtotalCents: 0,
      taxCents: 0,
      discountCents: 0,
    };
  }
}

export default function useCart() {
  const dispatch = useDispatch();
  const items = useSelector((state) => state.cart.items);
  const promo = useSelector((state) => state.cart.promo);
  const medusaCartId = useSelector((state) => state.cart.medusaCartId);
  const serverTotals = useSelector((state) => state.cart.serverTotals);
  const currencyCode = useSelector((state) => state.cart.currencyCode);
  const { showToast } = useToast();
  const { applyPromotionCode, ensureCart, clearPromotions } = useMedusaCart();
  const [couponInput, setCouponInput] = useState("");

  const useMedusaMoney =
    isMedusaConfigured() && Boolean(medusaCartId) && items.length > 0;

  const couponDiscount = useMedusaMoney
    ? Math.max(0, Number(serverTotals.discount) || 0)
    : Math.max(0, Number(promo.discount) || 0);
  const couponCode = promo.code || "";

  const preCoupon = useMemo(() => safeTotals(items, 0), [items]);
  const billed = useMemo(() => safeTotals(items, couponDiscount), [items, couponDiscount]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const subtotal = (useMedusaMoney && Number(serverTotals.subtotal) > 0)
    ? Math.max(0, Number(serverTotals.subtotal) || 0)
    : preCoupon.subtotal;
  const tax = (useMedusaMoney && Number(serverTotals.total) > 0) 
    ? Math.max(0, Number(serverTotals.tax) || 0) 
    : preCoupon.tax;
  const grandTotal = (useMedusaMoney && Number(serverTotals.total) > 0)
    ? Math.max(0, Number(serverTotals.total) || 0)
    : billed.total;

  const totalCents = useMedusaMoney
    ? Math.round(grandTotal * 100)
    : billed.totalCents;

  const shipping = useMedusaMoney ? Math.max(0, Number(serverTotals.shipping) || 0) : 0;

  const applyCouponCode = async (code) => {
    const trimmed = String(code || "").trim().toUpperCase();
    if (!trimmed) {
      showToast("Enter a coupon code", "error");
      return false;
    }

    if (isMedusaConfigured()) {
      try {
        const cartId = await ensureCart();
        
        // 1. Call our custom coupon validation API!
        console.log(`[useCart] Validating coupon ${trimmed} for cart ${cartId}...`);
        const validateRes = await apiClient.post("/store/promotions/validate", {
          code: trimmed,
          cart_id: cartId,
        });

        if (!validateRes || !validateRes.valid) {
          showToast(validateRes?.message || "Invalid or ineligible coupon", "error");
          return false;
        }

        // 2. If valid, apply via Medusa Cart Update
        const res = await applyPromotionCode(trimmed);
        if (res.success) {
          dispatch(
            setCartPromo({
              code: trimmed,
              discount: res.discountAmount || validateRes.coupon?.value || 0,
            })
          );
          showToast("Promotion applied successfully", "success");
          return true;
        }
        
        await clearPromotions();
        dispatch(clearCartPromo());
        showToast(res.error || "Invalid or ineligible promotion", "error");
        return false;
      } catch (e) {
        console.error("[useCart] Apply coupon failed:", e);
        showToast(e?.message || "Could not apply promotion", "error");
        return false;
      }
    }

    const response = await applyCoupon(trimmed, preCoupon.subtotal);
    if (response.success) {
      dispatch(
        setCartPromo({
          code: trimmed,
          discount: response.discountAmount || 0,
        })
      );
      showToast("Coupon applied successfully", "success");
      return true;
    }
    dispatch(clearCartPromo());
    showToast("Invalid or ineligible coupon", "error");
    return false;
  };

  const removeCouponCode = async () => {
    if (isMedusaConfigured()) {
      try {
        await clearPromotions();
        dispatch(clearCartPromo());
        showToast("Coupon removed", "success");
        return true;
      } catch (e) {
        showToast("Could not remove coupon", "error");
        return false;
      }
    }
    dispatch(clearCartPromo());
    showToast("Coupon removed", "success");
    return true;
  };

  const formatPrice = (amountMajor) => formatMoney(amountMajor, currencyCode || "usd");

  return {
    items,
    totalItems,
    subtotal,
    tax,
    shipping,
    couponCode,
    couponDiscount,
    couponInput,
    setCouponInput,
    grandTotal,
    totalCents,
    currencyCode,
    formatPrice,
    applyCouponCode,
    removeCouponCode,
    clear: () => dispatch(clearCart()),
    addItem: (item) => dispatch(addToCart(item)),
    removeItem: (id) => dispatch(removeFromCart(id)),
    increaseItemQty: (id) => dispatch(increaseQty(id)),
    decreaseItemQty: (id) => dispatch(decreaseQty(id)),
    useMedusaMoney,
    medusaCartId,
  };
}
