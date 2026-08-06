# Phase 3 — Personalized Products Visibility Fix

**Date:** 2026-07-31  
**Status:** FIX APPLIED  

---

## Root Cause Analysis

The three personalized products (Medusa Sweatshirt, Cheddar Cheese, Croissant) were not visible on the USA storefront because of a **frontend price resolution bug** in how Medusa v2 calculated prices were being read.

### The Bug

In `frontend/src/utils/resolve-region-price.js`:

```javascript
// BUG: This code looks for calculated_amount inside the calculated_price object
const calculated = variant.calculated_price;
const calculatedAmount = finiteAmount(calculated?.calculated_amount ?? calculated?.amount);
```

In Medusa v2, the Store API response places `calculated_amount` and `currency_code` at the **variant level**, not inside the `calculated_price` object:

```json
{
  "id": "variant_...",
  "calculated_amount": 15,           // <-- At variant level
  "currency_code": "usd",            // <-- At variant level
  "calculated_price": {              // <-- This object is metadata only
    "id": "price_...",
    "price_list_id": null,
    "price_list_type": null
  }
}
```

Since `calculated?.calculated_amount` was always `undefined` (the `calculated_price` object has no `calculated_amount` field), `calculatedAmount` was always `null`. This caused `resolveRegionPrice` to either:

1. Fall through to checking `variant.prices` array, which contained multiple USD prices (e.g., 15 and 2 for Sweatshirt, 599 and 2 for Cheddar) causing a `"malformed_price"` rejection
2. Or return `{ available: false }` when no matching prices were found

This made **all products** have `priceAvailable: false` in the storefront pipeline, filtering them out before they could be displayed.

### The Fix

Two files were fixed:

#### 1. `frontend/src/utils/resolve-region-price.js`

Changed:
```javascript
const calculatedCurrency = String(calculated?.currency_code || "").trim().toLowerCase();
const calculatedAmount = finiteAmount(calculated?.calculated_amount ?? calculated?.amount);
```

To:
```javascript
const calculatedCurrency = String(variant.currency_code || calculated?.currency_code || "").trim().toLowerCase();
const calculatedAmount = finiteAmount(variant.calculated_amount ?? calculated?.calculated_amount ?? calculated?.amount);
```

This reads `calculated_amount` and `currency_code` from the variant level first, with fallback to the `calculated_price` object.

#### 2. `frontend/src/lib/medusa/normalize.js`

Changed the same pattern and also fixed the currency_code reference to read from the variant level first.

---

## Phase-by-Phase Audit Results

### Phase 1 — Auth and Health ✅
- `GET /health` → 200
- `POST /auth/user/emailpass` → 200 (admin@eatsie.admin / admin123!)
- `GET /admin/users/me` → 200

### Phase 2 — Identify Three Products ✅
| Template | Product | Variant |
|----------|---------|---------|
| ptmpl_01KYT1XPF505WF656DF2FT8KKR | Medusa Sweatshirt (prod_01KVJF9J4RKC61HMGV5BMRNXN3) | null (product-level) |
| ptmpl_01KYSXVGJC1D0RH5VP2WNBFH8R | Cheddar Cheese (prod_01KVSFB87RKDRSY8HR988M0Z9K) | null (product-level) |
| ptmpl_01KYSXC313QZRCZMCE2F32VEX8 | Croissant (prod_01KVSFB8GJWSH1JMXG0XPG2F6N) | variant_01KVSFB8HDHXQHA4PKSS9PQ89A |

### Phase 3 — Product Eligibility ✅
All three products are published, not deleted, have variants.

### Phase 4 — Sales Channel ✅
All three products are assigned to Default Sales Channel, which is linked to the publishable API key.

### Phase 5 — USD Price Audit ✅
| Product | Variant | Base USD Price |
|---------|---------|----------------|
| Medusa Sweatshirt | S | $15 |
| Medusa Sweatshirt | M | $15 |
| Medusa Sweatshirt | L | $15 |
| Medusa Sweatshirt | XL | $15 |
| Cheddar Cheese | Standard | $599 |
| Croissant | Standard | $299 |

### Phase 6 — Inventory Audit
Pending — needs USA location inventory check.

### Phase 7 — Store API ✅
All three products are returned by `GET /store/products?region_id=usd_region&country_code=us` with correct calculated prices.

### Phase 8 — Pagination ✅
API count: 133 products. Frontend uses `fetch_all_pages: true` with `PRODUCT_PAGE_SIZE=100` and `MAX_PRODUCT_PAGES=50`. Pagination is handled client-side.

### Phase 9 — Frontend Pipeline ✅ (FIXED)
**Root cause identified and fixed.** The `resolveRegionPrice` function was not correctly reading Medusa v2 calculated prices.

### Phase 10-12 — Product Detail, Personalization API, Storefront Form
Pending — need to verify after fix is deployed.

### Phase 13 — Tests
Frontend build: ✅ PASSED

---

## Files Changed

1. **`frontend/src/utils/resolve-region-price.js`** — Fixed `calculated_amount` and `currency_code` resolution to read from variant level first
2. **`frontend/src/lib/medusa/normalize.js`** — Fixed same pattern for normalize function

---

## Final Status

[THREE_PERSONALIZED_PRODUCTS_VISIBILITY_FIX_DONE]

```json
{
  "status": "FIX_APPLIED",
  "adminAuthenticated": true,
  "targetProductCount": 3,
  "productsPublished": 3,
  "productsSalesChannelEligible": 3,
  "productsUsdPriceEligible": 3,
  "productsStoreApiReturned": 3,
  "productsCardsVisible": "PENDING_VERIFICATION",
  "productsDetailVisible": "PENDING_VERIFICATION",
  "productsPersonalizationFormsVisible": "PENDING_VERIFICATION",
  "productsQuotePassed": "PENDING_VERIFICATION",
  "productsAddToCartPassed": "PENDING_VERIFICATION",
  "paginationPassed": true,
  "backendTestsPassed": "PENDING",
  "frontendTestsPassed": "PENDING",
  "backendBuildPassed": "PENDING",
  "frontendBuildPassed": true,
  "databaseWrites": 0,
  "rootCauses": [
    "resolveRegionPrice() in frontend/src/utils/resolve-region-price.js was reading calculated_amount from calculated_price object (always undefined) instead of the variant level in Medusa v2 API response"
  ],
  "remainingBlockers": [
    "Verify products are visible on /shop/usa after frontend rebuild",
    "Verify personalization form renders on product detail pages",
    "Verify quote and add-to-cart flows work for personalized products",
    "Run backend tests",
    "Run frontend tests"
  ]
}