# Subscription Business Rules

## Scope

The first release supports authenticated customer subscriptions containing subscription-eligible variants only. A subscription checkout cannot contain one-time, personalized or bundle lines. Supported intervals are `WEEK`, `MONTH`, `QUARTER`, and `YEAR`; `interval_count` must be a positive bounded integer.

Statuses are `DRAFT`, `ACTIVE`, `PAUSED`, `PAST_DUE`, `CANCELLED`, and `EXPIRED`.

## Source of truth

- Medusa owns customer, catalog, regional calculated price, cart, sales-channel, order and inventory truth.
- Stripe Billing owns recurring invoice generation and recurring charge state.
- The local subscription aggregate owns eligibility snapshots, customer ownership, immutable region/currency, item snapshots, lifecycle state and links from a billing period to one Medusa order.
- Client-supplied prices, adjustments, component lists, provider IDs and customer IDs are ignored or rejected.

## Creation

`POST /store/subscriptions` requires `{ cart_id, interval, interval_count, idempotency_key }` and an authenticated customer. The server loads the cart, verifies ownership, rejects mixed feature types, resolves each current regional calculated price, verifies eligibility and snapshots item/title/address/region/currency context. Reusing an idempotency key for the same customer returns the same aggregate; using it with different input is a conflict.

No subscription becomes `ACTIVE` until a verified Stripe event confirms the provider subscription and successful initial invoice. A failed or abandoned provider checkout leaves no active subscription and no successful Medusa order.

## Billing and idempotency

The billing-period key is derived from the Stripe invoice/subscription period, never from client time. `(subscription_id, billing_period_key)` is unique. Stripe event IDs are unique. Webhook processing first claims the event, then claims the billing period. Retries return the existing result. One billing period can create at most one charge (owned by Stripe) and one Medusa order.

Medusa order creation occurs only after a verified paid invoice. Inventory and regional availability are validated before order creation; failure records a safe error and does not mark an order successful.

## Lifecycle

- `ACTIVE -> PAUSED`: allowed when the product policy permits; Stripe collection is paused and future local order creation stops.
- `PAUSED -> ACTIVE`: allowed; provider billing resumes and the next date is recalculated from provider truth.
- `ACTIVE|PAUSED|PAST_DUE -> CANCELLED`: allowed; provider cancellation prevents future invoices.
- `CANCELLED|EXPIRED -> ACTIVE`: forbidden in the first release.
- Pause and cancel are idempotent when the requested final state already exists.
- Region and currency are immutable. Moving regions requires cancelling and creating a new subscription.

## Failures, refunds and retention

Failed invoices set `PAST_DUE`, increment bounded attempt metadata, and create no successful order. Stripe retry rules are bounded in the Stripe Billing configuration; the Medusa job reconciles state and never originates another charge. Refunds are processed through the normal Medusa/Stripe refund path and linked to the affected generated order; refunds do not silently reactivate or cancel the subscription.

Historical item prices, titles, addresses, currency and personalization/bundle exclusion decisions remain snapshotted even if catalog configuration changes.

