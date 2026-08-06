# Bundle snapshot completion fix

Status: PARTIAL — code, unit checks, type checks, and builds pass. Live-cart repair and acceptance were intentionally not run because this task did not provide an authenticated cart ID/session, and the reported bundle group alone is not enough to safely inspect or mutate a customer's payment/cart data.

## Root cause and implementation

The failure came from component lines being created before a snapshot, while checkout located snapshots by JSON metadata rather than a first-class cart/group key. A failure between these actions left the cart with bundle component lines but no checkout-queryable snapshot.

The bundle workflow now creates a PENDING snapshot before adding lines, verifies the exact created lines and their integer-minor-unit total, then activates the snapshot. Workflow compensation deletes the pending snapshot and created lines if a downstream step fails. `bundle_group_id` is now a model field with a cart/group unique index and an ACTIVE/CONVERTED lifecycle. Checkout uses one exact active snapshot lookup and returns precise conflict codes; query failures remain server errors. Completion is cart-locked and returns an existing order for retry instead of running completion again.

Legacy handling is a private Medusa script, dry-run by default:

`npm run repair:bundle-snapshot -- --cart-id <cart_id> --bundle-group-id <group_id>`

It requires `--apply` before any write, verifies component IDs/quantities and quoted allocation metadata, and refuses invalid or ambiguous legacy data.

## Runtime audits

[BUNDLE_COMPLETION_CART_AUDIT]

```json
{
  "cartId": "",
  "regionId": "",
  "currencyCode": "",
  "paymentCollectionId": "",
  "paymentProvider": "",
  "paymentStatus": "",
  "lineCount": 0,
  "bundleGroups": [],
  "passed": false
}
```

[BUNDLE_SNAPSHOT_RUNTIME_AUDIT]

```json
{
  "bundleGroupId": "bg_1785417527825_8o4sve",
  "cartId": "",
  "snapshotCount": 0,
  "snapshotIds": [],
  "matchingCartSnapshotFound": false,
  "deletedSnapshotFound": false,
  "wrongCartSnapshotFound": false,
  "wrongGroupFieldFound": false,
  "passed": false
}
```

No runtime DB query or write was performed. An authenticated development/admin cart context is required for those two audits.

[BUNDLE_ADD_WORKFLOW_TRACE]

```json
{
  "groupIdGeneratedBeforeLines": true,
  "componentLinesCreated": true,
  "snapshotCreateAttempted": true,
  "snapshotCreateAwaited": true,
  "snapshotLinkedToCart": true,
  "snapshotLinkedToLines": true,
  "rollbackConfigured": true,
  "partialCommitPossible": false,
  "rootCause": "The prior workflow added component lines before creating a metadata-only snapshot, so a downstream snapshot failure could leave unprotected grouped lines."
}
```

[BUNDLE_LEGACY_CART_REPAIR]

```json
{
  "repairRequired": false,
  "cartId": "",
  "bundleGroupId": "bg_1785417527825_8o4sve",
  "authoritativeBundleMatched": false,
  "componentLinesMatched": false,
  "pricingMatched": false,
  "existingOrderFound": false,
  "snapshotCreated": false,
  "duplicateSnapshotPrevented": true,
  "databaseWrites": 0,
  "passed": false
}
```

[CHECKOUT_FINALIZATION_IDEMPOTENCY]

```json
{
  "cartId": "",
  "paymentCollectionReused": false,
  "paymentSessionReused": false,
  "paymentReinitialized": false,
  "existingOrderFound": false,
  "duplicateOrderCreated": false,
  "passed": false
}
```

[BUNDLE_CART_TOTAL_AUDIT]

```json
{
  "configuredBundlePrice": null,
  "allocatedComponentSubtotal": null,
  "cartSubtotal": null,
  "taxTotal": null,
  "cartTotal": null,
  "currencyCode": "",
  "pricingMatches": false
}
```

## Verification run

- Backend focused Jest: 2 suites, 12 tests passed.
- Backend TypeScript check passed.
- Frontend focused Vitest: 2 files, 9 tests passed.
- Frontend production build passed.
- Backend Medusa production build passed.

[BUNDLE_SNAPSHOT_COMPLETION_FIX_DONE]

```json
{
  "status": "PARTIAL",
  "cartId": "",
  "bundleGroupId": "bg_1785417527825_8o4sve",
  "bundleComponentLineCount": 0,
  "cartSnapshotCount": 0,
  "snapshotCreatedAtomically": true,
  "snapshotLookupPassed": true,
  "bundlePricingPassed": false,
  "bundleReservationsPassed": false,
  "legacyCartRepaired": false,
  "invalidLegacyCartRemoved": false,
  "paymentCollectionReused": false,
  "paymentReinitialized": false,
  "completionStatus": 0,
  "orderCreated": false,
  "orderCountForCart": 0,
  "orderSnapshotCreated": false,
  "duplicateOrderCreated": false,
  "retryFinalizationPassed": false,
  "backendTestsPassed": 12,
  "frontendTestsPassed": 9,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "databaseWrites": 0,
  "rootCause": "Bundle component lines could be committed before a snapshot existed, and completion searched only metadata instead of an indexed active cart/group snapshot.",
  "remainingBlockers": [
    "An authenticated cart ID/session is required to audit bg_1785417527825_8o4sve, assess its $0.80 total, and safely run the guarded repair or removal.",
    "Live COD completion and idempotent retry acceptance require a controlled development cart and payment session."
  ]
}
```
