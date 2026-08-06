# Regional Price CSV Regeneration Report

Date: 2026-07-21

## Result

The approval CSV was regenerated as UTF-8, comma-delimited CSV. No Medusa price records were changed and no apply command was run.

## Source and Backup

- Original delimiter: tab
- Original headers: `product_id`, `product_handle`, `product_title`, `variant_id`, `variant_title`, `current_cad_price`, `approved_cad_price`, `current_usd_price`, `approved_usd_price`, `approval_status`
- `merchant_note` missing from source: yes
- Backup: `D:\eatsie-project\backend\reports\backups\merchant-approved-regional-prices-before-regeneration-20260721-134023.csv`
- Regenerated file: `D:\eatsie-project\backend\reports\merchant-approved-regional-prices.csv`
- Final delimiter: comma
- Final encoding: UTF-8

Final header:

```text
product_id,product_handle,product_title,variant_id,variant_title,current_cad_price,approved_cad_price,current_usd_price,approved_usd_price,approval_status,merchant_note
```

## Temporary File Validation

The temporary CSV was reparsed before replacement. It contained 147 rows, the exact 11 headers, no duplicate variant IDs, valid statuses, three approved target variants, and 144 pending rows.

## Validation and Dry Run

| Metric | Result |
| --- | --- |
| Total rows | 147 |
| Approved rows | 3 |
| Pending rows | 144 |
| Review / rejected rows | 0 / 0 |
| Duplicate variants | 0 |
| Invalid statuses | 0 |
| Validator failures | 0 |
| Planned CAD updates | 3 |
| Planned USD creates | 3 |
| Database writes | 0 |
| Apply executed | no |

Planned operations:

- chocolate: CAD `2200` -> `22`; USD missing -> `16.99`.
- Organic Apples: CAD `499` -> `4.99`; USD missing -> `3.99`.
- Organic OIL: CAD `2500` -> `25`; USD missing -> `18.99`.

## Tests

`regenerate-merchant-regional-prices-csv.unit.spec.ts`: 18 passed. Coverage includes both delimiters, BOM, CRLF, quoted fields, blanks, missing source headers, invalid statuses, duplicate IDs, atomic replacement, backup creation, exact headers, and generated-file reparse.

## Files

Created or updated:

- `backend/src/scripts/lib/regenerate-merchant-regional-prices-csv.ts`
- `backend/src/scripts/regenerate-merchant-regional-prices-csv.ts`
- `backend/src/scripts/lib/__tests__/regenerate-merchant-regional-prices-csv.unit.spec.ts`
- `backend/reports/merchant-approved-regional-prices.csv`
- `backend/reports/backups/merchant-approved-regional-prices-before-regeneration-20260721-134023.csv`

No frontend formatter, Stripe conversion, Medusa price, catalog, inventory, or sales-channel record was modified.
