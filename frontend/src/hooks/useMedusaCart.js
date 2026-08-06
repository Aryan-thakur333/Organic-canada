import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearCart,
  hydrateFromMedusa,
  setMedusaCartId,
} from "../redux/cartSlice";
import { isMedusaConfigured } from "../config/publicEnv";
import { resolveDefaultRegionId } from "../lib/medusa/regions";
import { useRegion } from "../contexts/RegionContext";
import { getSdkErrorMessage } from "../lib/medusa/errors";
import { getCustomerToken } from "../services/medusa/tokenStorage";
import { b2bApi } from "../services/b2bApi";
import apiClient from "../services/apiClient";
import {
  addLineItem,
  buildCartHydrationPayload,
  createCart,
  deleteLineItem,
  retrieveCart,
  setPromotionCodes,
  updateLineItem,
  resetPaymentSession,
  getCartStorageKey,
} from "../services/medusa/cartService";

function isCartStaleForMutation(cart) {
  return Boolean(
    cart?.completed_at ||
    cart?.order_id ||
    cart?.metadata?.completed === true ||
    cart?.payment_collection?.payments?.length ||
    cart?.payment_collection?.payment_sessions?.some(
      (s) => ["authorized", "captured", "requires_capture", "succeeded"].includes(String(s.status).toLowerCase())
    )
  );
}

function getModeFromPath() {
  const path = window.location.pathname;
  if (path.startsWith('/b2b/quotes')) return 'b2b_quote';
  if (path.startsWith('/b2b')) return 'b2b';
  return 'b2c';
}

function isStaleCartError(error) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.message || error?.message || "").toLowerCase();
  const code = error?.response?.data?.code;
  return status === 404 || status === 409 || code === "STALE_PAYMENT_SESSION" ||
    (status === 400 && ["cart not found", "cart does not exist", "cart is completed"].some((text) => message.includes(text)));
}

function isRecoverableStalePaymentError(error) {
  const message = String(error?.response?.data?.message || error?.message || "").toLowerCase();
  const code = error?.response?.data?.code;
  return code === "STALE_PAYMENT_SESSION" ||
    message.includes("could not delete all payment sessions") ||
    message.includes("payment session") ||
    message.includes("cannot read properties of undefined");
}

export default function useMedusaCart() {
  const dispatch = useDispatch();
  const medusaCartId = useSelector((s) => s.cart.medusaCartId);
  const activeCartRegionId = useSelector((s) => s.cart.regionId);
  const { region, currencyCode } = useRegion();
  const selectedRegionId = region?.id || "";
  
  const recoveryInFlightRef = useRef(false);
  const mutationInFlightRef = useRef(false);
  const invalidCartIdsRef = useRef(new Set());

  const logCartRegionCheck = useCallback((cart, source) => {
    if (!import.meta.env.DEV) return;
    console.log("CART REGION CHECK", {
      source,
      selectedRegionId,
      expectedCurrency: currencyCode,
      cartId: cart?.id,
      cartRegionId: cart?.region_id,
      cartCurrency: cart?.currency_code,
    });
  }, [currencyCode, selectedRegionId]);

  useEffect(() => {
    if (!selectedRegionId || !activeCartRegionId || activeCartRegionId === selectedRegionId) return;
    dispatch(setMedusaCartId(""));
    dispatch(clearCart());
  }, [activeCartRegionId, dispatch, selectedRegionId]);

  const persistCart = useCallback((cart) => {
    if (!cart?.id) {
        throw new Error("Cannot persist cart without ID");
    }
    const mode = getModeFromPath();
    const storageKey = getCartStorageKey(mode, cart.region_id || selectedRegionId);
    
    // Explicitly set the local storage before Redux state
    localStorage.setItem(storageKey, cart.id);
    
    logCartRegionCheck(cart, "persist");
    dispatch(setMedusaCartId(cart.id));
    dispatch(hydrateFromMedusa(buildCartHydrationPayload(cart)));
  }, [dispatch, logCartRegionCheck, selectedRegionId]);

  const refreshFromServer = useCallback(
    async (explicitCartId = null) => {
      if (!isMedusaConfigured()) return null;
      
      const mode = getModeFromPath();
      const storageKey = getCartStorageKey(mode, selectedRegionId);
      const cartIdToFetch = explicitCartId || localStorage.getItem(storageKey);
      
      if (!cartIdToFetch || invalidCartIdsRef.current.has(cartIdToFetch)) {
          return null;
      }

      try {
        const { cart } = await retrieveCart(cartIdToFetch);
        
        // Strict cart mode isolation logic
        const cartType = cart?.metadata?.cart_type || 'b2c';
        
        if (mode === 'b2c' && cartType !== 'b2c') {
            console.warn(`[useMedusaCart] Cart type mismatch! Expected b2c but found ${cartType}. Trashing cart.`);
            throw new Error("Cart type mismatch"); // Force stale handling
        }

        if (selectedRegionId && cart.region_id && cart.region_id !== selectedRegionId) {
          throw new Error("Cart region mismatch");
        }

        logCartRegionCheck(cart, "refresh");
        persistCart(cart);
        return cart;
      } catch (error) {
        if (isStaleCartError(error) || error.message === "Cart type mismatch" || error.message === "Cart region mismatch") {
          invalidCartIdsRef.current.add(cartIdToFetch);
          dispatch(setMedusaCartId(""));
          dispatch(clearCart());
          localStorage.removeItem(storageKey);
          throw new Error("Cart expired or invalid — starting a new cart.");
        }
        throw error;
      }
    },
    [dispatch, logCartRegionCheck, persistCart, selectedRegionId]
  );

  const ensureCart = useCallback(async () => {
    if (!isMedusaConfigured()) return null;

    const mode = getModeFromPath();
    const storageKey = getCartStorageKey(mode, selectedRegionId);
    let currentCartId = localStorage.getItem(storageKey);

    if (
      medusaCartId &&
      medusaCartId !== currentCartId &&
      activeCartRegionId === selectedRegionId &&
      !currentCartId &&
      mode !== 'b2c'
    ) {
      currentCartId = medusaCartId;
      localStorage.setItem(storageKey, currentCartId);
    }
    
    if (invalidCartIdsRef.current.has(currentCartId)) {
        currentCartId = null;
    }

    if (currentCartId) {
      try {
        const { cart } = await retrieveCart(currentCartId);
        
        const cartType = cart?.metadata?.cart_type || 'b2c';
        const typeMismatch = (mode === 'b2c' && cartType !== 'b2c') || (mode !== 'b2c' && cartType !== mode && cartType !== 'b2c'); 

        const regionMismatch = selectedRegionId && cart?.region_id && cart.region_id !== selectedRegionId;

        if (isCartStaleForMutation(cart) || (getCustomerToken() && !cart?.customer_id) || typeMismatch || regionMismatch) {
          invalidCartIdsRef.current.add(currentCartId);
          dispatch(setMedusaCartId(""));
          dispatch(clearCart());
          localStorage.removeItem(storageKey);
          currentCartId = null;
        } else {
          logCartRegionCheck(cart, "ensure-existing");
          persistCart(cart);
          return cart;
        }
      } catch (error) {
        if (!isStaleCartError(error)) throw error;
        invalidCartIdsRef.current.add(currentCartId);
        dispatch(setMedusaCartId(""));
        localStorage.removeItem(storageKey);
        currentCartId = null;
      }
    }

    const region_id = selectedRegionId || await resolveDefaultRegionId();
    if (!region_id) throw new Error("Store is currently unavailable in your region.");
    
    // Pass cart metadata explicitly to isolate B2B/B2C
    let b2bMeta = { cart_type: mode };
    if (mode === 'b2b' || mode === 'b2b_quote') {
        try {
            const companyRes = await b2bApi.getCompany();
            const company = companyRes?.company;
            if (company && (company.status === 'approved' || company.status === 'active')) {
                b2bMeta = {
                    ...b2bMeta,
                    customer_type: 'b2b',
                    b2b_company_id: company.id,
                    company_id: company.id,
                    b2b_company_name: company.company_name,
                    b2b_price_list: 'B2B customer',
                };
            }
        } catch(e) {
            console.info("B2B company check bypassed:", e?.message || e);
        }
    }

    const { cart } = await createCart({ region_id, metadata: b2bMeta });
    logCartRegionCheck(cart, "create");
    
    if (cart?.id) {
      persistCart(cart);
      return cart;
    }
    return null;
  }, [activeCartRegionId, dispatch, logCartRegionCheck, medusaCartId, persistCart, selectedRegionId]);

  const recreateFreshCartFromOldCart = useCallback(async ({ oldCart, excludeLineId, addVariant, quantityOverride }) => {
    invalidCartIdsRef.current.add(oldCart?.id);

    const mode = getModeFromPath();
    const storageKey = getCartStorageKey(mode, selectedRegionId);
    dispatch(setMedusaCartId(""));
    localStorage.removeItem(storageKey);
    
    // Extract valid variants to transfer based on our hydration logic
    const validItemsPayload = buildCartHydrationPayload(oldCart, { excludeLineId, quantityOverride });

    const region_id = selectedRegionId || await resolveDefaultRegionId();
    if (!region_id) throw new Error("Store is currently unavailable in your region.");
    
    let b2bMeta = { 
      cart_type: mode, 
      recovered_from_cart_id: oldCart?.id 
    };
    
    if (mode === 'b2b' || mode === 'b2b_quote') {
        try {
            const companyRes = await b2bApi.getCompany();
            const company = companyRes?.company;
            if (company && (company.status === 'approved' || company.status === 'active')) {
                b2bMeta = {
                    ...b2bMeta,
                    customer_type: 'b2b',
                    b2b_company_id: company.id,
                    company_id: company.id,
                    b2b_company_name: company.company_name,
                    b2b_price_list: 'B2B customer',
                };
            }
        } catch(e) {
            console.info("B2B company check bypassed:", e?.message || e);
        }
    }

    const { cart: newCart } = await createCart({ region_id, metadata: b2bMeta });
    
    if (!newCart?.id) {
      throw new Error("Fresh cart creation did not return a cart ID");
    }

    // Immediately atomic persist the new ID so no race conditions fetch the old one
    persistCart(newCart);
    
    let hydratedCart = newCart;

    // Re-add items sequentially using the EXPLICIT new cart ID
    for (const item of validItemsPayload.items) {
        try {
            const res = await addLineItem(newCart.id, {
                variant_id: item.variantId,
                quantity: item.quantity,
                metadata: item.metadata
            });
            hydratedCart = res.cart;
        } catch (e) {
            console.warn(`[useMedusaCart] Failed to re-add item ${item.title} to fresh cart`, e);
        }
    }

    if (addVariant?.variant_id) {
        try {
            const res = await addLineItem(newCart.id, {
                variant_id: addVariant.variant_id,
                quantity: addVariant.quantity,
                metadata: addVariant.metadata
            });
            hydratedCart = res.cart;
        } catch(e) {
            console.warn(`[useMedusaCart] Failed to add the explicitly requested variant to fresh cart`, e);
        }
    }

    persistCart(hydratedCart);
    return hydratedCart;
  }, [dispatch, persistCart, selectedRegionId]);

  const recoverCartOnce = useCallback(async (options) => {
    if (recoveryInFlightRef.current) {
        throw new Error("Cart recovery already in progress");
    }
    recoveryInFlightRef.current = true;
    try {
        return await recreateFreshCartFromOldCart(options);
    } finally {
        recoveryInFlightRef.current = false;
    }
  }, [recreateFreshCartFromOldCart]);

  const prepareCartForMutation = useCallback(async (cartId) => {
    if (invalidCartIdsRef.current.has(cartId)) {
        throw new Error("STALE_PAYMENT_SESSION");
    }
    
    let { cart } = await retrieveCart(cartId);
    const sessions = cart?.payment_collection?.payment_sessions || [];
    
    if (!sessions.length) return cart;

    try {
      const { recreate_cart } = (await resetPaymentSession(cartId)).data || (await resetPaymentSession(cartId));
      if (recreate_cart) {
          throw new Error("STALE_PAYMENT_SESSION");
      }
      const refreshed = await retrieveCart(cartId);
      return refreshed.cart;
    } catch (error) {
      if (isRecoverableStalePaymentError(error) || error.message === "STALE_PAYMENT_SESSION") {
          invalidCartIdsRef.current.add(cartId);
          throw new Error("STALE_PAYMENT_SESSION"); // Pass it up to trigger recoverCartOnce
      }
      throw error;
    }
  }, []);

  const addVariant = useCallback(
    async (payload) => {
      if (mutationInFlightRef.current) return;
      mutationInFlightRef.current = true;

      const qty = Math.min(100, Math.max(1, Number(payload.quantity) || 1));
      
      let b2bMeta = {};
      try {
        const mode = getModeFromPath();
        if (mode === 'b2b' || mode === 'b2b_quote') {
            const companyRes = await b2bApi.getCompany();
            const company = companyRes?.company;
            if (company && (company.status === 'approved' || company.status === 'active')) {
                b2bMeta = {
                    b2b: true,
                    customer_type: 'b2b',
                    b2b_company_id: company.id,
                    b2b_company_name: company.company_name,
                    b2b_price_list: 'B2B customer',
                };
            }
        }
      } catch (err) {
        console.info("B2B context check bypassed:", err?.message || err);
      }

      const mergedMetadata = {
        ...b2bMeta,
        ...(payload.metadata || {}),
      };

      try {
        let currentCart = await ensureCart();
        if (!currentCart) throw new Error("Medusa is not configured (missing publishable key).");
        const expectedCurrency = String(payload.currencyCode || currencyCode || "").toLowerCase();
        const cartCurrency = String(currentCart.currency_code || "").toLowerCase();
        if (expectedCurrency && cartCurrency && expectedCurrency !== cartCurrency) {
          throw new Error("Cart currency does not match the selected storefront region.");
        }

        let targetCart = currentCart;

        try {
            targetCart = await prepareCartForMutation(currentCart.id);
        } catch (error) {
            if (isRecoverableStalePaymentError(error) || error.message === "STALE_PAYMENT_SESSION") {
                console.warn("[useMedusaCart] Stale session hit on prepare for addVariant. Rebuilding...");
                targetCart = await recoverCartOnce({
                    oldCart: currentCart
                });
            } else {
                throw error;
            }
        }

        const { cart } = await addLineItem(targetCart.id, {
          variant_id: payload.variantId,
          quantity: qty,
          metadata: mergedMetadata,
        });
        persistCart(cart);
        return cart;
      } catch (err) {
        if (isRecoverableStalePaymentError(err) || err.message === "STALE_PAYMENT_SESSION") {
            const currentCart = await ensureCart();
            console.warn("[useMedusaCart] Stale session hit directly on addLineItem despite prepare. Rebuilding...");
            const recoveredCart = await recoverCartOnce({
                oldCart: currentCart,
                addVariant: {
                    variant_id: payload.variantId,
                    quantity: qty,
                    metadata: mergedMetadata
                }
            });
            persistCart(recoveredCart);
            return recoveredCart;
        }
        throw err;
      } finally {
          mutationInFlightRef.current = false;
      }
    },
    [currencyCode, ensureCart, prepareCartForMutation, recoverCartOnce, persistCart]
  );

  const addPersonalizedVariant = useCallback(
    async (payload) => {
      if (mutationInFlightRef.current) return;
      mutationInFlightRef.current = true;

      const qty = Math.min(100, Math.max(1, Number(payload.quantity) || 1));

      try {
        let currentCart = await ensureCart();
        if (!currentCart) throw new Error("Medusa is not configured.");

        let targetCart = currentCart;

        try {
          targetCart = await prepareCartForMutation(currentCart.id);
        } catch (error) {
          if (isRecoverableStalePaymentError(error) || error.message === "STALE_PAYMENT_SESSION") {
            targetCart = await recoverCartOnce({
              oldCart: currentCart
            });
          } else {
            throw error;
          }
        }

        const res = await apiClient.post(`/store/carts/${targetCart.id}/line-items/personalized`, {
          variant_id: payload.variantId,
          quantity: qty,
          personalization_values: payload.values,
          upload_ids: payload.uploadIds || []
        });

        // apiClient returns the response body after its interceptor unwraps it.
        const refreshed = res?.cart || res?.data?.cart;
        if (!refreshed?.id) throw new Error("Personalized cart response did not include a cart");
        persistCart(refreshed);
        return refreshed;
      } finally {
        mutationInFlightRef.current = false;
      }
    },
    [ensureCart, prepareCartForMutation, recoverCartOnce, persistCart]
  );

  const addBundleVariant = useCallback(async ({ bundleId, quantity, countryCode }) => {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    try {
      let currentCart = await ensureCart();
      if (!currentCart) throw new Error("Medusa is not configured.");
      let targetCart = currentCart;
      try {
        targetCart = await prepareCartForMutation(currentCart.id);
      } catch (error) {
        if (isRecoverableStalePaymentError(error) || error.message === "STALE_PAYMENT_SESSION") targetCart = await recoverCartOnce({ oldCart: currentCart });
        else throw error;
      }
      const response = await apiClient.post(`/store/carts/${targetCart.id}/bundled-line-items`, {
        bundle_id: bundleId,
        quantity: Math.min(100, Math.max(1, Number(quantity) || 1)),
      });
      // Response from bundled-line-items endpoint: { cart, bundle_group_id }
      const updatedCart = response.cart || response.data?.cart;
      if (updatedCart) persistCart(updatedCart);
      return updatedCart || response;
    } finally {
      mutationInFlightRef.current = false;
    }
  }, [ensureCart, persistCart, prepareCartForMutation, recoverCartOnce]);

  const setLineQuantity = useCallback(
    async (lineItemId, quantity) => {
      if (mutationInFlightRef.current) return;
      mutationInFlightRef.current = true;
      
      const q = Math.min(100, Math.max(1, Number(quantity) || 1));

      try {
        let currentCart = await ensureCart();
        if (!currentCart) return;
        
        let targetCart = currentCart;

        try {
            targetCart = await prepareCartForMutation(currentCart.id);
        } catch (error) {
            if (isRecoverableStalePaymentError(error) || error.message === "STALE_PAYMENT_SESSION") {
                const oldItem = currentCart.items.find(i => i.id === lineItemId);
                if (oldItem && oldItem.variant_id) {
                    console.warn("[useMedusaCart] Stale session hit on prepare for setLineQuantity. Rebuilding...");
                    targetCart = await recoverCartOnce({
                        oldCart: currentCart,
                        quantityOverride: {
                            variant_id: oldItem.variant_id,
                            quantity: q
                        }
                    });
                }
                return; // Rebuild handled the update
            } else {
                throw error;
            }
        }

        const { cart } = await updateLineItem(targetCart.id, lineItemId, { quantity: q });
        persistCart(cart);
      } catch (err) {
        if (isRecoverableStalePaymentError(err) || err.message === "STALE_PAYMENT_SESSION") {
            const currentCart = await ensureCart();
            const oldItem = currentCart.items.find(i => i.id === lineItemId);
            if (oldItem && oldItem.variant_id) {
                console.warn("[useMedusaCart] Stale session hit on updateLineItem. Rebuilding...");
                const recoveredCart = await recoverCartOnce({
                    oldCart: currentCart,
                    quantityOverride: {
                        variant_id: oldItem.variant_id,
                        quantity: q
                    }
                });
                persistCart(recoveredCart);
            }
        } else {
           throw err;
        }
      } finally {
          mutationInFlightRef.current = false;
      }
    },
    [ensureCart, prepareCartForMutation, recoverCartOnce, persistCart]
  );

  const removeLine = useCallback(
    async (lineItemId) => {
      if (mutationInFlightRef.current) return;
      mutationInFlightRef.current = true;
      
      try {
          let currentCart = await ensureCart();
          if (!currentCart) return;
          
          let targetCart = currentCart;

          try {
              targetCart = await prepareCartForMutation(currentCart.id);
          } catch(error) {
              if (isRecoverableStalePaymentError(error) || error.message === "STALE_PAYMENT_SESSION") {
                  console.warn("[useMedusaCart] Stale session hit on prepare for removeLine. Rebuilding...");
                  targetCart = await recoverCartOnce({
                      oldCart: currentCart,
                      excludeLineId: lineItemId
                  });
                  return; // The rebuild natively excluded the item, no DELETE needed
              } else {
                  throw error;
              }
          }

          const stillExists = (targetCart.items || []).some(i => i.id === lineItemId);
          
          if (stillExists) {
              try {
                  const res = await deleteLineItem(targetCart.id, lineItemId);
                  const cart = res?.parent ?? res?.cart;
                  if (cart) persistCart(cart);
                  else await refreshFromServer(targetCart.id);
              } catch (err) {
                  if (isRecoverableStalePaymentError(err) || err.message === "STALE_PAYMENT_SESSION") {
                     console.warn("[useMedusaCart] Stale session hit on removeLine. Rebuilding...");
                     const recoveredCart = await recoverCartOnce({
                         oldCart: currentCart,
                         excludeLineId: lineItemId
                     });
                     persistCart(recoveredCart);
                  } else {
                     throw err;
                  }
              }
          } else {
              persistCart(targetCart);
          }
      } finally {
          mutationInFlightRef.current = false;
      }
    },
    [ensureCart, prepareCartForMutation, recoverCartOnce, persistCart, refreshFromServer]
  );

  const applyPromotionCode = useCallback(
    async (code) => {
      if (!isMedusaConfigured() || !medusaCartId) {
        return { success: false, error: "Cart not ready" };
      }
      const trimmed = String(code || "").trim();
      if (!trimmed) return { success: false, error: "Enter a code" };
      
      if (mutationInFlightRef.current) return { success: false, error: "Operation in progress" };
      mutationInFlightRef.current = true;
      
      try {
        let currentCart = await ensureCart();
        let targetCart = currentCart;

        try {
            targetCart = await prepareCartForMutation(currentCart.id);
        } catch(error) {
            if (isRecoverableStalePaymentError(error) || error.message === "STALE_PAYMENT_SESSION") {
                targetCart = await recoverCartOnce({ oldCart: currentCart });
            } else {
                throw error;
            }
        }
        
        const { cart } = await setPromotionCodes(targetCart.id, [trimmed]);
        persistCart(cart);
        const discount = buildCartHydrationPayload(cart).promo.discount;
        const applied = (cart.promotions?.length ?? 0) > 0 || discount > 0;
        return { success: applied, discountAmount: discount };
      } catch (e) {
        if (isRecoverableStalePaymentError(e) || e.message === "STALE_PAYMENT_SESSION") {
             const currentCart = await ensureCart();
             const recoveredCart = await recoverCartOnce({ oldCart: currentCart });
             persistCart(recoveredCart);
             try {
                const { cart } = await setPromotionCodes(recoveredCart.id, [trimmed]);
                persistCart(cart);
                const discount = buildCartHydrationPayload(cart).promo.discount;
                const applied = (cart.promotions?.length ?? 0) > 0 || discount > 0;
                return { success: applied, discountAmount: discount };
             } catch(retryE) {
                 return { success: false, error: getSdkErrorMessage(retryE, "Invalid promotion code") };
             }
        }
        return { success: false, error: getSdkErrorMessage(e, "Invalid promotion code") };
      } finally {
          mutationInFlightRef.current = false;
      }
    },
    [ensureCart, medusaCartId, prepareCartForMutation, persistCart, recoverCartOnce]
  );

  const clearPromotions = useCallback(async () => {
    if (!isMedusaConfigured() || !medusaCartId) return;
    
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    
    try {
      let currentCart = await ensureCart();
      let targetCart = currentCart;

      try {
          targetCart = await prepareCartForMutation(currentCart.id);
      } catch(error) {
          if (isRecoverableStalePaymentError(error) || error.message === "STALE_PAYMENT_SESSION") {
              targetCart = await recoverCartOnce({ oldCart: currentCart });
          } else {
              throw error;
          }
      }
      
      const { cart } = await setPromotionCodes(targetCart.id, []);
      persistCart(cart);
    } catch(e) {
        if (isRecoverableStalePaymentError(e) || e.message === "STALE_PAYMENT_SESSION") {
            const currentCart = await ensureCart();
            const recoveredCart = await recoverCartOnce({ oldCart: currentCart });
            persistCart(recoveredCart);
            try {
               const { cart } = await setPromotionCodes(recoveredCart.id, []);
                persistCart(cart);
             } catch(retryE) {
                 console.warn("Promotion clear retry failed:", retryE?.message || retryE);
             }
        }
    } finally {
        mutationInFlightRef.current = false;
    }
  }, [ensureCart, medusaCartId, prepareCartForMutation, persistCart, recoverCartOnce]);

  return {
    medusaCartId,
    ensureCart,
    refreshFromServer,
    addVariant,
    addPersonalizedVariant,
    addBundleVariant,
    setLineQuantity,
    removeLine,
    applyPromotionCode,
    clearPromotions,
  };
}
