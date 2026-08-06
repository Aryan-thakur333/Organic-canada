# Storefront Region Pricing Fix Report

## Result

- Product money unit: major units. Product display values are never divided or multiplied by 100.
- Canada route resolves `reg_01KVJF9HSCYKAZC677GH1AC6C8` / `cad`; USA resolves `reg_01KXT623CTGM9NJJYK2G4DQW7E` / `usd`.
- Listing and search requests pass the selected `region_id`, `country_code`, and request fields include `variants.calculated_price.*` and `variants.prices.*`.
- The shared resolver accepts only same-currency calculated or explicit variant prices. It never uses the first raw price as a fallback.
- Listing uses an AbortController, ignores expected cancellation, and only updates the latest active request. React Strict Mode cancellation remains supported.
- The browser listener message was not traced to an application bundle. Validate it separately in Incognito with extensions disabled; no application-side suppression was added.

## Live Audit

- Published production-channel products: 130
- Variants: 147
- CAD present / missing: 132 / 15
- USD present / missing: 42 / 105
- Suspicious CAD / USD findings: 79 / 121
- Duplicate or conflicting currency records: 0
- Money unit is major; unusually large values are reported as catalog-data findings, never silently scaled.
- Database writes: 0

## Approved Product Store API Checks

| Product | Canada calculated price | USA calculated price | Result |
| --- | --- | --- | --- |
| Organic Apples | CAD 4.99 | USD 3.99 | valid, no fallback |
| Organic OIL | CAD 25 | USD 18.99 | valid, no fallback |
| chocolate | CAD 22 | USD 16.99 | valid, no fallback |
| Medusa Sweatshirt | CAD 10 | USD 15 | valid, no fallback |

The verifier made 7 valid CAD and 7 valid USD checks with no fetch failures, currency mismatches, or amount mismatches.

## Browser Checks

- `/shop/usa`: chocolate displayed `$16.99`; unavailable products still displayed `Price unavailable in this region`.
- `/shop/canada`: chocolate displayed `$22.00`; unavailable products still displayed `Price unavailable in this region`.
- Product-card and cart eligibility now share the currency-safe resolver; a missing regional price cannot be added as a zero-priced item.

## Safety Workflow

- `backend/reports/storefront-regional-price-audit.csv` is the read-only catalog audit.
- `backend/reports/merchant-storefront-price-remediation.csv` is the merchant approval input. Three existing approved rows are preserved and already match current Medusa records.
- Validator: 147 total rows, 3 approved, 144 pending, 0 stale snapshots, 0 conflicts, 0 planned writes.
- Importer dry-run: the three approved rows are `SKIP/SKIP`; writes performed: 0.
- Apply was not executed.

Remaining action: obtain explicit merchant CAD/USD approvals for the missing and suspicious variants before any future `apply` command.
