# Phase 2 Regional Price Completion

This document summarizes the outcomes of the multi-region product price seeding and cleanup audits.

---

## 1. Product Pricing Metrics

* **Original Exported Gaps**: 125 gaps in `missing-region-prices.csv`.
* **Production Storefront Row Count**: 38 variants.
* **Excluded Test Row Count**: 28 variants (plus 25 debug variants).
* **Digital Review Count**: 63 digital gaps reviewed (5 legitimate digital products, 58 test/debug/E2E/empty digital variants).
* **USD Prices Created (Storefront)**: 38 prices created locally via `--apply` run.
* **CAD Storefront Coverage (Before/After)**: 70 / 70 variants priced (100%).
* **USD Storefront Coverage (Before/After)**: 32 / 70 variants priced (Before) -> 70 / 70 variants priced (After).

---

## 2. Product Price Spot Checks

| Product | Variant | CAD Amount | CAD Display | USD Amount (Converted) | USD Display | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Organic Apples** | Standard | `499` | `CA$4.99` | `364` | `$3.64` | Converted at 0.73, rounded |
| **Fresh Bananas** | Standard | `299` | `CA$2.99` | `218` | `$2.18` | Converted at 0.73, rounded |
| **Organic Carrots** | Standard | `399` | `CA$3.99` | `291` | `$2.91` | Converted at 0.73, rounded |
| **Organic Milk** | Standard | `649` | `CA$6.49` | `474` | `$4.74` | Converted at 0.73, rounded |
| **Chicken Breast** | Standard | `1299` | `CA$12.99` | `948` | `$9.48` | Converted at 0.73, rounded |

---

## 3. Database Backup Command

To backup the database prior to applying price modifications, run:

```powershell
pg_dump `
  -U postgres `
  -d medusa-backend `
  -F c `
  -f "D:\eatsie-project\backups\before-usd-price-import.backup"
```

---

## 4. Gaps and Cleanup Warnings
* Non-mandatory cleanup items (debug items `kdksks`, `abcd`, old E2E digital books, empty digital downloads) remain in the DB and are safely ignored by the storefront classification filter in `audit-multi-region.ts`. They will not affect the production launch.
