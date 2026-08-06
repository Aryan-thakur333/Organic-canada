# Commerce Features — Actual Runtime Implementation

Date: 2026-07-30  
Status: **PARTIAL**

## Runtime audit

`FEATURE_SUBSCRIPTIONS`, `FEATURE_PERSONALIZED_PRODUCTS`, and `FEATURE_BUNDLED_PRODUCTS` are now explicitly `true` in `backend/.env`. Their matching `VITE_` flags are explicitly `true` in `frontend/.env`. Both local applications were rebuilt/restarted and return HTTP 200 from their health/root checks.

The live backend confirms the feature gates are active: unauthenticated requests to `/admin/subscriptions`, `/admin/personalization-templates`, and `/admin/bundles` return **401**, not a feature-disabled 404. The compiled Admin asset includes all three route labels.

[COMMERCE_FEATURE_RUNTIME_AUDIT]

```json
{
  "subscriptions": {
    "moduleExists": true,
    "moduleRegistered": true,
    "migrationExists": true,
    "migrationApplied": true,
    "adminRouteExists": true,
    "adminRouteReachable": true,
    "storeApiExists": true,
    "adminApiExists": true,
    "storefrontUiExists": true,
    "backendFlag": "FEATURE_SUBSCRIPTIONS=true",
    "frontendFlag": "VITE_FEATURE_SUBSCRIPTIONS=true",
    "runtimeEnabled": true
  },
  "personalization": {
    "moduleExists": true,
    "moduleRegistered": true,
    "migrationExists": true,
    "migrationApplied": true,
    "adminRouteExists": true,
    "adminRouteReachable": true,
    "storeApiExists": true,
    "adminApiExists": true,
    "storefrontUiExists": true,
    "backendFlag": "FEATURE_PERSONALIZED_PRODUCTS=true",
    "frontendFlag": "VITE_FEATURE_PERSONALIZED_PRODUCTS=true",
    "runtimeEnabled": true
  },
  "bundles": {
    "moduleExists": true,
    "moduleRegistered": true,
    "migrationExists": true,
    "migrationApplied": true,
    "adminRouteExists": true,
    "adminRouteReachable": true,
    "storeApiExists": true,
    "adminApiExists": true,
    "storefrontUiExists": true,
    "backendFlag": "FEATURE_BUNDLED_PRODUCTS=true",
    "frontendFlag": "VITE_FEATURE_BUNDLED_PRODUCTS=true",
    "runtimeEnabled": true
  },
  "passed": false
}
```

## Actual fix

The codebase already contained the modules, migrations, store APIs and most storefront/UI logic. The missing live integration was in the Admin extension registrations:

- `subscriptions/page.tsx` deliberately had its route configuration removed.
- `bundles/page.tsx` had no route configuration.
- There was no `personalized-products` Admin page.

This change adds `defineRouteConfig` registrations with the exact sidebar labels **Subscriptions**, **Personalized Products**, and **Bundled Products**. It also adds an Admin personalized-template page and a server-authoritative `POST /admin/personalization-templates` implementation. That API verifies product existence, validates every field/surcharge, rejects duplicate field keys, creates inactive templates, and never accepts calculated pricing from the browser.

[COMMERCE_FEATURE_FLAGS]

```json
{
  "subscriptionBackendFlag": "FEATURE_SUBSCRIPTIONS=true",
  "subscriptionFrontendFlag": "VITE_FEATURE_SUBSCRIPTIONS=true",
  "subscriptionEnabled": true,
  "personalizationEnabled": true,
  "bundlesEnabled": true
}
```

[COMMERCE_ADMIN_RUNTIME_ACCEPTANCE]

```json
{
  "subscriptionsMenuVisible": false,
  "subscriptionsPageLoads": false,
  "personalizedProductsMenuVisible": false,
  "personalizedProductsPageLoads": false,
  "bundledProductsMenuVisible": false,
  "bundledProductsPageLoads": false,
  "passed": false
}
```

Those six browser values are deliberately false: the current browser has no authenticated Medusa Admin session and therefore reaches `/app/login`. This is an authentication prerequisite, not a route failure. API reachability and compiled-route checks are recorded above; no sidebar visibility is claimed without an authenticated browser.

[COMMERCE_STOREFRONT_RUNTIME_ACCEPTANCE]

```json
{
  "subscriptionSelectorVisible": false,
  "customerSubscriptionsVisible": false,
  "personalizationFormVisible": false,
  "personalizedCartLineVisible": false,
  "bundleProductVisible": false,
  "bundleComponentsVisible": false,
  "bundleCartLineVisible": false,
  "passed": false
}
```

The storefront is live and feature flags are active. No eligible subscription, personalized, or bundle product fixture was created because the request forbids hardcoded products/IDs and no approved product/region fixture was supplied. Therefore the selector/form/bundle visuals cannot be honestly asserted from the current catalog.

## Verification

| Check | Result |
|---|---|
| Backend unit tests | 666 passed, 0 failed (49 suites) |
| Frontend tests | 340 passed, 10 failed (pre-existing `BarcodeScannerModal` camera-mock failures) |
| Backend production build | Passed |
| Frontend production build | Passed |
| Backend TypeScript | Passed |
| Frontend TypeScript | Passed |
| Focused Admin extension tests | 4 passed |
| Existing database migrations | Previously applied and current runtime loads modules |
| Current runtime routes | Enabled; Admin routes return authenticated 401 as expected |

[COMMERCE_FEATURES_ACTUAL_RUNTIME_IMPLEMENTATION_DONE]

```json
{
  "status": "PARTIAL",
  "subscriptionsModuleExists": true,
  "subscriptionsModuleRegistered": true,
  "subscriptionsMigrationApplied": true,
  "subscriptionsAdminMenuVisible": false,
  "subscriptionsAdminPageLoads": false,
  "subscriptionsStorefrontVisible": false,
  "subscriptionsLiveFlowPassed": false,
  "personalizationModuleExists": true,
  "personalizationModuleRegistered": true,
  "personalizationMigrationApplied": true,
  "personalizedProductsAdminMenuVisible": false,
  "personalizedProductsAdminPageLoads": false,
  "personalizationStorefrontVisible": false,
  "personalizationCartPassed": false,
  "personalizationOrderSnapshotPassed": true,
  "bundleModuleExists": true,
  "bundleModuleRegistered": true,
  "bundleMigrationApplied": true,
  "bundledProductsAdminMenuVisible": false,
  "bundledProductsAdminPageLoads": false,
  "bundleStorefrontVisible": false,
  "bundleAvailabilityPassed": true,
  "bundleCheckoutPassed": false,
  "usaPricingPassed": false,
  "canadaPricingPassed": false,
  "usaInventoryIsolationPassed": false,
  "canadaInventoryIsolationPassed": false,
  "normalProductRegressionPassed": true,
  "posRegressionPassed": false,
  "backendTestsPassed": 666,
  "backendTestsFailed": 0,
  "frontendTestsPassed": 340,
  "frontendTestsFailed": 10,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "backendTypescriptPassed": true,
  "frontendTypescriptPassed": true,
  "databaseWrites": 0,
  "migrationsApplied": [
    "subscription/Migration20260730000001",
    "personalization/Migration20260716000000",
    "personalization/Migration20260730000002",
    "personalization/Migration20260730000004",
    "bundle/Migration20260730000003"
  ],
  "rootCause": "Feature flags were unset; the subscription sidebar registration had been removed, bundles had no sidebar registration, and personalized products had no Admin extension route.",
  "remainingBlockers": [
    "Sign in to Medusa Admin in the current browser to verify the three visible sidebar entries and loaded pages.",
    "Approved eligible subscription, personalized and bundle fixtures are needed for live USA/CAD storefront/cart/order acceptance.",
    "Live Stripe Billing verification requires configured provider credentials and webhook acceptance.",
    "Ten pre-existing POS BarcodeScannerModal camera-mock tests remain failing."
  ]
}
```
