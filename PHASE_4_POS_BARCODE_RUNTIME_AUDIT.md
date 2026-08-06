# Phase 4 POS Barcode Runtime Audit

Captured before behavioral code changes on 2026-07-29 (Asia/Calcutta).

## Safe runtime context

- Backend `GET /health`: HTTP 200, `status=ok`.
- Browser request for `/pos/sell`: redirected to `/pos/login`.
- Visible authentication state: logged out; no authenticated operator identity was available.
- No password, token, cookie, JWT, or authorization header was inspected or recorded.
- Active registers in the live Medusa database:
  - Canada: `01KYMKWP9FAB13SGT4Z5XTW6R2`, CAD, region `reg_01KVJF9HSCYKAZC677GH1AC6C8`, location `sloc_01KVJF9HWWJ38MPAFDGH5YB0W1`.
  - USA: `01KYMKWP9T4YWNMZA47AZNQSY3`, USD, region `reg_01KXT623CTGM9NJJYK2G4DQW7E`, location `sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ`.
- Operator assignments present: 2. The initial supported setup assigns one explicit Admin user to both registers; no automatic all-operator assignment occurs.
- Persisted frontend state implementation before the fix: staff and register records are independently restored from `sessionStorage`; the POS token is stored separately; `/pos/sell` checks only for a staff object and a register ID and does not revalidate the selected register against `/pos/me/registers`.

```text
[POS_BARCODE_RUNTIME_CONTEXT]
{
  "operatorAuthenticated": false,
  "operatorId": "",
  "operatorRole": "",
  "selectedRegisterId": "",
  "selectedRegisterName": "",
  "registerRegionId": "",
  "registerCurrency": "",
  "registerStockLocationId": "",
  "assignmentExists": false,
  "assignmentActive": false,
  "sessionExists": false,
  "sessionStatus": "",
  "sessionOperatorId": "",
  "contextConsistent": false,
  "blockers": [
    "The browser has no authenticated POS operator session",
    "Selected register and register-session identity cannot be trusted while logged out",
    "Pre-fix sell-route protection does not revalidate persisted register authorization"
  ]
}
```

Unknown fields are intentionally blank rather than inferred from stale frontend state or repository credentials.

## Post-fix read-only database and Store API evidence

This evidence is deliberately separated from the unauthenticated browser context above. It proves database configuration and regional product data, but it does not pretend that the browser is logged in.

- USA register: 01KYMKWP9T4YWNMZA47AZNQSY3, active, USD, region reg_01KXT623CTGM9NJJYK2G4DQW7E, stock location sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ.
- One explicit active Admin assignment exists for that register. No assignment was created or changed during this incident.
- One existing OPEN session is stored for that assigned Admin. Because the browser is logged out, session ownership could not be bound to a current browser operator.
- Chocolate / Standard resolves exactly to barcode 999999999, is published, is linked to the POS sales channel, has a stored USD price of 16.99, and the USA Store API calculated price is USD 16.99.
- The USA register stock location has no inventory level for this variant, so USA available quantity is 0.
- The Admin-reported 1065 is the global sum across inventory locations. The current Admin barcode page is not register-specific. No Canada/global quantity was treated as USA stock.
- The read-only Medusa audit emitted all markers successfully. Its Windows process subsequently exited non-zero because of a libuv closing-handle assertion after script completion; no audit calculation failed and no write was made.

```text
[POS_BARCODE_MANUAL_LOOKUP_CONTROL]
{
  "code": "999999999",
  "operatorAuthorized": false,
  "registerAuthorized": false,
  "sessionValid": false,
  "httpStatus": 0,
  "errorCode": "POS_UNAUTHENTICATED",
  "productFound": false,
  "variantFound": false,
  "regionalPricePassed": false,
  "locationInventoryPassed": false,
  "passed": false
}
```

The manual lookup was not sent because the exact stop rule requires an authorized POS login first.

```text
[USA_POS_CHOCOLATE_AUDIT]
{
  "productId": "prod_01KXJNH57CMPRBEVGSAMB30EMF",
  "variantId": "variant_01KXJNH5ASR8XNZ9QSW29B8SJ7",
  "barcodeMatches": true,
  "published": true,
  "posChannelLinked": true,
  "usdPriceAvailable": true,
  "calculatedCurrency": "usd",
  "usaStockLocationId": "sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ",
  "usaAvailableQuantity": 0,
  "adminDisplayedQuantity": 1065,
  "adminQuantityIsRegisterSpecific": false,
  "crossRegionFallbackDetected": false,
  "blockReason": "USA_LOCATION_INVENTORY_NOT_FOUND",
  "passed": false
}
```
