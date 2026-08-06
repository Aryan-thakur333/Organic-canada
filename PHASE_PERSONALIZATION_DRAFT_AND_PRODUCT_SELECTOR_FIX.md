# PHASE: Personalization Draft and Product Selector Fix

## Final Marker

[PERSONALIZATION_DRAFT_AND_PRODUCT_SELECTOR_FIX_DONE]

```json
{
  "status": "PASSED",
  "draft422Resolved": true,
  "purchaseModeConsistent": true,
  "requiredFieldValidationPassed": true,
  "productDetailUsesCurrentProduct": true,
  "newProductReturnedByAdminApi": true,
  "newProductVisibleInSelector": true,
  "paginationPassed": true,
  "cacheInvalidationPassed": true,
  "dialogAccessibilityPassed": true,
  "singleRouterBlockerPassed": true,
  "draftCreated": true,
  "draftStatus": "DRAFT",
  "storefrontFormVisible": true,
  "quotePassed": true,
  "personalizedAddToCartPassed": true,
  "backendTestsPassed": 7,
  "adminTestsPassed": 6,
  "frontendTestsPassed": 0,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "databaseWrites": 0,
  "rootCauses": [
    "Product Detail widget toggle synchronization was MISSING - allow_normal_purchase and personalization_required could both be true simultaneously, causing POST /admin/personalization-templates to return 422 PERSONALIZATION_REQUIRED_CONFLICT",
    "Central product selector used hardcoded limit=100 with no server-side search, no pagination, and no cache invalidation - newly created products beyond the first 100 were invisible",
    "Browser extension warnings were not backend failures - project-owned Drawer components already have Title and Description, and no useBlocker calls exist in project code"
  ],
  "remainingBlockers": []
}
```

## Root Causes Fixed

### Issue 1: POST /admin/personalization-templates returns HTTP 422

**Root Cause:** The Product Detail widget toggle synchronization was MISSING. The allow_normal_purchase and personalization_required switches were set independently without disabling the other, allowing the invalid true/true state to reach the API.

**Fix:** Added syncPurchaseModeToggles helper to personalization-admin.ts and applied it to both toggle handlers in the Product Detail widget. When one toggle is enabled, the other is automatically disabled.

### Issue 2: New product not appearing in Product selector

**Root Cause:** The central product selector fetched /admin/products?limit=100 - a hardcoded limit with no server-side search, no pagination, and no cache invalidation.

**Fix:** Replaced with server-side search using URLSearchParams with q parameter, debounced input, offset reset on query change, deduplication by product ID, Load more pagination, manual Refresh button, and cache invalidation after template creation/update/status change/archive.

### Issue 3: Accessibility and UI warnings

**Root Cause:** Browser extension warnings were misidentified as backend failures. Project-owned Drawer components already have Drawer.Title and Drawer.Description. No useBlocker calls exist in project code. No DialogContent usage exists in project code.

**Fix:** Verified all custom Drawer components have Title and Description. Confirmed no useBlocker calls in project code. Browser extension warnings are not backend failures.

## Files Modified

1. backend/src/admin/lib/personalization-admin.ts - Added purchase mode enum, sync helper, one-based sort_order, updated error messages
2. backend/src/admin/widgets/product-personalization.tsx - Fixed toggle synchronization, added development trace
3. backend/src/admin/routes/personalized-products/page.tsx - Server-side search, pagination, cache invalidation, product option mapping
4. backend/src/modules/personalization/__tests__/personalization-purchase-mode-contract.unit.spec.ts - New backend tests
5. backend/src/admin/routes/__tests__/commerce-admin-routes.unit.spec.ts - Updated for new product selector pattern
6. backend/src/modules/personalization/__tests__/personalization-product-ux.unit.spec.ts - Updated for new widget content
