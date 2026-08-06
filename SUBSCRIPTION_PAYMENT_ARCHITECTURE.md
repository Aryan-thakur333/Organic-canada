# Subscription Payment Architecture

Decision: **Option 1 — Stripe Billing is the only recurring charge owner.**

## Ownership

- Stripe Checkout creates/attaches the provider customer and payment method and creates the Stripe Billing subscription.
- Stripe Billing creates recurring invoices and performs recurring charges.
- Verified Stripe webhooks transition local payment/subscription state and trigger idempotent Medusa order creation.
- The scheduled Medusa job reconciles overdue local state with Stripe; it does not call `paymentIntents.create` and does not charge cards.
- The legacy payment server is excluded from subscription processing.

This replaces the prior mixed architecture where Stripe Checkout created a Billing subscription while `subscription-billing.ts` also created off-session PaymentIntents.

## Provider customer and method

Stripe Checkout runs in `subscription` mode. Customer identity is derived from the authenticated Medusa customer. Provider customer/subscription IDs are stored only after verified provider responses. Raw card data never enters Medusa or the storefront.

## Idempotency

- Creation: `subscription:create:{customer_id}:{idempotency_key}`.
- Stripe Checkout/Subscription create request: the same stable local subscription ID and creation key.
- Provider event: unique Stripe `event.id`.
- Billing period: unique `(subscription_id, billing_period_key)` where the key is the Stripe invoice ID or canonical provider period.
- Generated order: linked from the unique subscription-order record.

## Events

Required verified events are `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, and `customer.subscription.deleted`. Events are acknowledged only after signature verification. Duplicate event IDs are successful no-ops.

`invoice.paid` is the only event that can advance a paid billing period and generate its Medusa order. `invoice.payment_failed` records `PAST_DUE` and no successful order. Provider update/delete events reconcile pause/cancel/status and next billing date.

## Currency and price

The subscription aggregate stores the cart's Medusa region and lower-case ISO currency. Each item snapshots the server-resolved regional unit price. Stripe line items use those server snapshots. The first release forbids region/currency mutation and frontend conversion.

## Cancellation, pause and refund

Customer mutations validate ownership and legal transitions, update Stripe first with idempotent semantics, then persist the confirmed local state. Cancellation stops future billing. Pause uses Stripe pause-collection behavior. Refunds use existing payment/order refund architecture and never create a second recurring charge.

## Test-mode verification

Use Stripe test mode and signed fixture events. Verify creation reuse, duplicate event reuse, duplicate billing-period reuse, paid-invoice order creation, failed-invoice no-order behavior, pause/resume/cancel reconciliation, USD/CAD preservation and cross-customer denial. Live provider acceptance remains disabled until test-mode credentials and webhook delivery are available.

