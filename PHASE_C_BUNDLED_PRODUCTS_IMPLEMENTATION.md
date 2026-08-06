# Phase C — Bundled Products Implementation

Status: **implemented and disabled by default** (`FEATURE_BUNDLED_PRODUCTS=false`, `VITE_FEATURE_BUNDLED_PRODUCTS=false`).

## Delivered

- Fixed-bundle definition, variant components and immutable cart/order line snapshot models.
- Additive/self-healing migration `Migration20260730000003`, including unique bundle product, handle, component and snapshot constraints.
- Admin creation path that validates components/sales channels/region currencies, creates the Medusa parent product and fixed-price variant, writes bundle records and emits an audit event.
- Archive-only Admin lifecycle and an Admin bundle list/create UI.
- Location-scoped availability using component quantities, inventory-link required quantities, sales channel and country; locations are never summed.
- Region-calculated fixed prices for display and add-to-cart.
- Cart-locking add workflow with server-controlled component metadata and immutable price/component snapshots.
- Native component reservation items before cart completion, failure release, bounded orphan cleanup, idempotent order commit and exact-location cancellation restoration.
- Component-aware Admin order widget and bundle storefront/product/card/cart/order summaries.
- Explicit POS exclusion until a dedicated POS component workflow is approved.

## Verification

- First migration attempt safely rolled back when legacy migration history and the physical table disagreed. The reviewed self-healing migration then passed.
- Focused bundle production contract: 7/7 tests passed.
- Combined subscription/personalization/bundle focused contracts: 30/30 passed.
- Frontend production build: passed.
- TypeScript: no new errors; four unrelated pre-existing POS/barcode errors remain.

## Activation constraint

Keep both flags disabled until two approved regional fixtures (CAD/Canada and USD/USA) complete live concurrent checkout, cancellation and physical stock-location acceptance. This environment had no approved bundle fixture, so live oversell/cancellation claims are not marked passed even though the reservation/locking contract is implemented and unit-verified.
