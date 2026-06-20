import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { isMedusaConfigured } from "../../config/publicEnv";
import { hydrateFromMedusa, clearCart, setMedusaCartId } from "../../redux/cartSlice";
import { retrieveCart, buildCartHydrationPayload } from "../../services/medusa/cartService";

/**
 * Restores the Medusa cart from `medusaCartId` on app load and keeps Redux in sync with the server.
 */
export default function CartBootstrap() {
  const dispatch = useDispatch();
  const medusaCartId = useSelector((s) => s.cart.medusaCartId);
  const lastSynced = useRef("");

  useEffect(() => {
    if (!isMedusaConfigured() || !medusaCartId) return undefined;
    if (lastSynced.current === medusaCartId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { cart } = await retrieveCart(medusaCartId);
        if (cancelled || !cart) return;
        dispatch(hydrateFromMedusa(buildCartHydrationPayload(cart)));
        lastSynced.current = medusaCartId;
      } catch {
        if (!cancelled) {
          lastSynced.current = "";
          dispatch(setMedusaCartId(""));
          dispatch(clearCart());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, medusaCartId]);

  return null;
}
