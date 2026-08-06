# Regional Storefront Pricing

The storefront supports two public shop routes:

- `/shop/usa` -> Medusa region `reg_01KXT623CTGM9NJJYK2G4DQW7E`, country `us`, currency `usd`
- `/shop/canada` -> Medusa region `reg_01KVJF9HSCYKAZC677GH1AC6C8`, country `ca`, currency `cad`

`/shop` redirects to `/shop/usa`. Region slugs are resolved in `src/lib/medusa/regionSlugs.js` and exposed through `RegionContext`.

Product listing and product detail calls must pass all three Store API params:

- `region_id`
- `currency_code`
- `country_code`

Prices must come from Medusa `variant.calculated_price`. Do not read raw variant price arrays as a storefront fallback, because that can show stale or cross-region prices.

Carts are stored by mode and region, for example `cart_id:reg_...`. The legacy global `cart_id` must not override a region-scoped cart. Checkout validates the cart region and currency before shipping, payment session creation, and final payment handoff.
