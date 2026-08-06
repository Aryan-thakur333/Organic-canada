# Phase B — Personalized Products Implementation

Status: **implemented and disabled by default** (`FEATURE_PERSONALIZED_PRODUCTS=false`, `VITE_FEATURE_PERSONALIZED_PRODUCTS=false`).

## Delivered

- Region-aware authoritative quote API: `POST /store/personalizations/quote`.
- Cart-locking personalized add-to-cart path with server recalculation, normalized metadata, upload ownership checks and distinct personalization hashes.
- Private authenticated File Module upload/download path with random storage keys, 5 MiB limit, filename/extension/MIME validation, real image decoding, decoded-format verification and dimension limits.
- Additive migration `Migration20260730000002` for asset ownership/file references, field adjustment type, cart/order snapshots, upload references, statuses and production notes.
- Product/variant template fallback, field configuration limits, integer minor-unit surcharges and archive-instead-of-delete behavior.
- Idempotent order-item snapshot preservation and vendor status workflow.
- Admin order widget showing values, private image previews, surcharge, production notes and status.
- Storefront server-quote debounce, image upload/preview, required-field gating, authoritative price display and normalized add-to-cart payload.

## Verification

- Database migration: passed on 2026-07-30.
- Focused personalization production contract: 7/7 tests passed.
- Frontend production build: passed.
- TypeScript: no new errors; the same four unrelated pre-existing POS/barcode errors remain.

## Activation constraint

Keep both feature flags disabled until an authenticated acceptance run is completed against the deployed File Module provider and real regional product/template fixtures. This environment did not contain an approved live personalized fixture or production object-storage credentials, so live upload/cart/order acceptance is not claimed.
