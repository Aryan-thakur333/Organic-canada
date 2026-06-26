import { useEffect, useRef, useCallback } from "react";
import { useSelector } from "react-redux";
import useToast from "./useToast";
import { fetchCustomerOrders } from "../services/apiClient";

const POLL_INTERVAL = 30000; // 30 seconds

/**
 * useOrderNotifications — polls for recent order status updates and shows
 * a toast notification when an order transitions to a new status.
 *
 * Only runs when the user is authenticated. Starts polling on mount and
 * cleans up on unmount.
 */
export default function useOrderNotifications() {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const { showToast } = useToast();
  const knownStatuses = useRef({}); // { [orderId]: status }
  const backendOnline = useRef(true);

  const checkForUpdates = useCallback(async () => {
    if (!isAuthenticated || !backendOnline.current) return;

    try {
      const res = await fetchCustomerOrders();
      const orders = res?.orders || [];

      for (const order of orders) {
        const prev = knownStatuses.current[order.id];
        const curr = order.status;

        if (!prev) {
          // First load — just record the status
          knownStatuses.current[order.id] = curr;
          continue;
        }

        if (prev !== curr) {
          // Status changed! Show notification
          knownStatuses.current[order.id] = curr;

          const orderLabel = `#${order.display_id || order.id.slice(-8).toUpperCase()}`;

          const messages = {
            processing: `Order ${orderLabel} is now being prepared!`,
            fulfilled: `Order ${orderLabel} has been fulfilled!`,
            completed: `Order ${orderLabel} is complete!`,
            shipped: `Order ${orderLabel} is on its way!`,
            canceled: `Order ${orderLabel} was canceled.`,
            requires_action: `Order ${orderLabel} needs your attention.`,
          };

          const msg =
            messages[curr] || `Order ${orderLabel} status changed to "${curr}".`;

          if (curr === "canceled") {
            showToast(msg, "error", 5000);
          } else if (curr === "requires_action") {
            showToast(msg, "warning", 5000);
          } else {
            showToast(msg, "success", 4000);
          }
        }
      }
    } catch {
      // Silently ignore — polling shouldn't be noisy
    }
  }, [isAuthenticated, showToast]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const updateBackendStatus = (event) => {
      backendOnline.current = event.detail?.online !== false;
      if (backendOnline.current) checkForUpdates();
    };
    window.addEventListener("organic-backend-status", updateBackendStatus);

    // Run immediately on mount
    checkForUpdates();

    const interval = setInterval(checkForUpdates, POLL_INTERVAL);
    return () => {
      clearInterval(interval);
      window.removeEventListener("organic-backend-status", updateBackendStatus);
    };
  }, [isAuthenticated, checkForUpdates]);
}
