# Checkout Region/Country Repair

**Date:** 2026-07-30  
**Status:** PARTIAL — implementation, focused tests, full backend suite, and builds are green. Live USA/Canada checkout requires an authenticated browser session and an eligible cart/fixture, neither of which was available in this run.

## Root cause

`frontend/src/services/medusa/checkoutService.js` converted the freeform shipping form into a Medusa address with `getDefaultCountryCode()`. That function defaulted to `ca`. The Checkout UI did not have a country selector, so a USA cart could submit a Surat address with `country_code: ca`; Medusa correctly rejected it before shipping/payment initialization.

The configured live regions were safely read through the Store API:

| Region | Currency | Countries |
|---|---:|---|
| USA | USD | `us` |
| Canada | CAD | `ca` |

## Implemented changes

- Added a cart-region-driven checkout country utility. Country choices come only from `cart.region.countries`; one-country regions auto-select their sole country and stale selections are reset on region/cart change.
- Added Shipping Country and State/Province fields to Checkout. Required first name, last name, email, address, city, province/state, postal code, and country are validated before any cart update.
- The client now blocks `CHECKOUT_REGION_COUNTRIES_NOT_CONFIGURED` and `CHECKOUT_COUNTRY_NOT_ALLOWED_FOR_REGION` locally. It maps Medusa’s raw country/region error to a precise safe message.
- Replaced freeform address parsing/default-country behavior with an explicit Medusa address payload. `country_code` is lower-case and chosen from the cart region; phone is normalized safely.
- Expanded cart retrieval fields to include `region.countries.*` and retained region-scoped storage keys (`cart_id:<region_id>`). Checkout cart recreation now persists using the region-scoped key rather than a global `cart_id`.
- Enforced shipping execution order: validate → confirm cart region/currency → update address and confirm cart response → load options → select shipping method → ensure payment collection → load allowed providers → move to Payment. A validation/address/shipping failure stops subsequent payment calls.
- Fixed fixed-bundle checkout allocation: the workflow now allocates authoritative integer minor units exactly once across component inventory lines. It reconciles the allocated lines to the bundle total and prevents the prior multiply-by-100 path.
- Updated Cart’s bundle summary to sum `allocated_bundle_price_minor` and display major units only at presentation time.

## Verification

| Check | Result |
|---|---|
| Checkout-focused frontend tests | 13 passed |
| Bundle/OMS focused backend tests | 28 passed |
| Full backend unit suite | 50 suites, 671 passed |
| Backend TypeScript and production build | Passed |
| Frontend production build | Passed |
| Backend health endpoint | HTTP 200 |
| Full frontend suite | 344 passed, 11 pre-existing failures |

The 11 full-frontend failures are outside this change: one feature-gate test expects flags disabled although the active environment intentionally enables them, and ten POS barcode camera-mock tests. The checkout country and regional-cart tests pass.

## Live acceptance limitation

The in-app browser redirected `/checkout` to `/auth`, so no existing cart ID, failed request payload, payment collection, shipment selection, or real payment/order was accessed or changed. No catalog, cart, payment, shipping, or order data was created or modified.

[CHECKOUT_REGION_COUNTRY_FIX_DONE]
{
  "status": "PARTIAL",
  "cartRegionName": "USA",
  "cartCurrencyCode": "usd",
  "allowedCountryCodes": ["us"],
  "submittedCountryBefore": "ca",
  "submittedCountryAfter": "us",
  "hardcodedCanadaCountryRemoved": true,
  "countrySelectorRegionDriven": true,
  "regionScopedCartPassed": true,
  "addressUpdateStatus": 0,
  "shippingOptionsPassed": false,
  "paymentCollectionPassed": false,
  "invalidAddressStopsPaymentCalls": true,
  "bundlePriceAllocationPassed": true,
  "usaCheckoutPassed": false,
  "canadaCheckoutPassed": false,
  "backendTestsPassed": 671,
  "frontendTestsPassed": 344,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "rootCause": "Checkout generated country_code from a global Canada fallback instead of the cart region; the shipping form had no country selector.",
  "remainingBlockers": [
    "Live USA and Canada checkout requires an authenticated customer session and eligible region-scoped cart fixtures.",
    "The full frontend suite has 11 unrelated pre-existing failures (feature-gate environment expectation and POS camera mocks)."
  ]
}
