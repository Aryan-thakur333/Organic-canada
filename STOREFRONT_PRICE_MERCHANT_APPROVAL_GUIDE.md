# Storefront Price Merchant Approval Guide

Use [storefront-regional-price-merchant-review.csv](D:\eatsie-project\backend\reports\storefront-regional-price-merchant-review.csv) to approve a specific USD or CAD price. All product amounts are **major-unit decimals**: enter `3.99`, `16.99`, or `22.00`.

Do not enter cents such as `399` or `1699`. Do not enter currency symbols, commas, zero, negative values, exchange-rate calculations, or guessed prices.

## CSV Columns

Do not edit: `product_id`, `product_title`, `product_handle`, `variant_id`, `variant_title`, `product_type`, `category`, `current_usd`, `current_cad`, `usd_status`, `cad_status`, and `review_flags`.

Merchant-editable columns:

- `approved_usd`: an explicit merchant-approved USD price.
- `approved_cad`: an explicit merchant-approved CAD price.
- `merchant_notes`: a short decision note or source.
- `approved`: exactly `true` or `false`.

Leave `suggested_usd` and `suggested_cad` blank unless your organization has an independently approved source. Blank approved values remain pending even if a row is reviewed. High-value flags are warnings only; they do not mean a stored price is wrong.

| current_usd | current_cad | approved_usd | approved_cad | approved | result |
| --- | --- | --- | --- | --- | --- |
| blank | 4.99 | 3.99 | blank | true | Create USD only |
| 16.99 | 22.00 | blank | blank | false | No action |
| 1000 | 1200 | 19.99 | 24.99 | true | Update both after review |
| blank | blank | blank | blank | false | Pending |

## Safe Future Workflow

1. Enter only merchant-approved values and set `approved=true` for the intended rows.
2. Run `cd D:\eatsie-project\backend` then `npm.cmd exec medusa exec ./src/scripts/validate-storefront-regional-price-merchant-review.ts`.
3. Review `npm.cmd exec medusa exec ./src/scripts/import-approved-storefront-regional-prices.ts dry-run`.
4. Generate a reviewed backup with `npm.cmd exec medusa exec ./src/scripts/backup-storefront-regional-prices.ts`.
5. Only after explicit authorization, run the guarded importer with its required apply argument and environment confirmation.
6. Verify the affected Store API prices after the import.
7. Use `npm.cmd exec medusa exec ./src/scripts/rollback-storefront-regional-price-batch.ts batch=<exact-batch-id>` only to plan a rollback for one reviewed batch.

Save as UTF-8 comma-delimited CSV and preserve the header order. Never change IDs or current-price snapshot columns.
