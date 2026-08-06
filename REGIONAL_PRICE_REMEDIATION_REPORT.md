# Regional Price Remediation Report

Date: 2026-07-21

## Root Cause

The USA catalog is correctly region-scoped, but 41 variants have no explicit USD price record. The Store API therefore returns no USD `calculated_price`, and the storefront correctly renders `Price unavailable in this region` rather than falling back to CAD.

Product price records use major units. Current CAD values such as `499`, `2200`, and `2500` are literal stored amounts and remain unchanged pending merchant approval. They are not inferred to mean decimal values.

## Approval Workflow Delivered

- Unified approval file: `backend/reports/merchant-approved-regional-prices.csv`
- Generator: `backend/src/scripts/report-merchant-approved-regional-prices.ts`
- Validator: `backend/src/scripts/validate-merchant-regional-prices.ts`
- Safe importer: `backend/src/scripts/import-approved-regional-prices.ts`
- Importer supports `dry-run` and explicit `apply`; apply reruns validation, creates CSV/JSON backups, changes only approved CAD/USD records, and verifies each write.

## Current Approval State

| Metric | Result |
| --- | --- |
| Production sales-channel variant rows | 147 |
| Approved rows | 0 |
| Pending rows | 147 |
| Planned CAD updates | 0 |
| Planned USD creates | 0 |
| Existing USD skips | 0 |
| Validation failures | 0 |
| Stale records | 0 |
| Conflicts | 0 |
| Database writes | 0 |

The unified file preserves manual values already present in the unified CSV. Legacy CAD/USD report values are imported only when they are valid numeric approval values. The current legacy approval cells are blank, so no values were merged.

## Current Regional Evidence

- Organic Apples: raw CAD `499`; USD missing.
- Organic OIL: raw CAD `2500`; USD missing.
- chocolate: raw CAD `2200`; USD missing.
- Medusa Sweatshirt baseline: CAD `10`, USD `15`; Store API returns the correct regional calculated currency and amount.

The existing regional verifier reports no sampled currency mismatch, amount mismatch, or CAD/USD fallback. It reports the three selected groceries as unavailable in USA, which is safe until USD values are approved.

## Dry Run

`npm.cmd exec medusa exec ./src/scripts/import-approved-regional-prices.ts dry-run`

Result: valid, 147 rows, 0 approved, 0 planned operations, 0 writes. The importer printed a row-level `SKIP` plan for every pending row.

## Frontend and Payment Safety

- Store API product calculated amounts remain major-unit values and are not divided by 100.
- Missing regional prices remain unavailable and cannot be represented as a fallback zero price.
- Region-scoped cart keys remain `cart_id:reg_01KVJF9HSCYKAZC677GH1AC6C8` and `cart_id:reg_01KXT623CTGM9NJJYK2G4DQW7E`.
- Cart/order/Stripe smallest-unit handling remains separate and unchanged.
- The previously run focused pricing/regional suite passed 34 tests, and the frontend production build passed.

## Remaining Approval

Populate only merchant-approved values in `backend/reports/merchant-approved-regional-prices.csv`:

- Set `approval_status` to `approved`.
- Enter a changed `approved_cad_price` only where CAD should change.
- Enter `approved_usd_price` only where a new USD selling price is approved.
- Leave all other values blank and pending.

No approved products or approved monetary values exist yet.

## Next Safe Commands

1. `npm.cmd exec medusa exec ./src/scripts/validate-merchant-regional-prices.ts`
2. `npm.cmd exec medusa exec ./src/scripts/import-approved-regional-prices.ts dry-run`
3. After the dry-run is reviewed, run only with explicit authorization:

```powershell
npm.cmd exec medusa exec ./src/scripts/import-approved-regional-prices.ts apply
```

This command will modify Medusa price records.
