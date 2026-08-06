# TODO - Digital download entitlement backfill + runtime verification

## Step 1: Analyze current digital entitlement flow
- [x] Inspect `GET /store/customers/me/downloads` response shape
- [x] Inspect `backend/src/subscribers/order-placed.ts` entitlement creation logic
- [x] Inspect `backend/src/scripts/backfill-digital-downloads.ts` backfill logic
- [x] Inspect `backend/src/api/store/downloads/[id]/route.ts` download payment unlock rule

## Step 2: Implement fixes (approved scope)
- [x] Fix digital detection in `backend/src/subscribers/order-placed.ts` to check:
  - item.metadata.is_digital + item.metadata.download_assets
  - variant.metadata.is_digital + variant.metadata.download_assets
  - product.metadata.is_digital + product.metadata.download_assets
  - product.metadata.digital_asset_key fallback
- [x] Fix asset extraction in `backend/src/subscribers/order-placed.ts`:
  - extract download_assets from item/variant/product metadata
  - support digital_asset_key fallback
  - preserve non-duplicate DigitalOrderDownload creation behavior
- [x] Fix payment unlock rule in `backend/src/api/store/downloads/[id]/route.ts`:
  - allow payment_status: captured, paid, partially_refunded
  - do NOT require order.status === "completed"
- [x] Fix backfill in `backend/src/scripts/backfill-digital-downloads.ts`:
  - scan paid/captured/partially_refunded digital orders
  - create missing dld_xxx records without duplicates
  - include improved metadata fields: order_id, customer_id, line_item_id, product_id, variant_id, asset_id, filename, storage_key, remaining_downloads, download_limit, status
  - print created/skipped/error counts

## Step 3: Run backfill + verify
- [x] Run backfill:
  - Ran via compiled artifact (source uses `.js`-suffix imports that fail under `medusa exec` TS loader):
    - `npm exec medusa exec ./.medusa/server/src/scripts/backfill-digital-downloads.js`
  - Result: `scanned=108 | digitalOrdersFound=31 | recordsCreated=0 | recordsUpdated=32 | recordsSkipped=0 | errors=0`
- [x] Rerun verification (tokens from `node scripts/setup-verify-digital-b2b.mjs`):
  - `CUSTOMER_TOKEN=... B2B_TOKEN=... node scripts/verify-authenticated-digital-b2b.mjs`
  - ✅ AUTH VERIFIED SUMMARY:
    - digital: dld_xxx found, blob download 200, remaining_downloads 5→4
    - b2b: companyStatus=approved, productsCount=48, quotesStatus=200
- [x] Confirm expected outcomes:
  - /store/customers/me => 200 ✅
  - /store/customers/me/downloads => 200 with at least one dld_xxx ✅
  - /store/downloads/dld_xxx => 200 blob/file ✅
  - remaining_downloads decrements ✅
  - logged-out download => 401 ✅
  - different customer => 403 ✅
  - direct /uploads/digital/<file> => 404 ✅
