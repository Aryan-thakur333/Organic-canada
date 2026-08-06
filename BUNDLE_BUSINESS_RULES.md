# Fixed Bundle Business Rules

## Scope and representation

- The first release supports `fixed_bundle` only. Configurable/mix-and-match bundles and nested bundles are out of scope.
- A bundle is one commercial Medusa product/variant line. Its immutable component snapshot is operational detail for picking, inventory and order display.
- Bundle parent variants do not manage fake inventory. Availability and checkout protection are derived only from component variant inventory.

## Pricing

- Pricing strategy is `fixed_price`. Admin supplies positive integer minor-unit prices through normal Medusa variant price records for every selected region currency.
- Store display and add-to-cart use Medusa calculated prices with the request/cart region context. No currency conversion and no client-supplied price are used.

## Availability and regional isolation

- Per component and location: `floor(available_quantity / (component_quantity * inventory_link_required_quantity))`.
- Per-location bundle availability is the minimum across all required inventory links/components.
- Availability is never summed across locations. Eligible locations must match the cart sales channel and selected region country.
- All required components are published, in every configured bundle sales channel, non-personalized, non-bundle variants with positive integer quantities.

## Checkout, concurrency and cancellation

- Add-to-cart runs under a cart lock, revalidates the regional price and location availability, and creates a component/price snapshot.
- Immediately before native cart completion, a second cart lock creates Medusa component reservation items with `allow_backorder=false`. The inventory service is the concurrency authority, so competing checkout attempts cannot both reserve the last unit.
- Failed completion releases reservations. A bounded job releases crash-orphaned reservations after 30 minutes.
- The idempotent `order.placed` subscriber commits exact reserved quantities at their exact stock locations, deletes reservation records and stores the deduction evidence.
- `order.canceled` idempotently restores those exact deductions. No raw inventory SQL is used.

## Fulfillment and returns

- Warehouse fulfillment is component-aware: Admin shows component variant, SKU, required quantity, and picked/fulfilled quantity while the customer sees one commercial line.
- First-release returns are whole-bundle only. Individual component refunds/returns are unsupported because commercial discount allocation is not defined.
- Whole-bundle cancellation restores all committed component inventory. A refund without cancellation does not silently restock; operations must use the approved whole-bundle cancellation/return workflow.

## POS and compatibility

- Bundles, personalized products and subscription-only products are rejected by POS with `POS_UNSUPPORTED_PRODUCT_TYPE`.
- One-time carts may contain normal, personalized and fixed-bundle lines. Subscription checkout remains subscription-only.
