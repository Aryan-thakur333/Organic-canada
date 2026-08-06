# Multi-Region Storefront Gaps Audit

This document lists the gaps in the frontend codebase that require modification to support multiple regions (specifically CAD and USD) dynamically in the next phase.

---

## 1. Hardcoded Currencies & Region Codes

The frontend currently defaults to or hardcodes **CAD** and the **Canada** region in several locations:

* **Utility Functions**:
  * [frontend/src/utils/productPricing.js](file:///D:/eatsie-project/frontend/src/utils/productPricing.js#L48) — Defaults currency_code fallback to `"cad"`.
  * [frontend/src/utils/pricing.js](file:///D:/eatsie-project/frontend/src/utils/pricing.js#L8) — Hardcodes default currencyCode to `'cad'`.
  * [frontend/src/utils/b2bQuoteNormalize.js](file:///D:/eatsie-project/frontend/src/utils/b2bQuoteNormalize.js#L107) — Defaults currencyCode parameter in `formatMinorCurrency` to `"cad"`.
  * [frontend/src/utils/b2bPricing.js](file:///D:/eatsie-project/frontend/src/utils/b2bPricing.js#L41) — Defaults currencyCode in `formatMoney` to `'cad'`.
  * [frontend/src/lib/medusa/regions.js](file:///D:/eatsie-project/frontend/src/lib/medusa/regions.js#L77) — Hardcodes currency_code fallback to `"cad"`.

* **Pages & Components**:
  * [frontend/src/pages/vendor/Products.jsx](file:///D:/eatsie-project/frontend/src/pages/vendor/Products.jsx#L761) — Label explicitly says "PRICE CAD" and "Extra Price (CAD)".
  * [frontend/src/pages/vendor/Orders.jsx](file:///D:/eatsie-project/frontend/src/pages/vendor/Orders.jsx#L79) — Hardcodes fallback formatting currency to `"CAD"`.
  * [frontend/src/pages/vendor/Earnings.jsx](file:///D:/eatsie-project/frontend/src/pages/vendor/Earnings.jsx#L25) — Fallback currency defaults to `"CAD"`.
  * [frontend/src/pages/pos/POSOrders.jsx](file:///D:/eatsie-project/frontend/src/pages/pos/POSOrders.jsx#L7) — Default formatting currency defaults to `"cad"`.
  * [frontend/src/pages/pos/POSSell.jsx](file:///D:/eatsie-project/frontend/src/pages/pos/POSSell.jsx#L60) — Hardcodes currency_code `"cad"`.
  * [frontend/src/components/pos/POSCart.jsx](file:///D:/eatsie-project/frontend/src/components/pos/POSCart.jsx#L3) — Default currency parameter defaults to `"cad"`.
  * [frontend/src/pages/CustomerSubscriptions.jsx](file:///D:/eatsie-project/frontend/src/pages/CustomerSubscriptions.jsx#L273) — Uses formatting hardcoded to `'en-CA'` and fallback currency `'CAD'`.
  * [frontend/src/pages/B2BQuoteRequest.jsx](file:///D:/eatsie-project/frontend/src/pages/B2BQuoteRequest.jsx#L65) — Currency defaulted to `'CAD'`.
  * [frontend/src/pages/B2BQuotePayment.jsx](file:///D:/eatsie-project/frontend/src/pages/B2BQuotePayment.jsx#L82) — Fallback currency hardcoded to `'cad'`.
  * [frontend/src/pages/B2BProducts.jsx](file:///D:/eatsie-project/frontend/src/pages/B2BProducts.jsx#L111) — Default currency_code initialized to `'cad'`.
  * [frontend/src/pages/B2BDashboard.jsx](file:///D:/eatsie-project/frontend/src/pages/B2BDashboard.jsx#L306) — Variable `currencyCodeString` initialized to `'cad'`.

* **Tests**:
  * [frontend/src/pages/vendor/Orders.test.jsx](file:///D:/eatsie-project/frontend/src/pages/vendor/Orders.test.jsx)
  * [frontend/src/pages/B2BQuotePayment.test.jsx](file:///D:/eatsie-project/frontend/src/pages/B2BQuotePayment.test.jsx)

---

## 2. Dynamic Region Selector

* **Status**: Currently there is **no region selector** component in the header/footer of the storefront. The region is automatically resolved in `frontend/src/lib/medusa/regions.js` by checking `localStorage` or falling back to the first resolved region from `/store/regions`.
* **Action Required**: Create a dynamic `RegionSelector` component to allow users to switch between Canada/CAD and USA/USD.

---

## 3. Cart & Checkout Region Handling

* **Status**: Carts are created with whichever region is default. The frontend does not currently re-initialize or update the active cart region dynamically if a user switches country or region on the storefront.
* **Action Required**: Need a dynamic updateCartRegion function when switching region/currency to prevent mismatching currencies during checkouts. Expose country validation checks in billing/shipping addresses.
