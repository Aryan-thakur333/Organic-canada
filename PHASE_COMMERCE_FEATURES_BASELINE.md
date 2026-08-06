# Commerce Features Baseline

Audit date: 2026-07-30  
Project: `D:\eatsie-project`

## Installed platform

- Medusa packages: `@medusajs/framework`, `@medusajs/medusa`, Admin SDK and CLI `2.13.6`.
- Stripe: `@medusajs/payment-stripe 2.13.6`; Stripe Node `22.1.1`.
- Validation: the installed `@medusajs/framework/zod` export is available and exposes Zod 3-compatible `z`, object, string, enum and related schemas.
- Backend TypeScript: `5.6.2`; storefront TypeScript tooling: `5.9.3`.
- Backend React: `18.3.1`; Vite storefront React: `19.2.5`, Vite `8.0.9`.

## Runtime architecture

The primary checkout is Medusa-native. Region-scoped carts are created through the Store API, payment collections and sessions use Medusa payment providers, and cart completion uses Medusa core flows. Stripe is registered only when `STRIPE_API_KEY` is configured. Cash, Stripe and PayPal providers are conditionally registered. POS uses native cart, payment, completion, capture and fulfillment workflows.

A legacy `payment-server` also exists. It accepts client item prices and supports USD-only standalone orders. It is not suitable as the source of truth for subscriptions, personalization or bundles and will not be used by the new features.

Regional product fetching passes a Medusa region ID. Carts retain region and sales-channel identity, and checkout rejects region/currency mismatch. Regional pricing for USD/CAD is already present. Standard Medusa cart completion supplies the platform's normal reservation/inventory behavior; POS additionally resolves a register stock location and uses Medusa inventory/payment workflows.

Admin extensions live under `backend/src/admin/routes`; storefront services live under `frontend/src/services/medusa`, region state under `frontend/src/contexts/RegionContext.jsx`, and commerce pages under `frontend/src/pages`.

## Existing feature code discovered

Subscription, personalization and bundle modules already exist and are registered, with routes and partial UIs. They are incomplete against the production contract:

- subscriptions mix Stripe Billing Checkout with a second scheduled direct PaymentIntent mechanism;
- no durable subscription-item, billing-period order, or provider-event idempotency records exist;
- subscription prices are plan-centric instead of derived from the selected cart's regional calculated prices;
- personalization lacks the requested quote/upload-security contract and stores an ambiguous dollar-to-minor-unit conversion;
- bundles currently model parent/child products only, not a complete fixed-bundle aggregate/snapshot/reservation contract;
- none of the three features is protected by a common backend/storefront feature flag.

## Commands

- Backend unit tests: `npm test`
- Backend integration tests: `npm run test:integration:http`
- Backend build: `npm run build`
- Backend TypeScript: `npx tsc --noEmit`
- Frontend tests: `npm test`
- Frontend build: `npm run build`
- Migration: `npm run db:migrate`
- Generate Medusa module migrations: `npm exec medusa db:generate <module>` after schema review.

## Baseline results

The immediately preceding clean backend run in this same worktree passed 631/631 unit tests. The full storefront baseline passed 334 tests and retained 10 existing camera-mock failures in `BarcodeScannerModal.test.jsx`. Four existing backend TypeScript errors remain outside these commerce feature paths.

```json
{
  "marker": "[COMMERCE_FEATURE_BASELINE]",
  "medusaVersion": "2.13.6",
  "stripeArchitecture": "Medusa Stripe provider for normal checkout; partial Stripe Billing plus unsafe duplicate scheduled PaymentIntent subscription paths detected",
  "paymentServerDetected": true,
  "regionalPricingDetected": true,
  "regionScopedCartDetected": true,
  "inventoryReservationsDetected": true,
  "customModules": ["subscription", "personalization", "bundle", "pos", "oms", "vendor", "b2b", "digital-asset", "commission", "marketplace", "pricing-management"],
  "customWorkflows": ["trigger-subscription-order", "subscription-billing", "deduct-bundle-inventory", "split-order-workflow", "oms-ingest-order"],
  "backendTestBaseline": 631,
  "frontendTestBaseline": 334,
  "passed": true
}
```

## Pre-migration backup

- Path: `D:\eatsie-project\backups\before-commerce-features-20260730-111515.backup`
- Database: `medusa-backend`
- Size: 846,238 bytes
- Format: PostgreSQL custom archive, verified with `pg_restore --list`
- Created: `2026-07-30T11:15:16.2897516+05:30`

