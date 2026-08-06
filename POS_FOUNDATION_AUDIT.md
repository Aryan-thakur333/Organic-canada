# POS Foundation Audit

Audit date: 2026-07-28  
Medusa version: 2.13.6  
Database method: read-only Medusa module/query services (`src/scripts/audit-pos-foundation.ts`), with no direct SQL inserts.

## Result

```text
[POS_FOUNDATION_AUDIT]
```

```json
{
  "posSalesChannelExists": true,
  "posSalesChannelId": "sc_01KWSKACE7DEGMXG6GH1ZRSA4V",
  "posLocations": [
    { "id": "sloc_01KVJF9HWWJ38MPAFDGH5YB0W1", "name": "Canadaan Warehouse", "country_code": "CA" },
    { "id": "sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ", "name": "USA POS Store", "country_code": "US" }
  ],
  "posProducts": 3,
  "barcodeEnabledVariants": 3,
  "registerModuleExists": true,
  "cashPaymentProviderExists": false,
  "posFrontendExists": true,
  "remainingBlockers": [
    "No native cash payment provider; cash is recorded in the POS ledger while the native payment collection uses Medusa's supported mark-paid workflow",
    "The USA POS location intentionally has no inventory, so USA sales remain unavailable until real USD-priced U.S. stock is assigned",
    "Stripe Terminal is not configured or runtime-tested"
  ]
}
```

## Verified foundation

- Dedicated sales channel: `POS` (`sc_01KWSKACE7DEGMXG6GH1ZRSA4V`).
- Regions: Canada/CAD (`reg_01KVJF9HSCYKAZC677GH1AC6C8`) and USA/USD (`reg_01KXT623CTGM9NJJYK2G4DQW7E`).
- Registers: `CA-POS-01` and `US-POS-01`, both active and mapped to exactly one region, currency, sales channel, and location.
- Operator: `admin@eatsie.com` assigned as `ADMIN` to both registers.
- Candidate policy linked exactly three published, non-digital products that have barcode/UPC/EAN, an integer CAD price, and Canadian location inventory.
- USA inventory was not copied or invented. The U.S. register therefore cannot sell Canadian stock.
- Payment providers reported by Medusa: PayPal, Stripe variants, and `pp_system_default`. Stripe is disabled at runtime because `STRIPE_API_KEY` is absent.
- Existing insecure `/store/pos/*` write paths now return HTTP 410 and direct clients to authenticated `/pos/*` routes.

## Existing and added surfaces

- Backend: protected register/operator/session, catalog, inventory, customer, draft cart, promotions/manual discount, checkout, receipt, order, return/refund/exchange, reconciliation, admin monitoring, and audit APIs.
- Frontend: authenticated POS login, register selection/open, register-scoped selling, scanner hook, customer lookup, cash/manual-card entry, receipt print/email, order history, returns, and register close/reconciliation.
- Admin: `/app/pos` dashboard for registers, sessions, transactions, returns, and cash activity.

## Safety observations

- All POS amounts are validated as safe integers in minor units.
- Missing regional prices fail; they are never displayed as zero.
- Inventory is queried and reserved only at the register's stock location.
- The custom audit table rejects update/delete operations at the database trigger boundary.
- The local Event Bus and in-memory locking modules emit Medusa production warnings and must be replaced for horizontally scaled production deployment.
