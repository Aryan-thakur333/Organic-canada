# Phase A — Subscriptions Implementation

Date: 2026-07-30  
Status: **PARTIAL — implementation and migration passed; live Stripe test-mode checkout unavailable because the runtime has no Stripe secret configured. Feature remains disabled.**

## Delivered

- Written business and payment contracts.
- Stripe Billing selected as the sole recurring charge owner.
- Removed direct scheduled PaymentIntent charging and direct renewal-order generation.
- Added subscription item snapshots, product eligibility configuration, billing-period order ledger, and provider-event ledger.
- Added customer/cart creation idempotency, provider-subscription uniqueness, provider-event uniqueness, and `(subscription, billing period)` uniqueness.
- Creation accepts only `{ cart_id, interval, interval_count, idempotency_key }`; customer, region, currency, item prices, adjustments and addresses come from authenticated Medusa state.
- Mixed one-time/subscription, personalized subscription and bundle subscription carts are rejected.
- Verified `invoice.paid` is the sole order-generation trigger; failed invoices create no successful order.
- Added customer list/detail/pause/resume/cancel/quantity/address APIs with ownership and legal-transition checks.
- Added Admin product/variant eligibility APIs and Admin UI.
- Added storefront eligibility lookup, eligible product selection, subscription-only checkout redirection, customer account management, and rollout gates.
- Feature flags default false in backend and storefront.

## Migration

Backup: `D:\eatsie-project\backups\before-commerce-features-20260730-111515.backup` (custom PostgreSQL format, verified, 846,238 bytes).

Applied migration: `Migration20260730000001`.

Verified tables:

- `subscription_item`
- `subscription_billing_order` (the internal name avoids collision with the existing `subscription-order` module link)
- `subscription_provider_event`
- `subscription_product_configuration`

Verified indexes:

- `UIDX_subscription_customer_idempotency`
- `UIDX_subscription_provider_subscription`
- `UIDX_subscription_order_period`
- `UIDX_subscription_provider_event`

## Verification

- Subscription/backend focused tests: 33 passed.
- Storefront rollout/checkout tests: 6 passed.
- Storefront production build: passed.
- Backend TypeScript introduced no new errors; four unrelated baseline errors remain.
- PostgreSQL migration and index verification: passed.

## Remaining acceptance gate

The local runtime explicitly reports Stripe disabled because `STRIPE_API_KEY` is absent. No credential was invented or hardcoded. Consequently, a real Stripe test Checkout session, signed remote webhook delivery, initial paid invoice/order, and provider pause/resume/cancel round-trip cannot honestly be marked passed. `FEATURE_SUBSCRIPTIONS` and `VITE_FEATURE_SUBSCRIPTIONS` remain false.

```json
{
  "marker": "[PHASE_A_SUBSCRIPTIONS_IMPLEMENTATION]",
  "status": "PARTIAL",
  "moduleImplemented": true,
  "migrationPassed": true,
  "paymentArchitectureVerified": true,
  "idempotencySchemaPassed": true,
  "customerApisImplemented": true,
  "adminUiImplemented": true,
  "storefrontUiImplemented": true,
  "frontendBuildPassed": true,
  "focusedBackendTestsPassed": 33,
  "focusedFrontendTestsPassed": 6,
  "liveStripeCheckoutPassed": false,
  "featureEnabled": false,
  "databaseWrites": 1,
  "remainingBlockers": ["Stripe test secret and signed webhook delivery are not configured in the runtime"]
}
```

