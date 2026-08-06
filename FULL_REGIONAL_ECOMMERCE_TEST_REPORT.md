# Full Regional Ecommerce Test Report

Date: 2026-07-21

## Scope and safety

- No product, variant, price, inventory, sales-channel, cart, payment, or order data was modified.
- No CAD-to-USD conversion, price generation, price copy, universal scaling, importer `apply`, or CAD correction apply command was run.
- Product catalog prices are confirmed to use **major units**. `499` and `2200` are therefore reported as the literal stored values, not interpreted as `4.99` or `22.00`.
- Stripe/cart/order totals retain their separate minor-unit conversion paths.

## Environment

| Check | Status | Evidence |
| --- | --- | --- |
| Node/npm | PASS | Node `v24.4.1`; npm `11.4.2` |
| Backend health | PASS | `GET http://localhost:9000/health` returned HTTP 200 |
| Medusa Admin reachability | PASS | `GET http://localhost:9000/app` returned HTTP 200 |
| Frontend reachability | PASS | `GET http://localhost:5173/shop/canada` returned HTTP 200 |
| Frontend production build | PASS | `npm.cmd run build` completed successfully |

## Price and data validation

| Check | Status | Result |
| --- | --- | --- |
| USD importer dry-run | PASS | 41 rows, 41 unique variants, 41 blank suggestions, 0 planned creates, 0 planned updates, 0 failures |
| CAD correction dry-run | PASS | 63 rows, 63 blank approvals, 0 planned updates, 0 failures |
| Catalog cleanup validation | PASS | 133 rows, all approvals blank, no validation failures or stale memberships |
| Duplicate review | PARTIAL | Existing report contains 16 duplicate groups / 54 products; no merge or removal approval exists |
| Before/after database counts | PASS | Unchanged: 133 products, 148 variants, 172 price records, 132 CAD, 39 USD, 132 production-channel products |

`backend/reports/suspicious-cad-prices.csv` was inspected. Its `approved_corrected_cad_price` column remains blank in the reviewed rows. No correction is authorized until a merchant explicitly supplies that column.

## Regional Store API verification

Contexts:

- Canada: `reg_01KVJF9HSCYKAZC677GH1AC6C8`, `ca`, `cad`
- USA: `reg_01KXT623CTGM9NJJYK2G4DQW7E`, `us`, `usd`

| Product | Variant | Canada result | USA result | Status |
| --- | --- | --- | --- | --- |
| Medusa Sweatshirt | S, M, L, XL | CAD `10` / calculated CAD | USD `15` / calculated USD | PASS |
| Organic Apples | Standard | CAD `499` / calculated CAD | no calculated USD price | PASS: unavailable, no fallback |
| Organic OIL | Standard | CAD `2500` / calculated CAD | no calculated USD price | PASS: unavailable, no fallback |
| chocolate | Standard | CAD `2200` / calculated CAD | no calculated USD price | PASS: unavailable, no fallback |

Verifier summary: 14 variants checked; 7 valid CAD checks; 4 valid USD checks; 3 expected missing-price checks; 0 currency mismatches; 0 amount mismatches; 0 fetch failures; 0 writes. Store API isolation is confirmed for the sampled products: Canada returned CAD only and USA returned USD only or an unavailable price.

## Frontend QA

| Check | Status | Result |
| --- | --- | --- |
| Major-unit product price rendering | PASS | Focused Vitest suite: 34/34 tests passed; includes `0`, `4.99`, `10`, `22`, `499`, `2200`, USD values, unavailable, and negative-value guard cases |
| No raw-price regional fallback | PASS | Unit tests and live Store API verification confirm unavailable state without USD |
| Listing request race safety | PASS | Canada-to-USA and USA-to-Canada stale-request guard tests pass |
| Region-scoped cart storage/hydration | PASS | Focused tests verify separate region keys and cart-currency hydration; cart totals remain minor-unit converted once |
| Browser listing smoke check | PASS | `/shop/canada` showed CAD values; `/shop/usa` showed the selected missing-USD products as `Price unavailable in this region` with disabled purchase controls |
| Product detail/cart/checkout interaction | NOT_RUN | No test cart or payment was created; browser test was deliberately read-only |
| Accessibility keyboard/focus audit | NOT_RUN | No dedicated automated accessibility runner is configured |

One test-proven safe frontend guard was added: a negative product `calculated_amount` is now unavailable rather than rendered as a sellable price. Valid major-unit amounts are unchanged.

## Full frontend suite

Status: PARTIAL. `npm.cmd test` completed with 106 passed and 19 failed tests across three existing suites:

- `checkoutPaymentSession.test.js`: two assumptions do not match the current commission-refresh recovery behavior.
- `pages/vendor/Orders.test.jsx`: sixteen tests use incomplete/outdated `vendorApi` mocks (`getStockLocations` is absent).
- `apiClientAuthHeaders.test.js`: expects a hard-coded publishable key while the client correctly applies the configured key.

These failures are outside the regional pricing surface and were not changed without an isolated, safe behavioral requirement.

## Remaining manual approvals and blockers

1. Provide merchant-approved USD values in `backend/reports/missing-usd-prices.csv` before any USD import. All 41 suggestions are blank, so no import is planned.
2. Provide merchant-approved CAD correction values in `backend/reports/suspicious-cad-prices.csv` before any CAD correction. Do not infer intent from values such as `499` or `2200`.
3. Review the 16 duplicate groups / 54 products and explicitly approve each cleanup action.
4. Resolve the three unrelated frontend test-suite failures before using the full-suite result as a release gate.
5. Perform a controlled cart/checkout test only with an approved test product and test payment method; do not use a live customer cart.

## Final JSON

```json
{
  "status": "PARTIAL",
  "moneyUnit": "major",
  "databaseCountsUnchanged": true,
  "frontendBuildPassed": true,
  "focusedRegionalTestsPassed": true,
  "fullFrontendSuitePassed": false,
  "fullFrontendSuite": { "passed": 106, "failed": 19 },
  "regionalStoreApi": {
    "status": "PASS",
    "variantsChecked": 14,
    "validCadChecks": 7,
    "validUsdChecks": 4,
    "missingUsdChecks": 3,
    "currencyMismatches": 0,
    "amountMismatches": 0,
    "writesPerformed": 0
  },
  "usdDryRun": { "rows": 41, "approved": 0, "blank": 41, "plannedCreates": 0, "plannedUpdates": 0, "failures": 0 },
  "cadDryRun": { "rows": 63, "approved": 0, "blank": 63, "plannedUpdates": 0, "failures": 0 },
  "catalogCleanup": { "rows": 133, "approved": 0, "validationFailures": 0 },
  "noPriceOrCatalogWrites": true
}
```
