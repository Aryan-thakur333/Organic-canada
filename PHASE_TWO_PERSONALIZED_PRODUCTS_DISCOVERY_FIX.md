# Two Personalized Products Storefront Discovery Fix

Date: 2026-07-30  
Backend: MedusaJS `2.13.6`  
USA region: `reg_01KXT623CTGM9NJJYK2G4DQW7E` (`usd`)  
Storefront sales channel: `sc_01KVJF9HK0YY92JES8P7VPZN12`

## Outcome

Both existing Medusa products now pass the complete USA storefront path without duplicate products, frontend product-ID hardcoding, or bypassing publication, channel, price, region, or inventory rules.

The exact disappearance stage for Croissant was the frontend regional-price eligibility filter. Medusa returned the product record, but the variant had no raw USD price and therefore no USA `calculated_price`. The guarded repair used the existing reviewed merchant row (`299` USD), preserved CAD `349`, and added the price through the Medusa Pricing service. The active variant template also had a stored title typo (`Parsonalize Product`), which was corrected to `Personalize Product` through the personalization service.

Cheddar Cheese was already eligible when this phase began because its previously reviewed USD repair was present. The fresh listing contains both products and reports 25 eligible storefront products, so the earlier “24 of 24” state was no longer authoritative after the database repair and cache refresh.

## Phase 1 — Product record audit

```text
[PERSONALIZED_PRODUCTS_RECORD_AUDIT]
{
  "products": [
    {
      "productId": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
      "exists": true,
      "title": "Cheddar Cheese",
      "handle": "cheddar-cheese",
      "status": "published",
      "deleted_at": null,
      "created_at": "2026-06-23T05:30:44.346Z",
      "updated_at": "2026-06-23T05:30:44.346Z",
      "deleted": false,
      "variantIds": ["variant_01KVSFB88CG0FGKBQTG2KNBZE8"],
      "thumbnailPresent": true,
      "imageCount": 1,
      "metadata": {},
      "productType": null,
      "categories": ["Dairy"],
      "collections": [],
      "passed": true
    },
    {
      "productId": "prod_01KVSFB8GJWSH1JMXG0XPG2F6N",
      "exists": true,
      "title": "Croissant",
      "handle": "croissant",
      "status": "published",
      "deleted_at": null,
      "created_at": "2026-06-23T05:30:44.627Z",
      "updated_at": "2026-06-23T05:30:44.627Z",
      "deleted": false,
      "variantIds": ["variant_01KVSFB8HDHXQHA4PKSS9PQ89A"],
      "thumbnailPresent": true,
      "imageCount": 1,
      "metadata": {},
      "productType": null,
      "categories": ["Bakery"],
      "collections": [],
      "passed": true
    }
  ]
}
```

No data was modified during the audit.

## Phase 2 — Sales-channel audit

The frontend publishable token resolves to the following Medusa API key and channel association.

```text
[PERSONALIZED_PRODUCTS_CHANNEL_AUDIT]
{
  "publishableKeyId": "apk_01KVJF9HNRSQJ73SNE403H7RM4",
  "storefrontSalesChannelIds": ["sc_01KVJF9HK0YY92JES8P7VPZN12"],
  "products": [
    {
      "productId": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
      "assignedSalesChannelIds": ["sc_01KVJF9HK0YY92JES8P7VPZN12"],
      "intersection": ["sc_01KVJF9HK0YY92JES8P7VPZN12"],
      "assignedToUsaStorefront": true
    },
    {
      "productId": "prod_01KVSFB8GJWSH1JMXG0XPG2F6N",
      "assignedSalesChannelIds": ["sc_01KVJF9HK0YY92JES8P7VPZN12"],
      "intersection": ["sc_01KVJF9HK0YY92JES8P7VPZN12"],
      "assignedToUsaStorefront": true
    }
  ],
  "passed": true
}
```

No channel write was required.

## Phase 3 — USA price audit and repair

```text
[PERSONALIZED_PRODUCTS_PRICE_AUDIT]
{
  "usaRegionId": "reg_01KXT623CTGM9NJJYK2G4DQW7E",
  "currencyCode": "usd",
  "products": [
    {
      "productId": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
      "variants": [
        {
          "variantId": "variant_01KVSFB88CG0FGKBQTG2KNBZE8",
          "priceSetId": "pset_01KVSFB898SY6YECAC57YKA1WF",
          "usdRawAmount": 599,
          "cadRawAmount": 799,
          "usdCalculatedAmount": 599,
          "calculatedCurrency": "usd",
          "calculationContext": {
            "region_id": "reg_01KXT623CTGM9NJJYK2G4DQW7E",
            "currency_code": "usd"
          },
          "missingPriceReason": null,
          "eligible": true
        }
      ]
    },
    {
      "productId": "prod_01KVSFB8GJWSH1JMXG0XPG2F6N",
      "variants": [
        {
          "variantId": "variant_01KVSFB8HDHXQHA4PKSS9PQ89A",
          "priceSetId": "pset_01KVSFB8J460K39GFGNP4ZHXFZ",
          "usdRawAmountBefore": null,
          "usdRawAmountAfter": 299,
          "cadRawAmountBefore": 349,
          "cadRawAmountAfter": 349,
          "usdCalculatedAmountBefore": null,
          "usdCalculatedAmountAfter": 299,
          "calculatedCurrency": "usd",
          "calculationContext": {
            "region_id": "reg_01KXT623CTGM9NJJYK2G4DQW7E",
            "currency_code": "usd"
          },
          "missingPriceReasonBefore": "RAW_USD_PRICE_MISSING",
          "missingPriceReasonAfter": null,
          "createdPriceId": "price_01KYT0RDDCPDXYRM1WE59V5S5Y",
          "eligible": true
        }
      ]
    }
  ],
  "reviewSource": "backend/reviewed-production-usd-prices.csv",
  "reviewClassification": "PRODUCTION_STOREFRONT",
  "reviewAction": "CREATE",
  "reviewValueSource": "MANUAL_MERCHANT_RATE",
  "dryRunPassed": true,
  "cadPricesPreserved": true,
  "existingUsdPricesOverwritten": false,
  "passed": true
}
```

## Phase 4 — USA inventory audit

Canada levels were not merged into this result. Only the USA location associated with the storefront sales channel is counted.

```text
[PERSONALIZED_PRODUCTS_INVENTORY_AUDIT]
{
  "products": [
    {
      "productId": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
      "variants": [
        {
          "variantId": "variant_01KVSFB88CG0FGKBQTG2KNBZE8",
          "inventoryItemId": "iitem_01KVSFB88NREKKQCY65BK4Z72K",
          "stockLocationId": "sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ",
          "stockLocationName": "USA POS Store",
          "manageInventory": true,
          "stocked": 1000,
          "reserved": 0,
          "available": 1000,
          "sellable": true
        }
      ]
    },
    {
      "productId": "prod_01KVSFB8GJWSH1JMXG0XPG2F6N",
      "variants": [
        {
          "variantId": "variant_01KVSFB8HDHXQHA4PKSS9PQ89A",
          "inventoryItemId": "iitem_01KVSFB8HQ7H2Q6NJS9D1EHDBF",
          "stockLocationId": "sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ",
          "stockLocationName": "USA POS Store",
          "manageInventory": true,
          "stocked": 1000,
          "reserved": 0,
          "available": 1000,
          "sellable": true
        }
      ]
    }
  ],
  "passed": true
}
```

## Phases 5 and 10 — Exact listing API and pagination audit

The frontend uses `fetch_all_pages: true`. Its service requests pages of 100 records, increments the offset by the number returned, stops when `offset >= count`, and deduplicates by product ID.

```text
[PERSONALIZED_PRODUCTS_STORE_API_AUDIT]
{
  "requestUrls": [
    "GET http://localhost:9000/store/products?fields=id,title,handle,description,thumbnail,images.*,variants.*,variants.prices.*,variants.calculated_price.*,categories.*,metadata,type.*&limit=100&offset=0&order=-created_at&region_id=reg_01KXT623CTGM9NJJYK2G4DQW7E&country_code=us",
    "GET http://localhost:9000/store/products?fields=id,title,handle,description,thumbnail,images.*,variants.*,variants.prices.*,variants.calculated_price.*,categories.*,metadata,type.*&limit=100&offset=100&order=-created_at&region_id=reg_01KXT623CTGM9NJJYK2G4DQW7E&country_code=us"
  ],
  "publishableKeyId": "apk_01KVJF9HNRSQJ73SNE403H7RM4",
  "salesChannelIds": ["sc_01KVJF9HK0YY92JES8P7VPZN12"],
  "status": 200,
  "reportedCount": 133,
  "returnedCount": 133,
  "deduplicatedCount": 133,
  "product1Returned": true,
  "product2Returned": true,
  "paginationComplete": true,
  "passed": true
}
```

The UI page size is 24, applied after visibility and regional-price filtering. Live output changed from 24 eligible records to `Showing 1-24 of 25 products`, with page 2 reachable. Both target records appeared on page 1 in the current server order.

## Phase 6 — Product detail API

```text
[
  {
    "productId": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
    "status": 200,
    "title": "Cheddar Cheese",
    "selectedVariantId": "variant_01KVSFB88CG0FGKBQTG2KNBZE8",
    "usdCalculatedAmount": 599,
    "calculatedCurrency": "usd",
    "salesChannelEligible": true,
    "imageCount": 1,
    "usaInventorySellable": true
  },
  {
    "productId": "prod_01KVSFB8GJWSH1JMXG0XPG2F6N",
    "status": 200,
    "title": "Croissant",
    "selectedVariantId": "variant_01KVSFB8HDHXQHA4PKSS9PQ89A",
    "usdCalculatedAmount": 299,
    "calculatedCurrency": "usd",
    "salesChannelEligible": true,
    "imageCount": 1,
    "usaInventorySellable": true
  }
]
```

Normal product retrieval does not depend on whether a personalization template exists.

## Phase 7 — Template eligibility audit

```text
[PERSONALIZATION_TEMPLATE_ELIGIBILITY_AUDIT]
{
  "templates": [
    {
      "templateId": "ptmpl_01KYSXVGJC1D0RH5VP2WNBFH8R",
      "title": "Personal Product",
      "productId": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
      "variantId": null,
      "active": true,
      "productLinkFound": true,
      "variantLinkFound": true,
      "fieldCount": 1,
      "fields": [
        {
          "key": "custom_text",
          "label": "Enter customer name",
          "type": "text",
          "priceAdjustment": 2,
          "valid": true
        }
      ],
      "fieldsValid": true
    },
    {
      "templateId": "ptmpl_01KYSXC313QZRCZMCE2F32VEX8",
      "titleBefore": "Parsonalize Product",
      "titleAfter": "Personalize Product",
      "productId": "prod_01KVSFB8GJWSH1JMXG0XPG2F6N",
      "variantId": "variant_01KVSFB8HDHXQHA4PKSS9PQ89A",
      "active": true,
      "productLinkFound": true,
      "variantLinkFound": true,
      "fieldCount": 1,
      "fields": [
        {
          "key": "field",
          "label": "field",
          "type": "textarea",
          "priceAdjustment": 2,
          "valid": true
        }
      ],
      "fieldsValid": true
    }
  ],
  "passed": true
}
```

The reusable field validator now explicitly rejects blank labels and blank `select`/`radio` options, in addition to enforcing supported types and non-negative integer surcharges.

## Phase 8 — Personalization Store API

```text
{
  "product1": {
    "request": "GET /store/products/prod_01KVSFB87RKDRSY8HR988M0Z9K/personalization",
    "status": 200,
    "enabled": true,
    "templateId": "ptmpl_01KYSXVGJC1D0RH5VP2WNBFH8R",
    "active": true,
    "assignmentScope": "all_variants",
    "fieldCount": 1
  },
  "product2": {
    "request": "GET /store/products/prod_01KVSFB8GJWSH1JMXG0XPG2F6N/personalization?variant_id=variant_01KVSFB8HDHXQHA4PKSS9PQ89A",
    "status": 200,
    "enabled": true,
    "templateId": "ptmpl_01KYSXC313QZRCZMCE2F32VEX8",
    "active": true,
    "assignmentScope": "variant",
    "fieldCount": 1
  },
  "wrongVariant": {
    "request": "GET /store/products/prod_01KVSFB8GJWSH1JMXG0XPG2F6N/personalization?variant_id=variant_wrong",
    "status": 404,
    "result": "PERSONALIZATION_NOT_AVAILABLE"
  },
  "precedence": ["exact product + selected variant", "product-level all variants", "404"],
  "passed": true
}
```

Croissant currently has only one real variant, so a non-linked production variant cannot be selected in the UI. The wrong-variant API returned 404, service tests verify that a variant-only template is not leaked, and the frontend now aborts stale requests, clears old form/quote/surcharge state, and blocks normal add-to-cart while a new variant lookup is pending.

## Phase 9 — Frontend pipeline traces

```text
[PERSONALIZED_PRODUCT_FRONTEND_TRACE]
{
  "productId": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
  "rawApiFound": true,
  "normalizedFound": true,
  "priceEligible": true,
  "visibilityEligible": true,
  "sortedListFound": true,
  "paginatedListFound": true,
  "cardRendered": true,
  "stageWhereLost": "none in current state",
  "rejectionReason": ""
}
```

```text
[PERSONALIZED_PRODUCT_FRONTEND_TRACE]
{
  "productId": "prod_01KVSFB8GJWSH1JMXG0XPG2F6N",
  "rawApiFound": true,
  "normalizedFound": true,
  "priceEligible": true,
  "visibilityEligible": true,
  "sortedListFound": true,
  "paginatedListFound": true,
  "cardRendered": true,
  "stageWhereLost": "before repair: regional-price eligibility filter; after repair: none",
  "rejectionReason": "before repair: calculated_price was null because the raw USD price was missing"
}
```

No filter was weakened. Missing thumbnails do not control visibility, out-of-stock products remain discoverable but cannot be purchased, personalized products stay in the normal product pipeline, and pagination happens after regional visibility filtering.

## Phase 11 — Live USA acceptance

| Check | Cheddar Cheese | Croissant |
|---|---:|---:|
| Card visible in `/shop/usa` | PASS | PASS |
| Card title | Cheddar Cheese | Croissant |
| Card/detail USD price | $599.00 | $299.00 |
| Detail page opens | PASS | PASS |
| Selected variant | `variant_01KVSFB88CG0FGKBQTG2KNBZE8` | `variant_01KVSFB8HDHXQHA4PKSS9PQ89A` |
| `Personalize Your Product` visible | PASS | PASS |
| Fields rendered | `Enter customer name` | `field` textarea |
| Valid input | `Aryan` | `Fresh message` |
| Quote response | base 599 + 2 = 601 USD | base 299 + 2 = 301 USD |
| Personalized add status | `Cheddar Cheese added to cart` | `Croissant added to cart` |
| Customized cart line | `Enter customer name: Aryan` | `field: Fresh message` |

Both acceptance cart lines remain present after verification.

## Phase 12 — Automated verification

```text
Two-product read-only audit: PASS
Guarded repair dry run: PASS
Guarded repair apply/post-verification: PASS
Backend focused personalization tests: 2 suites, 18 tests PASS
Frontend focused visibility/pagination/personalization tests: 3 files, 35 tests PASS
Backend full unit suite: 53 suites, 692 tests PASS
Backend TypeScript: PASS
Frontend TypeScript: PASS
Backend Medusa production build: PASS
Frontend Vite production build: PASS
Backend health during acceptance: HTTP 200
```

## Implemented files

- `backend/src/scripts/audit-two-personalized-products-storefront.ts`: repeatable, read-only product/channel/price/inventory/template audit.
- `backend/src/scripts/repair-second-personalized-product-storefront.ts`: guarded, idempotent reviewed-price and title repair; dry-run by default.
- `backend/src/modules/personalization/utils/field-configuration.ts`: rejects blank labels and invalid blank options.
- `backend/src/modules/personalization/__tests__/personalization-product-ux.unit.spec.ts`: exact-variant precedence, all-variant fallback, wrong-variant isolation, and validation tests.
- `backend/src/modules/personalization/__tests__/personalization-production-contract.unit.spec.ts`: complete field fixture under the stronger label contract.
- `frontend/src/pages/ProductDetails.jsx`: race-safe variant personalization reload and stale-state cleanup.
- `frontend/src/__tests__/personalizationProductUx.test.js`: two-product normalization/visibility and variant reload coverage.

## Database writes

Exactly two writes were performed in this phase:

1. Created USD price `price_01KYT0RDDCPDXYRM1WE59V5S5Y` (`299`) in the existing Croissant variant price set.
2. Corrected template `ptmpl_01KYSXC313QZRCZMCE2F32VEX8` title from `Parsonalize Product` to `Personalize Product`.

No product, variant, inventory level, channel assignment, CAD price, or additional template was created or overwritten.

```text
[TWO_PERSONALIZED_PRODUCTS_DISCOVERY_FIX_DONE]
{
  "status": "PASSED",
  "product1Id": "prod_01KVSFB87RKDRSY8HR988M0Z9K",
  "product2Id": "prod_01KVSFB8GJWSH1JMXG0XPG2F6N",
  "product1Published": true,
  "product2Published": true,
  "product1SalesChannelPassed": true,
  "product2SalesChannelPassed": true,
  "product1UsdPricePassed": true,
  "product2UsdPricePassed": true,
  "product1InventoryPassed": true,
  "product2InventoryPassed": true,
  "storeApiProduct1Returned": true,
  "storeApiProduct2Returned": true,
  "frontendProduct1CardVisible": true,
  "frontendProduct2CardVisible": true,
  "product1PersonalizationFormVisible": true,
  "product2PersonalizationFormVisible": true,
  "product1QuotePassed": true,
  "product2QuotePassed": true,
  "product1AddToCartPassed": true,
  "product2AddToCartPassed": true,
  "paginationPassed": true,
  "backendTestsPassed": 692,
  "frontendTestsPassed": 35,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "databaseWrites": 2,
  "rootCauses": [
    "Croissant had no raw USD price, so its USA calculated price was null and the legitimate regional-price filter rejected it.",
    "The variant-scoped template title was stored as 'Parsonalize Product' instead of 'Personalize Product'.",
    "Variant personalization loading did not previously clear stale quote state or block add-to-cart while a new lookup was pending."
  ],
  "remainingBlockers": []
}
```
