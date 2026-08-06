# Catalog And Regional Price Implementation Report

## Catalog Classification

- Total catalog rows: 147
- Real grocery: 45
- Real apparel: 20
- Real digital: 18
- Test/debug: 61
- Uncertain: 3
- Cleanup candidates: 61

## Price Audit

- Major-unit product pricing retained throughout.
- Grocery missing CAD and USD pricing is retained for merchant review; no value was inferred or converted.
- The three verified products are preserved: Chocolate CAD 22 / USD 16.99, Organic Apples CAD 4.99 / USD 3.99, Organic OIL CAD 25 / USD 18.99.

## Read-only Verification

- Grocery validator: valid. 45 rows, 3 approved, 42 pending, 0 invalid rows, 0 stale snapshots, 0 planned price writes.
- Grocery importer dry-run: all three approved rows are `SKIP/SKIP`; price writes: 0.
- Test cleanup dry-run: 61 pending rows, 0 planned actions, catalog writes: 0.
- Apply commands were not executed.

## Merchant Next Steps

1. Review `backend/reports/real-grocery-price-remediation.csv` using `CATALOG_PRICE_EDITING_GUIDE.md`.
2. Enter only merchant-confirmed CAD and USD amounts and set only reviewed rows to `approved`.
3. Run the validator and dry-run again, then separately authorize an apply implementation only after reviewing its planned actions.

## Files Created

- `backend/reports/storefront-catalog-classification.csv`
- `backend/reports/real-grocery-price-remediation.csv`
- `backend/reports/test-products-storefront-cleanup.csv`
- `CATALOG_PRICE_EDITING_GUIDE.md`
