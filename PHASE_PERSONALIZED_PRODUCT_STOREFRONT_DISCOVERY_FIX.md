# Personalized Product Storefront Discovery Fix

Date: 2026-07-30  
Target product: `prod_01KVSFB87RKDRSY8HR988M0Z9K` (`Cheddar Cheese`)  
Target template: `ptmpl_01KYSXVGJC1D0RH5VP2WNBFH8R` (`Personal Product`)

## Outcome

The product now passes the full USA storefront path: Medusa product record, publication and sales-channel eligibility, USD regional price calculation, USA inventory, Store API retrieval, frontend normalization/filtering, product card rendering, detail-page personalization, quote calculation, personalized add-to-cart, and customized cart-line rendering.

The primary discovery failure was a missing USD price on the product's only variant. The Store API returned the record for the USA region, but its `calculated_price` was `null`; the frontend's legitimate regional-price eligibility filter consequently removed it. A reviewed, product-specific USD price was added to the existing price set. No product was duplicated, no frontend ID was hardcoded, and neither channel nor region checks were bypassed.

Two response/runtime defects exposed by the live acceptance pass were also corrected:

- The personalization price loader now includes the region's authoritative `currency_code` in Medusa's pricing context.
- The frontend now supports the API client's unwrapped quote, upload, and cart response shapes.

## Product record audit

```text
[PERSONALIZED_PRODUCT_RECORD_AUDIT]
{
  "productId": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
  "exists": true,
  "title": "Cheddar Cheese",
  "status": "published",
  "handle": "cheddar-cheese",
  "deleted": false,
  "variantCount": 1,
  "variantId": "variant_01KVSFB88CG0FGKBQTG2KNBZE8",
  "thumbnailPresent": true,
  "imageCount": 1,
  "categories": ["Dairy"],
  "templateId": "ptmpl_01KYSXVGJC1D0RH5VP2WNBFH8R",
  "templateTitle": "Personal Product",
  "templateVariantId": null,
  "templateAssignmentScope": "all_variants",
  "templateFieldCount": 1,
  "templateActive": true,
  "passed": true
}
```

## Publication and sales-channel audit

```text
[PERSONALIZED_PRODUCT_CHANNEL_AUDIT]
{
  "publishableKeyId": "apk_01KVJF9HNRSQJ73SNE403H7RM4",
  "publishableKeySalesChannelId": "sc_01KVJF9HK0YY92JES8P7VPZN12",
  "storefrontSalesChannelId": "sc_01KVJF9HK0YY92JES8P7VPZN12",
  "productSalesChannelIds": ["sc_01KVJF9HK0YY92JES8P7VPZN12"],
  "published": true,
  "assigned": true,
  "passed": true
}
```

## Regional price audit

The existing CAD price was preserved. The repair used the exact reviewed row in `backend/reviewed-production-usd-prices.csv` and performed one database write against the existing price set.

```text
[PERSONALIZED_PRODUCT_PRICE_AUDIT]
{
  "variantId": "variant_01KVSFB88CG0FGKBQTG2KNBZE8",
  "priceSetId": "pset_01KVSFB898SY6YECAC57YKA1WF",
  "before": {
    "rawCadAmounts": [799],
    "calculatedCadAmount": 799,
    "rawUsdAmounts": [],
    "calculatedUsdAmount": null,
    "usaPricePassed": false,
    "canadaPricePassed": true
  },
  "repair": {
    "source": "reviewed-production-usd-prices.csv",
    "classification": "PRODUCTION_STOREFRONT",
    "action": "CREATE",
    "priceId": "price_01KYSYE3TMQ8MRVN1R9H3F2YFY",
    "currencyCode": "usd",
    "amount": 599,
    "writesPerformed": 1
  },
  "after": {
    "rawCadAmounts": [799],
    "calculatedCadAmount": 799,
    "rawUsdAmounts": [599],
    "calculatedUsdAmount": 599,
    "calculatedUsdCurrency": "usd",
    "usaPricePassed": true,
    "canadaPricePassed": true,
    "cadPricePreserved": true
  },
  "passed": true
}
```

## Inventory audit

```text
[PERSONALIZED_PRODUCT_INVENTORY_AUDIT]
{
  "inventoryItemId": "iitem_01KVSFB88NREKKQCY65BK4Z72K",
  "manageInventory": true,
  "allowBackorder": false,
  "levels": [
    {
      "location": "Canada warehouse",
      "locationId": "sloc_01KVJF9HWWJ38MPAFDGH5YB0W1",
      "stockedQuantity": 1000,
      "reservedQuantity": 0,
      "availableQuantity": 1000
    },
    {
      "location": "USA POS Store",
      "locationId": "sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ",
      "countryCode": "us",
      "salesChannelLinked": true,
      "stockedQuantity": 1000,
      "reservedQuantity": 0,
      "availableQuantity": 1000,
      "sellable": true
    },
    {
      "location": "Organic Canada vendor warehouse",
      "locationId": "sloc_01KXK9547YCY2FE637VTCFG7SZ",
      "stockedQuantity": 1000
    }
  ],
  "usaInventoryAvailable": true,
  "passed": true
}
```

## Store API audit

The product was queried through the normal Store API with the configured publishable key, USA region, and `country_code=us`.

```text
[PERSONALIZED_PRODUCT_STORE_API_AUDIT]
{
  "listStatus": 200,
  "listProductReturned": true,
  "listProductCount": 133,
  "listVariantId": "variant_01KVSFB88CG0FGKBQTG2KNBZE8",
  "listCalculatedAmount": 599,
  "listCalculatedCurrency": "usd",
  "detailStatus": 200,
  "detailProductReturned": true,
  "detailVariantId": "variant_01KVSFB88CG0FGKBQTG2KNBZE8",
  "detailCalculatedAmount": 599,
  "detailCalculatedCurrency": "usd",
  "personalizationStatus": 200,
  "personalizationEnabled": true,
  "templateActive": true,
  "assignmentScope": "all_variants",
  "fieldCount": 1,
  "requiredFieldKey": "custom_text",
  "passed": true
}
```

## Frontend pipeline audit

```text
[PERSONALIZED_PRODUCT_FRONTEND_PIPELINE_AUDIT]
{
  "apiProductFound": true,
  "normalizedProductFound": true,
  "filteredProductFound": true,
  "cardRendered": true,
  "detailRendered": true,
  "personalizationFormRendered": true,
  "stageWhereLost": "BEFORE_FIX: regional-price eligibility filter; AFTER_FIX: none",
  "filterReason": "Missing USD calculated price before repair",
  "hardcodedProductId": false,
  "channelBypassed": false,
  "regionBypassed": false,
  "passed": true
}
```

## Live acceptance evidence

- `/shop/usa` rendered the `Cheddar Cheese` product card and image.
- The product detail URL rendered the product and the active `Personal Product` form.
- The required `Enter customer name` field accepted `Aryan`.
- The quote endpoint returned HTTP 200 with base `599`, personalization adjustment `2`, final `601`, and currency `usd`.
- The quote enabled `Add Personalized Product`.
- Adding returned `Cheddar Cheese added to cart`.
- The cart rendered a customized line showing `Personalization` and `Enter customer name: Aryan`.

## Implemented files

- `backend/src/scripts/audit-personalized-product-storefront.ts`: read-only, repeatable record/channel/price/inventory audit.
- `backend/src/scripts/repair-personalized-product-storefront.ts`: guarded, idempotent, exact-product USD price repair with dry-run default.
- `backend/src/api/store/products/[id]/personalization/route.ts`: exposes active status and assignment scope.
- `backend/src/modules/personalization/utils/pricing.ts`: supplies authoritative region currency to Medusa price calculation.
- `frontend/src/pages/ProductDetails.jsx`: handles unwrapped personalization quote and upload responses.
- `frontend/src/hooks/useMedusaCart.js`: handles unwrapped refreshed-cart responses and rejects malformed success payloads.
- Focused backend and frontend tests cover the repaired contracts and discovery pipeline.

## Verification

```text
Backend TypeScript: PASS
Focused backend tests: 2 suites, 9 tests PASS
Focused frontend tests: 1 file, 4 tests PASS
Full backend unit tests: 53 suites, 688 tests PASS
Backend Medusa production build: PASS
Frontend production build: PASS
Backend health during live validation: HTTP 200
```

```text
[PERSONALIZED_PRODUCT_STOREFRONT_DISCOVERY_FIX_DONE]
{
  "status": "PASSED",
  "productId": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
  "variantId": "variant_01KVSFB88CG0FGKBQTG2KNBZE8",
  "templateId": "ptmpl_01KYSXVGJC1D0RH5VP2WNBFH8R",
  "rootCause": "The variant had no USD price, so its USA calculated_price was null and the frontend regional-price eligibility filter correctly removed it.",
  "productRecordValid": true,
  "published": true,
  "salesChannelAssigned": true,
  "usaPriceValid": true,
  "usaInventoryAvailable": true,
  "storeApiListPassed": true,
  "storeApiDetailPassed": true,
  "frontendNormalizationPassed": true,
  "frontendFilterPassed": true,
  "productCardRendered": true,
  "detailPageRendered": true,
  "templateActive": true,
  "templateAppliesToAllVariants": true,
  "personalizationFormRendered": true,
  "quotePassed": true,
  "personalizedAddToCartPassed": true,
  "customizedCartLineRendered": true,
  "hardcodingAdded": false,
  "duplicateProductCreated": false,
  "channelOrRegionBypassed": false,
  "backendTypeScriptPassed": true,
  "focusedBackendTestsPassed": 9,
  "focusedFrontendTestsPassed": 4,
  "fullBackendTestsPassed": 688,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "healthStatus": 200,
  "blockers": []
}
```
