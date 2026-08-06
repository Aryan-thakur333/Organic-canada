# Bundle Runtime Completion — Final Fix Evidence

Date: 2026-07-30

## Root cause and repair

Two independent faults prevented safe bundle checkout:

1. The bundle snapshot migration used the same global MikroORM timestamp as a
   personalization migration. Medusa therefore recorded the timestamp as
   applied without creating the bundle snapshot columns and indexes.
2. Bundle prices configured through the Admin API are major-unit values (for
   example, `21.99`), while cart line `unit_price` values are minor units. The
   workflow sent the major-unit value to the integer-only allocator.

The snapshot migration is now uniquely timestamped as
`Migration20260730110000.ts` and is applied to `medusa-backend`. Price inputs
are converted once at the workflow boundary, allocated entirely in minor
units, verified before lines are added, and stored with explicit major/minor
metadata. The workflow still creates a pending snapshot, adds grouped lines,
attaches their IDs, creates checkout reservations, and activates the snapshot;
existing compensation paths remain in place.

The snapshot query helper now uses the actual bundle module service and returns
controlled `404 BUNDLE_SNAPSHOT_NOT_FOUND`, `409 BUNDLE_SNAPSHOT_DUPLICATE`,
or `500 BUNDLE_SNAPSHOT_QUERY_FAILED` responses. A stale or legacy bundle cart
is rejected with `409 BUNDLE_CART_REBUILD_REQUIRED`; the storefront creates a
fresh cart and re-adds each bundle through the authoritative bundled-line-items
endpoint, which creates a fresh snapshot and allocation. It does not reuse the
old payment session.

## Runtime evidence

Schema migration and read-only audit:

```text
[BUNDLE_SNAPSHOT_SCHEMA_AUDIT]
{
  "runtimeDatabase": "medusa-backend",
  "migrationApplied": true,
  "tableExists": true,
  "bundleGroupColumnExists": true,
  "statusColumnExists": true,
  "groupIndexExists": true,
  "passed": true
}
```

Allocation invariant used by the workflow and covered by focused tests:

```text
currency: usd/cad
configured major amount: 21.99
converted minor amount: 2199
quantity: 1
expected allocated total: 2199
actual allocated total: 2199
```

Development execution emits `[BUNDLE_PRICE_ALLOCATION_INPUT]` and
`[BUNDLE_ALLOCATION_RECONCILIATION]` with currency, configured major value,
converted minor value, expected total, actual total, and a pass flag. No token,
payment secret, or customer data is logged.

## Verification

| Check | Result |
| --- | --- |
| `npx medusa db:migrate` | Passed; unique bundle migration applied |
| `npm run audit:bundle-snapshot-schema` | Passed |
| Backend TypeScript (`tsc --noEmit`) | Passed |
| Focused bundle backend tests | 2 suites, 13 tests passed |
| Full backend unit suite | 51 suites, 676 tests passed |
| Backend Medusa production build | Passed |
| Focused frontend recovery/checkout tests | 3 files, 11 tests passed |
| Frontend production build | Passed |
| Full frontend suite | Failed in pre-existing feature-gating/POS barcode-camera tests; not changed by this work |

No live USA/CAD checkout was executed because doing so requires an authenticated
storefront session and would create a payment/cart artefact. No cart, payment,
or order was created by this repair. Backend development service remains
stopped.

[BUNDLE_RUNTIME_COMPLETION_FINAL_FIX_DONE]

```json
{
  "status": "PARTIAL",
  "migrationApplied": true,
  "snapshotSchemaPassed": true,
  "snapshotQueryPassed": true,
  "priceMajorAmount": 21.99,
  "priceMinorAmount": 2199,
  "allocationExpectedMinor": 2199,
  "allocationActualMinor": 2199,
  "allocationPassed": true,
  "legacyCartRejected": true,
  "freshCartCreated": false,
  "freshSnapshotActive": false,
  "freshCartSubtotal": null,
  "stalePaymentSessionReused": false,
  "paymentCollectionCreatedOnce": false,
  "completionStatus": 0,
  "backendTestsPassed": 676,
  "frontendTestsPassed": 11,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "databaseWrites": 1,
  "rootCause": "Global migration timestamp collision left the runtime schema incomplete; bundle pricing also mixed configured major units with minor-unit allocation.",
  "remainingBlockers": [
    "A live authenticated USA and CAD checkout/payment acceptance run was intentionally not performed, so fresh-cart/payment fields remain unverified.",
    "The complete frontend suite has unrelated existing failures in commerce feature-gate and POS camera tests."
  ]
}
```
