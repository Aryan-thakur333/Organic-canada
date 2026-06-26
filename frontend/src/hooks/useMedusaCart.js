import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearCart,
  hydrateFromMedusa,
  setMedusaCartId,
} from "../redux/cartSlice";
import { isMedusaConfigured } from "../config/publicEnv";
import { resolveDefaultRegionId } from "../lib/medusa/regions";
import { getSdkErrorMessage } from "../lib/medusa/errors";
import {
  addLineItem,
  buildCartHydrationPayload,
  createCart,
  deleteLineItem,
  retrieveCart,
  setPromotionCodes,
  updateLineItem,
} from "../services/medusa/cartService";

function isStaleCartError(error) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.message || error?.message || "").toLowerCase();
  return status === 404 || status === 409 ||
    (status === 400 && ["cart not found", "cart does not exist", "cart is completed"].some((text) => message.includes(text)));
}

export default function useMedusaCart() {
  const dispatch = useDispatch();
  const medusaCartId = useSelector((s) => s.cart.medusaCartId);

  const applyHydration = useCallback(
    (cart) => {
      if (cart && typeof cart === "object") {
        dispatch(hydrateFromMedusa(buildCartHydrationPayload(cart)));
      }
    },
    [dispatch]
  );

  const refreshFromServer = useCallback(
    async (cartId = medusaCartId) => {
      if (!isMedusaConfigured() || !cartId) return null;
      try {
        const { cart } = await retrieveCart(cartId);
        console.log("[useMedusaCart] Refreshed cart context:", {
          cartId: cart?.id,
          customerId: cart?.customer_id,
          salesChannelId: cart?.sales_channel_id,
        });
        applyHydration(cart);
        return cart;
      } catch (error) {
        if (isStaleCartError(error)) {
          dispatch(setMedusaCartId(""));
          dispatch(clearCart());
          throw new Error("Cart expired or invalid — starting a new cart.");
        }
        throw error;
      }
    },
    [applyHydration, dispatch, medusaCartId]
  );

  const ensureCart = useCallback(async () => {
    if (!isMedusaConfigured()) return null;

    if (medusaCartId) {
      try {
        const { cart } = await retrieveCart(medusaCartId);
        applyHydration(cart);
        return medusaCartId;
      } catch (error) {
        if (!isStaleCartError(error)) throw error;
        dispatch(setMedusaCartId(""));
      }
    }

    const region_id = await resolveDefaultRegionId();
    if (!region_id) throw new Error("Store is currently unavailable in your region.");
    const { cart } = await createCart({ region_id });
    console.log("[useMedusaCart] Created storefront cart:", {
      cartId: cart?.id,
      customerId: cart?.customer_id,
      salesChannelId: cart?.sales_channel_id,
    });
    applyHydration(cart);
    return cart?.id ? String(cart.id) : null;
  }, [applyHydration, dispatch, medusaCartId]);

  /**
   * @param {{ variantId: string; quantity?: number; metadata?: Record<string, any> }} payload
   */
  const addVariant = useCallback(
    async (payload) => {
      const qty = Math.min(99, Math.max(1, Number(payload.quantity) || 1));
      let cartId = await ensureCart();
      if (!cartId) {
        throw new Error("Medusa is not configured (missing publishable key).");
      }
      try {
        const { cart } = await addLineItem(cartId, {
          variant_id: payload.variantId,
          quantity: qty,
          metadata: payload.metadata,
        });
        applyHydration(cart);
        return cart;
      } catch (err) {
        // Stale cart — discard it, create a fresh one, and retry once.
        if (!isStaleCartError(err)) throw err;
        console.warn("[useMedusaCart] addLineItem failed, retrying with fresh cart:", err);
        dispatch(setMedusaCartId(""));
        const region_id = await resolveDefaultRegionId();
        if (!region_id) throw new Error("Store is currently unavailable in your region.");
        const { cart: freshCart } = await createCart({ region_id });
        console.log("[useMedusaCart] Created fresh storefront cart after retry:", {
          cartId: freshCart?.id,
          customerId: freshCart?.customer_id,
          salesChannelId: freshCart?.sales_channel_id,
        });
        applyHydration(freshCart);
        cartId = freshCart?.id;
        if (!cartId) throw err;
        const { cart } = await addLineItem(cartId, {
          variant_id: payload.variantId,
          quantity: qty,
          metadata: payload.metadata,
        });
        applyHydration(cart);
        return cart;
      }
    },
    [applyHydration, dispatch, ensureCart]
  );

  /**
   * @param {string} lineItemId
   * @param {number} quantity
   */
  const setLineQuantity = useCallback(
    async (lineItemId, quantity) => {
      if (!isMedusaConfigured() || !medusaCartId) return;
      const q = Math.min(99, Math.max(1, Number(quantity) || 1));
      const { cart } = await updateLineItem(medusaCartId, lineItemId, { quantity: q });
      applyHydration(cart);
    },
    [applyHydration, medusaCartId]
  );

  /**
   * @param {string} lineItemId
   */
  const removeLine = useCallback(
    async (lineItemId) => {
      if (!isMedusaConfigured() || !medusaCartId) return;
      const res = await deleteLineItem(medusaCartId, lineItemId);
      const cart = res?.parent ?? res?.cart;
      if (cart) applyHydration(cart);
      else await refreshFromServer();
    },
    [applyHydration, medusaCartId, refreshFromServer]
  );

  /**
   * @param {string} code
   */
  const applyPromotionCode = useCallback(
    async (code) => {
      if (!isMedusaConfigured() || !medusaCartId) {
        return { success: false, error: "Cart not ready" };
      }
      const trimmed = String(code || "").trim();
      if (!trimmed) return { success: false, error: "Enter a code" };
      try {
        const { cart } = await setPromotionCodes(medusaCartId, [trimmed]);
        applyHydration(cart);
        const discount = buildCartHydrationPayload(cart).promo.discount;
        const applied = (cart.promotions?.length ?? 0) > 0 || discount > 0;
        return { success: applied, discountAmount: discount };
      } catch (e) {
        return { success: false, error: getSdkErrorMessage(e, "Invalid promotion code") };
      }
    },
    [applyHydration, medusaCartId]
  );

  const clearPromotions = useCallback(async () => {
    if (!isMedusaConfigured() || !medusaCartId) return;
    try {
      const { cart } = await setPromotionCodes(medusaCartId, []);
      applyHydration(cart);
    } catch {
      /* ignore */
    }
  }, [applyHydration, medusaCartId]);

  return {
    medusaCartId,
    ensureCart,
    refreshFromServer,
    addVariant,
    setLineQuantity,
    removeLine,
    applyPromotionCode,
    clearPromotions,
  };
}
