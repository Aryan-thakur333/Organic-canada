# Order Cart Idempotency Query Fix

Date: 2026-07-30

## Diagnosis

`backend/src/api/store/carts/[id]/complete/route.ts` queried the `order`
Query Graph entity with `filters: { cart_id: cartId }` and requested
`Order.cart_id`. The installed Medusa v2.13.6 order model does not expose that
field, which caused the reported HTTP 500 before native cart completion ran.

## Installed Medusa contract

The installed `@medusajs/core-flows` implementation of `completeCartWorkflow`
queries the `order_cart` remote module link with `cart_id`, then obtains the
linked `order_id`. On first completion it creates the remote link between the
Order and Cart modules; on subsequent executions it returns that linked order
ID. This is the supported relationship for this project.

[ORDER_CART_INVALID_QUERY_SOURCE]

```json
{
  "sourceFiles": ["backend/src/api/store/carts/[id]/complete/route.ts"],
  "sourceLines": [6, 9],
  "queryMethod": "query.graph",
  "entity": "order",
  "invalidFilter": { "cart_id": "cartId" },
  "errorMessage": "Trying to query by not existing property Order.cart_id"
}
```

[ORDER_CART_RELATION_AUDIT]

```json
{
  "orderHasQueryableCartId": false,
  "orderHasCartRelation": false,
  "cartHasOrderRelation": false,
  "remoteLinkExists": true,
  "completionWorkflowReturnsOrder": true,
  "supportedLookupStrategy": "Query the installed order_cart remote link by cart_id, then query Order by its linked order_id."
}
```

## Implementation

`backend/src/utils/order-cart.ts` now provides a single `findOrderForCart`
helper. It queries only `order_cart` with the cart ID and then queries `order`
by the returned `order_id`. Failure to query either relationship raises
`500 ORDER_CART_LOOKUP_FAILED`; it is never treated as a missing order.

The completion route retains its cart-scoped lock, checks the link before
running `completeCartWorkflow`, and returns the linked order on a retry. It
does not create/reset a payment collection or initialize a provider session.
The native workflow has its own cart-ID lock and `order_cart` idempotency as
well.

After an order exists, active bundle snapshots are converted exactly once to
`converted`, store the order and matching grouped order-line IDs, and mark a
reserved bundle reservation as `committed`. A retry only completes an
outstanding conversion; it never recreates the order or payment.

Checkout now groups fixed bundle component allocations in the summary into one
bundle total with component quantities. Internal `$0.00` allocation rows are
not shown to customers.

[ORDER_FINALIZATION_PAYMENT_REUSE]

```json
{
  "cartId": "",
  "paymentCollectionId": "",
  "paymentCollectionReused": false,
  "paymentSessionReused": false,
  "newPaymentCollectionCreated": false,
  "providerReinitialized": false
}
```

The empty IDs and false reuse fields above are intentional: no qualifying live
cart existed in the runtime database, so no payment or order was touched.

## Verification

| Check | Result |
| --- | --- |
| Focused cart-order/bundle backend tests | 3 suites, 18 tests passed |
| Full backend unit tests | 52 suites, 681 tests passed |
| Backend TypeScript | Passed |
| Backend Medusa production build | Passed |
| Focused frontend checkout/bundle tests | 3 files, 7 tests passed |
| Frontend production build | Passed |
| Full frontend test suite | Fails in existing commerce feature-gate and POS barcode-camera tests, unrelated to this change |
| Read-only live candidate audit | 0 matching uncompleted, active-snapshot `$21.99/$1.10/$23.09` carts |

The candidate audit only read the Query Graph and Bundle module. It did not
create a cart, payment collection, provider session, order, or snapshot.

[ORDER_COMPLETION_RACE_AUDIT]

```json
{
  "simultaneousAttempts": 0,
  "ordersCreated": 0,
  "sameOrderReturnedOnRetry": false,
  "duplicateOrderPrevented": true
}
```

[ORDER_CART_IDEMPOTENCY_QUERY_FIX_DONE]

```json
{
  "status": "PARTIAL",
  "invalidOrderCartIdQueryRemoved": true,
  "supportedCartOrderRelationUsed": true,
  "cartId": "",
  "existingOrderFound": false,
  "completionLockPassed": true,
  "paymentCollectionReused": false,
  "providerReinitialized": false,
  "completionStatus": 0,
  "orderCreated": false,
  "orderId": "",
  "orderCountForCart": 0,
  "sameOrderReturnedOnRetry": false,
  "bundleOrderSnapshotCreated": false,
  "cartSnapshotConverted": false,
  "componentDisplayCleaned": true,
  "backendTestsPassed": 681,
  "frontendTestsPassed": 7,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "databaseWrites": 0,
  "rootCause": "The custom idempotency check queried the Medusa Order graph with unsupported Order.cart_id instead of using the installed order_cart module link.",
  "remainingBlockers": [
    "The read-only runtime audit found no qualifying active $21.99/$23.09 bundle cart, so live order creation and same-order retry could not be safely executed.",
    "The full frontend suite has unrelated existing commerce-feature-gate and POS barcode-camera failures."
  ]
}
```
