# Phase 3A OMS Foundation Report

Date: 2026-07-28  
Backend: MedusaJS 2.13.6  
Scope: OMS foundation only. No POS or omnichannel UI was implemented.

## Outcome

Phase 3A passed. The OMS is registered, migrated, compiled, running, and verified with Canada CAD, USA USD, and existing multi-vendor orders. The implementation keeps the native Medusa order as the only financial order and uses `OmsVendorOrder` strictly as an operational split.

## Files created

### Module and persistence

- `backend/src/modules/oms/index.ts`
- `backend/src/modules/oms/service.ts`
- `backend/src/modules/oms/models/oms-order.ts`
- `backend/src/modules/oms/models/oms-order-group.ts`
- `backend/src/modules/oms/models/oms-vendor-order.ts`
- `backend/src/modules/oms/models/oms-order-event.ts`
- `backend/src/modules/oms/models/oms-fulfillment-assignment.ts`
- `backend/src/modules/oms/models/oms-cancellation-request.ts`
- `backend/src/modules/oms/models/oms-return-request.ts`
- `backend/src/modules/oms/migrations/Migration20260728000001.ts`

### Workflow and subscriber

- `backend/src/workflows/oms/ingest-order.ts`
- `backend/src/subscribers/oms-order-placed.ts`
- `backend/src/scripts/verify-oms-foundation.ts`

### OMS domain utilities

- `backend/src/utils/oms/status.ts`
- `backend/src/utils/oms/region-safety.ts`
- `backend/src/utils/oms/location-policy.ts`
- `backend/src/utils/oms/operations.ts`
- `backend/src/utils/oms/responses.ts`

### APIs

- `backend/src/api/admin/oms/orders/route.ts`
- `backend/src/api/admin/oms/orders/[id]/route.ts`
- `backend/src/api/admin/oms/orders/[id]/status/route.ts`
- `backend/src/api/admin/oms/orders/[id]/hold/route.ts`
- `backend/src/api/admin/oms/orders/[id]/release/route.ts`
- `backend/src/api/vendor/oms/orders/route.ts`
- `backend/src/api/vendor/oms/orders/[id]/route.ts`
- `backend/src/api/vendor/oms/orders/[id]/accept/route.ts`
- `backend/src/api/vendor/oms/orders/[id]/reject/route.ts`
- `backend/src/api/vendor/oms/orders/[id]/ready/route.ts`
- `backend/src/api/vendor/oms/orders/[id]/ship/route.ts`
- `backend/src/api/store/customers/me/oms/orders/route.ts`
- `backend/src/api/store/customers/me/oms/orders/[id]/route.ts`

### Tests

- `backend/src/modules/oms/__tests__/oms-foundation.unit.spec.ts`

## Files updated

- `backend/medusa-config.ts`: registered the queryable `oms` module.
- `backend/src/api/middlewares.ts`: added authenticated-customer protection for OMS tracking routes. Existing `/admin/*` and `/vendor/*` authentication policies protect the admin and vendor OMS routes.

## Migration

Migration `Migration20260728000001` creates all seven OMS tables, filtered lookup indexes, and uniqueness constraints for:

- one active `OmsOrder` per native `order_id`;
- one active `OmsVendorOrder` per OMS order and vendor;
- one active vendor group per OMS order, group type, and reference;
- one active fulfillment assignment per vendor order.

The `oms_order_event` table has a PostgreSQL trigger that rejects UPDATE and DELETE, enforcing append-only history at the database boundary.

Command: `npm.cmd run db:migrate`  
Result: `Migration20260728000001` migrated successfully and links synchronized.

## Canonical status model

Implemented statuses:

`PENDING`, `CONFIRMED`, `ALLOCATED`, `PROCESSING`, `READY_FOR_FULFILLMENT`, `PARTIALLY_FULFILLED`, `FULFILLED`, `PARTIALLY_SHIPPED`, `SHIPPED`, `DELIVERED`, `CANCEL_REQUESTED`, `CANCELLED`, `RETURN_REQUESTED`, `PARTIALLY_RETURNED`, `RETURNED`, `REFUND_PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED`, and `ON_HOLD`.

The centralized transition map permits forward lifecycle, eligible cancellation/return/refund paths, and explicit hold/release paths. Invalid transitions return HTTP 409 and append an `ERROR` event with code `OMS_TRANSITION_REJECTED`. Native Medusa order, payment, fulfillment, and return states are read and represented; they are not overwritten by OMS status changes.

## Order ingestion and idempotence

The `order.placed` subscriber starts `ingest-oms-order-workflow`. It:

- retrieves the completed native order;
- verifies region, currency, region countries, shipping country, sales channel, and optional line-price region/currency metadata;
- creates or reuses the canonical OMS order by `order_id`;
- resumes incomplete ingestion after a retry instead of accepting a partial split;
- stores `oms:<order_id>` as the idempotency key and marks completion only after all groups are processed;
- groups items using the actual product-to-vendor relation with metadata fallback;
- assigns unowned products to `PLATFORM`;
- snapshots quantity, unit price, subtotal, tax, discount, currency, personalization, bundle linkage, and subscription markers;
- excludes digital items from physical fulfillment;
- creates initial timeline events and structured audit logs.

Database uniqueness constraints protect concurrent retries. Two consecutive full verification runs returned the same OMS IDs, one OMS record per native order, the same vendor-order counts, and unchanged timeline counts.

## Region and currency safety

The validator fails closed for missing region, missing currency, missing sales channel, unsupported currency, region/order currency mismatch, Canada without CAD, USA without USD, shipping country outside the selected region, and conflicting item price metadata. Invalid orders are placed `ON_HOLD` and receive one timeline event per reason. No CAD/USD fallback exists.

Live verification:

- Canada order `order_01KYMGKM1HH9KE5BYQD8XSA7D4`: CAD, CA, one OMS record, passed.
- USA safe fixture `order_01KYMGHK6YKVKPWWMG8XZMQTFF`: USD, US, one OMS record, passed. It is unpaid and tagged `oms_verification_fixture`, `safe_test_order`, and `created_by=verify-oms-foundation`.

## Vendor splitting result

Existing order `order_01KWQ4M7EY0XGZAV2F3BSK1KKW` resolved into exactly two operational groups: one linked vendor and one `PLATFORM` group. Repeated ingestion retained exactly two vendor orders and two groups. No duplicate native financial order was created for the split.

## Fulfillment and inventory visibility

Physical vendor orders are evaluated against:

- vendor-to-stock-location links, or platform stock locations for `PLATFORM` items;
- available inventory (`stocked_quantity - reserved_quantity`) and backorder/inventory settings;
- stock-location address country;
- shipping service-zone country;
- order sales-channel linkage.

The location graph was verified at runtime. Compatible assignments store the Medusa stock location and visible reservation IDs for the order's own line items. Inventory is never deducted manually. Missing or incompatible capacity puts only the affected vendor order on hold, emits `NO_FULFILLMENT_LOCATION`, and prevents parent allocation.

## Timeline and audit

Supported event types include all requested Phase 3A events plus `NO_FULFILLMENT_LOCATION`. Events are append-only. Structured logs use:

- `[OMS_ORDER_INGESTED]`
- `[OMS_VENDOR_ORDER_CREATED]`
- `[OMS_STATUS_CHANGED]`
- `[OMS_TRANSITION_REJECTED]`
- `[OMS_ORDER_ON_HOLD]`
- `[OMS_FULFILLMENT_ASSIGNED]`

No payment credentials, passwords, tokens, or private customer credentials are logged.

Runtime verification recorded timelines for every tested order. An invalid `PENDING -> DELIVERED` transition returned 409 and added a rejection event. A valid `PENDING -> CONFIRMED` transition returned 200.

## API and role isolation verification

### Admin

- Authenticated list returned HTTP 200 and four OMS orders.
- Unauthenticated list returned HTTP 401.
- Detail hydration includes vendor orders, item groups, fulfillment assignments, timeline, cancellation requests, and return requests.

### Vendor

- Authenticated own-order list returned HTTP 200.
- Unauthenticated list returned HTTP 401.
- Attempting to read another vendor's OMS order returned HTTP 403.
- Shipment requires carrier and tracking number; digital-only orders cannot create physical shipments.
- Vendor responses do not contain parent payment mutation capabilities or customer-private address/payment data.

### Customer

- Routes require both a valid publishable API key and authenticated customer.
- An authenticated customer attempting to read another customer's OMS order received HTTP 404.
- Customer responses contain only display/order date, region, currency, total, OMS status, shipment summaries, and allowlisted timeline events. Internal metadata, actor IDs, vendor IDs, and internal error events are removed.

## Tests

Final focused command covered OMS, regional price safety, and decimal-price regression suites.

- Test suites passed: 3
- Tests passed: 47
- Tests failed: 0
- OMS-specific tests: 20 passed

Coverage includes the 17 requested cases, database-level duplicate and append-only protections, service-zone/sales-channel location policy, and customer timeline redaction.

## Build and runtime verification

- `npm.cmd run build`: passed; backend and Admin frontend compiled.
- `npm.cmd run db:migrate`: passed; OMS migration applied.
- `npm.cmd run verify:shipping-checkout`: passed; a cart completed to `order_01KYMGKM1HH9KE5BYQD8XSA7D4` with shipping and the system payment provider.
- `GET /health`: HTTP 200 with `status=ok` in development runtime.
- OMS verification script: Canada passed, USA passed, multi-vendor passed, idempotence passed, timeline passed, and location-policy graph passed.
- Active OMS rows after verification: 32 (`4` orders, `5` vendor orders, `5` groups, `17` events, `1` assignment).

## Remaining blockers

None for Phase 3A acceptance. Native carrier integrations, warehouse orchestration UI, POS, and broader omnichannel behavior remain future-phase work and were intentionally not added here.

## Final JSON

`[PHASE_3A_OMS_FOUNDATION_DONE]`

```json
{
  "status": "PASSED",
  "moduleRegistered": true,
  "migrationApplied": true,
  "orderIngestionWorking": true,
  "vendorSplitWorking": true,
  "regionCurrencySafetyPassed": true,
  "timelineWorking": true,
  "adminApisWorking": true,
  "vendorApisWorking": true,
  "customerApisWorking": true,
  "idempotencePassed": true,
  "testsPassed": 47,
  "testsFailed": 0,
  "buildPassed": true,
  "databaseWrites": 32,
  "remainingBlockers": [],
  "nextPhaseAllowed": true
}
```
