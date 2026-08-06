# Storefront Regional Pricing Final Implementation Report

## Root Cause

`Listing.jsx` passed `limit: 100`, overriding the product service's intended
bounded candidate request. Older products could therefore be excluded before
storefront visibility and strict regional-price filtering.

## Implementation

- Added one shared `STOREFRONT_PRODUCT_CANDIDATE_LIMIT` of `200` and a shared
  page size of `24`.
- Added `getStorefrontProductState` for public visibility, exact regional price,
  inventory availability, and purchase eligibility.
- Wired Listing, Search, Wishlist, Product Card, Quick View, and product detail
  to the strict regional pricing path. No CAD/USD fallback or product-price
  scaling was added.
- Added client pagination after filtering, with page reset and clamping when
  regional data or filters change.
- Search now forwards its abort signal, uses the common candidate limit, and
  opens the same regional Quick View as Listing.
- Wishlist refreshes its saved product IDs through the Store API for the active
  region before presenting prices. Its live UI route is authentication-gated.
- Product detail now cancels region-changing requests safely and keeps regional
  diagnostics behind the opt-in debug flag.
- Cart additions pass the resolved currency and reject a cart whose currency
  does not match the active storefront region. Existing per-region cart storage
  remains in place.

## Live Verification

Using the local Vite storefront at `http://localhost:5174`:

- USA Listing: Chocolate `$16.99`, Organic OIL `$18.99`, Organic Apples `$3.99`.
- Canada Listing: Chocolate `$22.00`, Organic OIL `$25.00`, Organic Apples
  `$4.99` through its listing filter; pagination was visible (`Page 1 of 4`).
- USA Search: Organic Apples `$3.99`; test product names were absent.
- Canada Search: Organic Apples `$4.99`.
- USA Quick View: Organic Apples `$3.99`.
- Canada Quick View: Organic Apples `$4.99`.
- USA Product Detail: Organic Apples `$3.99`.
- Canada Product Detail: Organic Apples `$4.99`.
- Browser console for the checked storefront tab contained no errors or warnings.

The browser session redirected `/wishlist` to the account gateway, so the
authenticated wishlist UI and live cart mutation flow were not exercised.

## Verification

- Focused frontend suite: 46 tests passed after all frontend changes.
- Production build: passed after all changes.
- Live product-price writes: `0`.
- Catalog writes: `0`.
- Pricing apply, rollback, and catalog-cleanup apply commands: not executed.

## Files Added

- `frontend/src/constants/storefront-products.js`
- `frontend/src/utils/storefront-product-state.js`
- `frontend/src/__tests__/storefrontRegionalSurfaces.test.js`

## Files Updated

- `frontend/src/services/medusa/productService.js`
- `frontend/src/services/api.js`
- `frontend/src/pages/Listing.jsx`
- `frontend/src/pages/Search.jsx`
- `frontend/src/pages/Wishlist.jsx`
- `frontend/src/pages/ProductDetails.jsx`
- `frontend/src/components/ProductCard.jsx`
- `frontend/src/components/QuickViewModal.jsx`
- `frontend/src/hooks/useMedusaCart.js`

## Remaining Limitations

- Authenticated wishlist and cart mutation verification require a customer test
  session. The implementation blocks unavailable prices and cart currency
  mismatches, but those two interactions were not submitted during this run.
- Suspicious catalog amounts are still displayed as their stored major-unit
  values. They remain merchant data-review items and were not normalized.

## Authenticated Runtime Follow-up

- A normal local storefront customer registration was used. Credentials, tokens,
  cookies, IDs, and personal data are intentionally omitted.
- The protected wishlist was reachable after registration and after a hard reload.
  The original failure was a Strict Mode startup race: the first consumer's abort
  signal cancelled the shared `GET /store/customers/me` restoration request.
  The shared transport now outlives an individual caller while each caller can
  still cancel its own wait.
- USA wishlist result: Organic Apples displayed `$3.99`.
- USA -> Canada -> USA wishlist result: `$3.99 -> $4.99 -> $3.99`.
- Wishlist persistence was verified with a reload. The current active region is
  always re-resolved from Store API data rather than from a saved formatted price.
- A previously hidden Wishlist error (`resolveMedusaImageUrl` missing) was fixed.
- Canada cart creation succeeded, but Medusa rejected the Organic Apples line
  item with `Some variant does not have the required inventory`. No inventory,
  catalog, price, or checkout data was modified to force the test through.
- Therefore, authenticated cart line-item, Canada/USA cart switching, and
  cart-currency live assertions remain blocked by inventory data.
- Sanitized capture notes: `frontend/reports/regional-runtime-captures/README.md`.
- Focused frontend suite: 55 tests passed after the authentication fix.
- Production build: passed after all changes.

## Inventory Follow-up

- Organic Apples cart rejection was diagnosed as `ZERO_AVAILABLE_QUANTITY`.
- The variant has an inventory item link and a Canada warehouse inventory level;
  that level is `0 stocked`, `0 reserved`, and `0 available`.
- Chocolate and Organic OIL have positive inventory levels and are candidates for
  later cart verification, subject to a separate authenticated run.
- A dry-run-only remediation script and merchant approval CSV were created. The
  dry run made zero writes and refuses to invent a quantity.
- No inventory apply was executed.
# Catalog Pagination Follow-up (2026-07-22)

- Added one shared storefront listing pipeline: visibility -> strict regional price -> active filters -> copied-array sort -> bounded pagination.
- Added numbered accessible pagination and a truthful `Showing X-Y of N products` range.
- Read-only Store API visibility reports confirm 132 raw candidates per region, 15 final USA-eligible products, and 78 final Canada-eligible products. Products without exact regional prices remain excluded without cross-currency fallback.
- Price writes: 0. Catalog writes: 0.
