import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { ADMIN_RETURN_PATH_STORAGE_KEY, safeAdminReturnPath } from "../lib/admin-session"

/**
 * Global redirection helper widget.
 * After a session expires and the admin logs in again, they land on the
 * default orders/products list. This widget intercepts the load, checks for
 * eatsie_admin_return_path, validates it to prevent open redirects,
 * and returns the admin to the USA Price Approval workflow automatically.
 */
const EatsieRedirectionWidget = () => {
  useEffect(() => {
    try {
      const returnPath = sessionStorage.getItem(ADMIN_RETURN_PATH_STORAGE_KEY)
      if (returnPath) {
        // Validate return path strictly (only same-origin /app/* paths, no protocols, no hosts)
        const safePath = safeAdminReturnPath(returnPath)

        sessionStorage.removeItem(ADMIN_RETURN_PATH_STORAGE_KEY)
        if (safePath) {
          window.location.replace(window.location.origin + safePath)
        }
      }
    } catch (e) {
      // Fail-safe
    }
  }, [])

  return null
}

export const config = defineWidgetConfig({
  zone: [
    "product.list.after",
    "order.list.after",
    "customer.list.after",
    "promotion.list.after",
  ],
})

export default EatsieRedirectionWidget
