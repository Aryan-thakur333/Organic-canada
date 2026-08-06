# Phase 4 POS Catalog Barcodes Report

Date: 2026-07-28  
Medusa target: 2.13.6  
Status: **PARTIAL**

The production-safe identifier audit, deterministic internal Code 128 suggestion rules, approval importer, duplicate/checksum protection, authenticated Admin management page, protected Code 128 label endpoint, browser print sheet, and regression coverage are implemented. No barcode, SKU, UPC, EAN, price, inventory, or sales-channel value was changed during execution.

The final gate remains partial because the catalog contains no approved barcode-assignment rows and Fresh Bananas is not currently linked to the POS sales channel. The implementation correctly refuses to infer that catalog eligibility or invent an official UPC/EAN.

## Implemented files

### Catalog workflow

- `backend/src/scripts/audit-product-variant-identifiers.ts`
- `backend/src/scripts/generate-missing-internal-barcodes.ts`
- `backend/src/scripts/import-approved-variant-barcodes.ts`
- `backend/src/scripts/lib/variant-barcodes.ts`
- `backend/src/scripts/lib/variant-barcode-import.ts`
- `backend/reports/product-variant-barcode-audit.csv`

### Admin and label generation

- `backend/src/api/admin/barcodes/variants/route.ts`
- `backend/src/api/admin/barcodes/variants/[variantId]/route.ts`
- `backend/src/api/admin/barcodes/variants/[variantId]/label/route.ts`
- `backend/src/admin/routes/barcode-labels/page.tsx`

### Tests

- `backend/src/scripts/lib/__tests__/variant-barcodes.unit.spec.ts`
- `backend/src/scripts/lib/__tests__/variant-barcode-import.unit.spec.ts`
- `backend/src/api/__tests__/barcode-admin.unit.spec.ts`

## Dependency

- Installed `bwip-js@4.11.2` as the only backend label generator.
- No secondary barcode image library was installed.
- Existing `@zxing/browser` remains the POS camera reader and is not used for label rendering.

## Live catalog audit

The read-only audit produced:

```json
{
  "productsAudited": 131,
  "variantsAudited": 148,
  "barcodePresent": 3,
  "skuOnly": 128,
  "allIdentifiersMissing": 17,
  "duplicateBarcodes": 0,
  "duplicateSkus": 0,
  "notPosEligible": 145,
  "databaseWrites": 0
}
```

The CSV contains the required 17 columns. `approved_action`, `approved_barcode`, and notes remain blank unless an authorized reviewer supplies them. Refreshes preserve existing approvals and stable suggestions by variant ID.

### Fresh Bananas finding

- Product: Fresh Bananas
- Product status: published
- Variant: Standard
- SKU: `EATSIE-FRESH-BANANAS`
- Barcode/UPC/EAN: missing
- Inventory available in the catalog: 50
- POS sales-channel linked: false
- Classification: `NOT_POS_ELIGIBLE`

For that reason, the workflow did not suggest or assign an internal barcode. POS eligibility is a separate merchant/catalog decision and was not inferred.

## Identifier ownership and validation

Supported ownership types:

- `OFFICIAL_RETAIL`: merchant-supplied UPC/EAN with checksum validation.
- `INTERNAL_CODE128`: Eatsie internal identifiers stored only in `variant.barcode`.

Internal identifiers allow only uppercase `A-Z`, digits, and hyphens, with a 64-character limit and spreadsheet-formula protection. Deterministic suggestions combine human-readable catalog tokens with a SHA-256 token derived from the immutable variant ID. They are globally checked for collisions and remain stable across reruns.

Official UPC/EAN values are never generated. Leading zeroes remain strings and are checksum-tested without numeric conversion.

## Approval importer

Only rows with both of these values are eligible:

```text
approved_action = ASSIGN_INTERNAL_BARCODE
approved_barcode = valid approved internal Code 128 value
```

Before apply, the importer validates current variant/product existence, published POS eligibility, barcode format, duplicate ownership across barcode/UPC/EAN, recognized action, SKU/barcode/UPC/EAN snapshot freshness, POS eligibility freshness, and official checksum validity.

Apply behavior:

- requires explicit `--apply`
- requires `--backup-reference=<fresh-backup-reference>` when updates are planned
- uses `updateProductVariantsWorkflow`
- sends only variant ID and barcode to the catalog workflow
- creates a POS audit event for each applied row
- preserves SKU, UPC, EAN, prices, inventory, and sales channels
- recognizes already-applied values as idempotent no-ops
- blocks the complete apply when any duplicate, invalid, stale, or missing row exists

The verified dry-run result was:

```json
{
  "rowsRead": 148,
  "approvedRows": 0,
  "plannedUpdates": 0,
  "unchangedRows": 0,
  "duplicateValues": 0,
  "invalidRows": 0,
  "staleRows": 0,
  "missingVariants": 0,
  "databaseWrites": 0
}
```

Commands:

```powershell
cd D:\eatsie-project\backend
npm.cmd run audit:variant-barcodes
npm.cmd run generate:variant-barcodes
npm.cmd run import:variant-barcodes -- --file=reports/product-variant-barcode-audit.csv --dry-run
```

After an authorized approval, zero validation failures, and a fresh backup:

```powershell
npm.cmd run import:variant-barcodes -- --file=reports/product-variant-barcode-audit.csv --apply --backup-reference=<backup-reference>
```

No apply command was run in this task.

## Admin Barcode Labels page

The authenticated Medusa Admin extension is available at:

```text
http://localhost:9000/app/barcode-labels
```

It provides:

- product/SKU/barcode/UPC/EAN search
- missing-barcode filter
- duplicate summary and warning
- POS eligibility and stock availability
- identifier ownership type and last recorded update
- explicit internal barcode assignment for eligible variants
- merchant-approved UPC/EAN entry with checksum and duplicate validation
- label selection, quantity, size, preview, and printing
- scan-to-test exact identifier matching
- presets for 50×25 mm, 40×30 mm, thermal labels, and A4 sheets
- print CSS that hides Admin navigation and preserves label dimensions/quiet zones

The implementation uses browser print CSS rather than introducing a second PDF-generation stack.

All Admin APIs inherit the existing authenticated `/admin/*` middleware. Existing identifiers require an explicit replacement confirmation and are never silently overwritten.

## Protected label endpoint

```text
GET /admin/barcodes/variants/:variantId/label
```

Supported parameters:

- `format=svg|png`
- `width`
- `height`
- `include_price=true|false`
- `include_sku=true|false`
- `include_date=true|false`
- `currency=cad|usd`

Labels encode only the selected variant identifier and may show the store, product, variant, SKU, currency/price, and printed date. Customer and payment data are never included. Responses are private and non-cacheable.

## Authenticated runtime verification

- Barcode Labels Admin route loaded successfully.
- Summary displayed 148 variants, 145 missing barcodes, and zero duplicate barcodes.
- Fresh Bananas displayed as unassigned and not POS-eligible, with assignment disabled.
- Existing POS variant `OIL-20260706205845` displayed barcode `BC20260706205845` and local available quantity 97.
- Its protected 50×25 mm SVG Code 128 label loaded successfully at 189×94 rendered pixels.
- Admin scan-to-test matched the exact product and variant.
- Existing POS lookup priority, regional price, inventory, and duplicate cart increment remain covered by the prior authenticated runtime and current regression suite.

Fresh Bananas pilot assignment, label, and POS scan were not executed because no merchant approval exists and the variant is not POS-eligible.

## Verification

| Check | Result |
|---|---:|
| New focused tests | 24/24 passed |
| Full backend tests | 490/490 passed |
| Full frontend tests | 205/205 passed |
| Backend build | passed |
| Frontend build | passed |
| Audit database writes | 0 |
| Generator database writes | 0 |
| Importer dry-run database writes | 0 |
| Barcode label generation | passed for existing approved identifier |
| Fresh Bananas pilot | blocked/not run |

## Final marker

```text
[PHASE_4_POS_CATALOG_BARCODES_DONE]
{
  "status": "PARTIAL",
  "variantsAudited": 148,
  "variantsWithExistingBarcode": 3,
  "variantsMissingBarcode": 145,
  "internalBarcodesSuggested": 0,
  "approvedBarcodes": 0,
  "barcodesApplied": 0,
  "duplicateBarcodes": 0,
  "invalidBarcodes": 0,
  "labelGenerationPassed": true,
  "freshBananasPilotPassed": false,
  "posLookupPassed": true,
  "regionalPricePassed": true,
  "locationInventoryPassed": true,
  "cartIntegrationPassed": true,
  "backendTestsPassed": 490,
  "frontendTestsPassed": 205,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "databaseWrites": 0,
  "remainingBlockers": [
    "Fresh Bananas and 144 other variants are not currently linked to the POS sales channel",
    "The barcode audit CSV contains no merchant-approved ASSIGN_INTERNAL_BARCODE rows",
    "Fresh Bananas needs an approved internal barcode, POS eligibility approval, fresh database backup, apply dry-run, and physical scan before the pilot can pass"
  ]
}
```
