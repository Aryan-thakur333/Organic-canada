# PERSONALIZED_BUNDLE_ARCHITECTURE_AUDIT

## Overview
This document serves as the architecture audit required for Phase 1 of the Personalized and Bundled Products feature implementation in the Eatsie MedusaJS v2 project.

## 1. Core Frameworks
- **Medusa Version:** `2.13.6` (using `@medusajs/framework`, `@medusajs/medusa`, etc.)
- **Frontend Structure:** React `19.2.5` with Vite, Redux Toolkit, React Router DOM, and Tailwind CSS. The API client uses `@medusajs/js-sdk` (`2.13.6`).

## 2. Module Conventions
The backend uses standard Medusa v2 module conventions under `src/modules/*`:
- Modules expose an `index.ts` with `Module()` definitions.
- Services are located in `service.ts` extending `MedusaService`.
- Models are located in `models/`.
- Migrations are in `migrations/`.
- Existing modules: `vendor`, `subscription`, `b2b`, `bundle`, `digital-asset`, `personalization`, `commission`, `marketplace`.

## 3. Route Conventions
Routes follow Medusa API routing patterns inside `src/api/`:
- `/store/*` for storefront operations.
- `/admin/*` for global Medusa admin.
- `/vendor/*` for vendor portal operations.

## 4. Authentication Conventions
Authentication is managed via Medusa's built-in AuthModule using two providers:
- `emailpass`
- `firebase` (custom module `firebase-auth`)
Middleware applies `authenticate("user")`, `authenticate("customer")`, and `authenticateVendor` using standard Medusa session/bearer tokens.

## 5. Vendor Ownership Conventions
Vendor ownership of products is definitively established via `product.metadata.vendor_id`. The application actively filters queries using `query.graph()` or direct checks against `metadata.vendor_id === req.vendor.id`.

## 6. Pricing Mechanism
Pricing is managed by Medusa's standard pricing modules with potential B2B price lists. However, personalized product adjustments and bundled product fixed pricing *must* be calculated entirely server-side. Frontend prices are untrusted.

## 7. Inventory Mechanism
Inventory relies on Medusa's `InventoryItem` and `InventoryLevel`. Vendor stock is managed at designated `StockLocations` tied to the vendor. Validating bundle inventory requires evaluating the component `InventoryItems` recursively against the vendor's stock location.

## 8. Order Creation Flow
Medusa native checkout flow is used: Cart -> Payment -> Complete.
Upon completion, the `marketplace` and `commission` modules split the order into `VendorOrder` and `VendorOrderItem` records. The application enforces historical immutability using specific snapshots.

## 9. Fulfillment Flow
The native Medusa fulfillment system is mapped via `VendorOrder`.
Order lifecycles are custom-managed: `accept`, `processing`, `prepared`, `ready_to_ship`, `shipped`, `delivered`.
For personalization, fulfillment must be blocked until production statuses (`approved`, `ready`) are satisfied.

## 10. Current Bundle Module Status
A module folder `src/modules/bundle` exists. However, its contents need to be audited and expanded in Phase 12 to include specific Version 1 constraints (fixed pricing, same-vendor physical components only). Current implementation appears sparse/preliminary.

## 11. Current Personalization Module Status
The `src/modules/personalization` module is actively implemented with functional models, routing, and a validation/hashing engine. Recent updates in Phase 3 verification established deterministic schema hashing and accurate vendor filtering.

## 12. Multi-Region Status
Multi-region configuration exists and is supported by `src/scripts/audit-multi-region.ts`. Products and pricing must respect the active region and currency during checkout.

## Conclusion
The architecture provides all necessary hooks and modules to seamlessly introduce Personalized Products and Bundles without disrupting existing B2B, Digital, Subscription, or Standard Product flows. Phase 1 is officially complete with this audit.
