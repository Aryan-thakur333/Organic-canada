# Phase 4 POS Production Readiness Report

Date: 2026-07-28  
Medusa: 2.13.6  
Final status: **PARTIAL / NOT PRODUCTION-READY**

## Gate summary

| Gate | Result | Evidence |
|---|---|---|
| Native tax | FAILED | Both country tax regions use `tp_system`, have automatic taxes enabled, but contain no tax rates. Current native carts persist no tax lines. |
| Native cash provider | PASSED | `pp_pos_cash` registered, linked to CAD/USD regions, unit-tested, and exercised through Payment Module authorize/capture/partial-refund runtime. |
| Compensation | PARTIAL | Idempotent recovery and pre-order authorization cancellation implemented; full stage-by-stage runtime injection not completed. |
| USA inventory | FAILED | USA stock location/channel/register mapping exists, but zero variants have USA location inventory. USA fulfillment options point to the Canadian location. |
| Promotion calculation | PARTIAL | Checkout uses Promotion Module and exact native cart adjustments; no eligible promotion-plus-tax runtime proof exists. |
| Offline sync | PARTIAL | Draft-only storage, no offline payment, reconnect validation, stale price/inventory handling, and idempotent UUID upload implemented and unit-tested; restart/unknown-response browser E2E remains. |
| Diagnostic review | PASSED | Both retained native orders reviewed read-only; no destructive action taken. |
| Security | PASSED | Auth rate limiting, user bearer/session auth, assignment/location isolation, audited manager operations, no default PIN, no PAN/CVV input/logging, no frontend credential. |
| Automated tests | PASSED | Backend 445; frontend 181; zero failures. |
| Builds | PASSED | Backend/Medusa Admin and frontend production builds completed successfully. |

## Native tax verification

`createCartWorkflow`, `updateCartPromotionsWorkflow`, and `refreshCartItemsWorkflow(force_tax_calculation=true)` are now authoritative. Receipts use converted native order line totals/tax lines, and checkout blocks any cart/order mismatch.

Runtime configuration:

- Canada: region `reg_01KVJF9HSCYKAZC677GH1AC6C8`, provider `tp_system`, automatic taxes enabled, country tax region present, **0 tax rates**.
- USA: region `reg_01KXT623CTGM9NJJYK2G4DQW7E`, provider `tp_system`, automatic taxes enabled, country tax region present, **0 tax rates**.

Runtime calculation-only carts:

```json
[POS_TAX_VERIFICATION]
[
  {
    "registerId": "01KYMKWP9FAB13SGT4Z5XTW6R2",
    "regionId": "reg_01KVJF9HSCYKAZC677GH1AC6C8",
    "currencyCode": "cad",
    "subtotalMinor": 100000,
    "discountMinor": 0,
    "taxMinor": 0,
    "totalMinor": 100000,
    "nativeOrderTotalMinor": 0,
    "receiptTotalMinor": 0,
    "result": "FAILED"
  },
  {
    "registerId": "01KYMKWP9T4YWNMZA47AZNQSY3",
    "regionId": "reg_01KXT623CTGM9NJJYK2G4DQW7E",
    "currencyCode": "usd",
    "subtotalMinor": 1899,
    "discountMinor": 0,
    "taxMinor": 0,
    "totalMinor": 1899,
    "nativeOrderTotalMinor": 0,
    "receiptTotalMinor": 0,
    "result": "FAILED"
  }
]
```

The Canada verification happened to select a CAD 1000.00 catalog item. This was calculation-only and created no order/payment. No tax rate was fabricated. Tax-exempt behavior is not claimed because no supported customer exemption configuration was found.

## Native cash provider proof

Provider: `pp_pos_cash`

```json
{
  "initiatedStatus": "pending",
  "authorizedStatus": "authorized",
  "capturedNativeAmount": 10,
  "capturedAmountMinor": 1000,
  "tenderedAmountMinor": 1200,
  "changeDueMinor": 200,
  "partialRefundNativeAmount": 2.5,
  "partialRefundMinor": 250,
  "result": "PASSED"
}
```

All synthetic captured balances were fully refunded after verification. Provider data stores register, session, operator, transaction, receipt, tender, change, captured/refunded amounts, and idempotency identifiers. Change is never counted as captured value.

## Checkout state and compensation

Implemented state markers:

1. `CART_VALIDATED`
2. `PAYMENT_AUTHORIZED`
3. `ORDER_CREATED`
4. `INVENTORY_RESERVED`
5. `PAYMENT_CAPTURED`
6. `OMS_INGESTED`
7. `RECEIPT_CREATED`
8. `COMPLETED`

Implemented behavior:

- Before order creation: native authorization is canceled and append-only compensation events are written.
- Native cart/payment collection reuse prevents duplicate initiation after unknown responses.
- After order creation: order is retained; transaction becomes `ON_HOLD`; retry reuses the same order.
- After capture: no automatic replacement order is created. Retry reuses POS payment, fulfillment, OMS event, receipt, and cash movement.
- Events include `POS_COMPENSATION_STARTED`, `POS_PAYMENT_CANCELLED`, `POS_COMPENSATION_COMPLETED`, and `POS_COMPENSATION_FAILED`. Inventory reservation rollback before order completion is delegated to the native cart workflow transaction.

Missing proof: runtime failure injection at every boundary, including an actual capture-followed-by-unrecoverable-order failure. Therefore `compensationPassed=false`.

## USA POS inventory audit

```json
[USA_POS_INVENTORY_AUDIT]
{
  "registerId": "01KYMKWP9T4YWNMZA47AZNQSY3",
  "stockLocationId": "sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ",
  "salesChannelLinked": true,
  "variantsAudited": 3,
  "variantsWithInventory": 0,
  "variantsWithoutInventory": 3,
  "crossRegionFallbackDetected": false,
  "status": "FAILED"
}
```

The USA register correctly uses USD and the USA region/location. Catalog code filters inventory strictly by `register.stock_location_id`, so it cannot fall back to Canadian stock. No inventory quantity was invented or copied. Existing USA shipping options resolve to the Canadian stock location, so fulfillment readiness also fails.

## Promotion and return correctness

- Promotion code lookup alone is no longer treated as a discount.
- The native cart applies eligibility, dates, sales channel, customer context, currency, and Promotion Module adjustments.
- Checkout compares native cart subtotal/discount/tax/total with the resulting native order and blocks mismatch.
- POS transaction/payment/receipt fields use integer minor units converted from native amounts.
- Partial returns reverse cumulative native subtotal, discount, tax, and total allocations. Unit coverage proves sequential partial returns sum exactly to the original native line total.

No current eligible promotion-plus-tax runtime transaction could pass while both tax regions lack rates, so this gate is not passed.

## Offline hardening

Local drafts contain client UUID, idempotency key, register/session/operator/region/currency, variant/product, quantity, last-known price, last-known inventory, creation time, and sync status. Payment/tender data is deliberately excluded.

Reconnect upload:

- reuses client UUID and idempotency key;
- requires authenticated POS APIs and an open matching session;
- reloads current register price and inventory;
- rejects unavailable or insufficient items;
- marks changed prices `AWAITING_OPERATOR_CONFIRMATION`;
- creates/updates a server draft only, never an offline payment/order.

Unit tests cover no-payment persistence, idempotent identity upload, changed price confirmation, and stale inventory rejection. Required browser loss/restart/timeout E2E is still incomplete.

## Diagnostic order review

| Field | Diagnostic 1 | Diagnostic 2 |
|---|---|---|
| Order ID | `order_01KYMKYA9FYW5GCB2TPZC5F5YF` | `order_01KYMM18WEMH66TRJZJJ0W371V` |
| Display ID | 78 | 79 |
| Region | Canada | Canada |
| Currency | CAD | CAD |
| Customer | `cus_01KYMKYA6KG98M5RGC1KVX82XT` | `cus_01KYMM18SC684G5813GZEYHXX7` |
| POS transaction | `01KYMKYA5XY2RP9HKE3YKQS1SF` | `01KYMM18RQJRXA0SHTSRX5EACQ` |
| POS status | FAILED | FAILED |
| Captured | CAD 25.00 | CAD 25.00 |
| Refunded | CAD 0.00 | CAD 0.00 |
| Fulfillment | none | none |
| Reservation | none | none |
| OMS | none | none |
| Receipt | none | none |
| Failure | historical unexpected checkout failure | historical unexpected checkout failure |
| Recommendation | `MANUAL_REVIEW` | `MANUAL_REVIEW` |

No cancellation, refund, release, or deletion was executed.

## Security review

- Authentication: Medusa user bearer/session authentication on `/pos/*`.
- Login throttling: `/auth/*` uses the existing authentication rate limiter.
- Authorization: active register assignment and role checks on every POS operation.
- Session: checkout requires the draft's exact open register session; stale sessions are rejected.
- Isolation: price currency and inventory location must match the selected register; no cross-location fallback.
- Credentials: no default PIN and no frontend-shipped POS credential.
- Card data: manual terminal flow accepts references/last-four only; no PAN/CVV fields or receipt values.
- Overrides: manager-only cash/return/discount actions are audited.

## Required 17-scenario runtime matrix

| # | Scenario | Result |
|---:|---|---|
| 1 | Canada cash sale with tax | FAILED — no configured tax rate |
| 2 | USA cash sale with tax | FAILED — no tax rate and no USA inventory |
| 3 | Canada manual-card sale | FAILED gate — historical pass predates native-cart refactor |
| 4 | USA manual-card sale | FAILED — no USA inventory |
| 5 | Promotion plus tax | FAILED — no tax rates/current eligible proof |
| 6 | Partial cash refund | FAILED gate — provider partial refund passed, full order/receipt flow not rerun |
| 7 | Partial card refund | FAILED — not rerun |
| 8 | Failure after inventory reservation | FAILED — injection not run |
| 9 | Failure after authorization | FAILED — injection not run |
| 10 | Failure after capture | FAILED — injection not run |
| 11 | Offline draft reconnect | FAILED gate — unit proof only |
| 12 | Duplicate offline sync | FAILED gate — unit/DB constraint proof only |
| 13 | USA out-of-stock | FAILED gate — configuration audit only, authenticated route E2E not rerun |
| 14 | Canada/USA isolation | FAILED gate — code/config proof only, current authenticated E2E not rerun |
| 15 | Customer profile visibility | FAILED gate — current authenticated E2E not rerun |
| 16 | OMS idempotence | PASSED — prior runtime replay produced one OMS/order and remains protected by cart/OMS reuse |
| 17 | Register reconciliation after refunds | PASSED — prior runtime reconciliation returned zero difference |

E2E result: **2 passed, 15 failed/not sufficiently proven**.

## Automated verification

- Backend `npm.cmd test`: **445 passed, 0 failed**.
- Frontend `npm.cmd test -- --run`: **181 passed, 0 failed**.
- Backend TypeScript `tsc --noEmit`: **passed**.
- Backend/Medusa Admin `npm.cmd run build`: **passed**.
- Frontend `npm.cmd run build`: **passed**.

## Database writes made by this remediation

Known top-level remediation/verification records or links: **17**:

- 2 region-to-`pp_pos_cash` link updates;
- 4 calculation-only native carts from tax diagnostics;
- 2 synthetic payment collections, 2 sessions, 2 payments, 2 captures, and 3 refunds from provider verification/cleanup.

This count excludes Medusa's internal child/address/item/link/event rows and idempotent setup no-op checks. No diagnostic production order was mutated.

## Final production gate

```json
[PHASE_4_POS_PRODUCTION_READINESS_DONE]
{
  "status": "PARTIAL",
  "nativeTaxPassed": false,
  "nativeCashProviderPassed": true,
  "compensationPassed": false,
  "usaInventoryPassed": false,
  "promotionCalculationPassed": false,
  "offlineSyncPassed": false,
  "diagnosticOrdersReviewed": true,
  "securityReviewPassed": true,
  "backendTestsPassed": 445,
  "frontendTestsPassed": 181,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "e2ePassed": 2,
  "e2eFailed": 15,
  "highSeverityBlockers": [
    "Canada and USA tax regions have no configured tax rates",
    "USA POS location has no inventory and USA fulfillment options target the Canadian location",
    "Stage-by-stage checkout compensation has not passed runtime failure injection",
    "Promotion-plus-tax has no passing runtime proof",
    "Offline reconnect/restart/unknown-response matrix has not passed runtime E2E",
    "Runtime uses Local Event Bus and in-memory locking"
  ],
  "databaseWrites": 17,
  "productionReady": false
}
```
