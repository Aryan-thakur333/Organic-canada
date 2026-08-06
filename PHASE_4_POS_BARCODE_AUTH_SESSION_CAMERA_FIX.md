# Phase 4 POS Barcode Auth, Session, and Camera Fix

Date: 2026-07-29  
Result: PARTIAL

The implementation, full automated suites, both production builds, backend health, and logged-out route protection pass. End-to-end runtime is intentionally not marked passed because no authorized POS browser credentials were supplied, no physical Code 128 scan was performed, and chocolate has no inventory level at the USA register stock location.

## Root-cause analysis

1. The browser persisted staff, register, and token state independently. The sell-route guard trusted the restored staff/register objects without revalidating the selected register against the canonical authenticated user and GET /pos/me/registers.
2. POS authorization logic was distributed. Routes compared assignments directly against auth_context.actor_id but had no shared identity resolver, consistent role/permission result, or precise assignment/register-scope errors.
3. GET /pos/registers/:id/session used a required-open-session guard. A normally closed register therefore returned 409 instead of 200 with session null.
4. Register selection treated broad 403/404/409 responses as a reason to POST open. Repeated effects or retries could produce a conflicting open request. Same-operator repeat open was not explicitly idempotent.
5. Barcode lookup normalized the code before completing authorization and did not centralize the required auth, register, assignment, and session order.
6. Exact catalog resolution could hide an identifier behind a sales-channel filter and report NOT_FOUND instead of PRODUCT_NOT_IN_CHANNEL. Missing-price and wrong-currency states were not distinct, and an out-of-stock product could still be returned to the scanner.
7. Camera/manual/hardware inputs did not consistently identify their source through one guarded lookup function. ZXing frame misses were not explicitly classified as expected continuous-decoder events.
8. Backend health used interval-style polling without a single-flight AbortController lifecycle and exponential retry.
9. The return page could call preview without a complete order/item selection. It was isolated from sell, but lacked an explicit enabled condition and resilient 404 regression coverage.
10. The Admin barcode page's “Available: 1065” is a global location sum. The USA register location has no inventory level for chocolate, so using 1065 for USA would be a cross-region/global fallback defect.

## Backend changes

- Added resolveAuthenticatedPosOperator(req), returning canonical operatorId, role, email, and permissions from the authenticated Medusa user actor only. Safe logs include operator ID and role, never credentials.
- Added requirePosRegisterAssignment with distinct REGISTER_NOT_FOUND, REGISTER_INACTIVE, OPERATOR_NOT_ASSIGNED, ASSIGNMENT_INACTIVE, ROLE_NOT_PERMITTED, and REGISTER_SCOPE_MISMATCH errors.
- Changed GET register session to return 200 with an open session or 200 with session null.
- Made same-operator/same-register POST open idempotent and left another-operator or other-register conflicts explicit.
- Added race rechecks and a migration defining one OPEN session per operator in addition to the existing one-OPEN-session-per-register constraint. The migration file was not applied during this zero-write investigation.
- Refined the protected Admin assignment action to validate user/register identity, reject duplicate records, and make an unchanged active assignment a zero-write idempotent response.
- Reordered lookup security to authenticate, validate the register assignment, validate open-session ownership, normalize the string code, exact-match barcode/UPC/EAN/SKU, verify channel/publication, select only the register currency, and read only the register stock location.
- Preserved Code 128 value 999999999 and leading zeroes as strings.
- Added exact structured errors for channel, currency, missing price, insufficient register-location inventory, and lookup rate limiting.
- Added a read-only runtime/product audit script.

## Frontend changes

- Login clears the old POS token, staff, register, session, and incompatible cart before authenticating the next operator.
- The protected sell route calls GET /pos/me and GET /pos/me/registers, verifies the canonical operator and selected register, then verifies session ownership before rendering.
- Register selection shows only backend-authorized entries, clears stale register/cart state, aborts stale requests, reuses an owned open session, opens only when session is null, and prevents duplicate concurrent open calls.
- Scanning and checkout remain disabled until a same-operator/same-register session is ready.
- Camera, modal manual entry, top manual input, and hardware scanner use the shared lookupAndHandleBarcode(code, source) path with source values CAMERA, MANUAL_MODAL, MANUAL_TOP_INPUT, and HARDWARE_SCANNER.
- The scanner explicitly enables CODE_128, CODE_39, EAN_13, EAN_8, UPC_A, UPC_E, ITF, and QR_CODE.
- ZXing NotFoundException, ChecksumException, and FormatException are ignored as normal unreadable frames. Browser permission, missing/busy camera, and unexpected decoder errors remain distinct.
- Camera constraints prefer the environment camera at 1280x720, the preview uses object-contain, the frame is guidance only, and controls/stream/request/detection/mounted state use refs with deterministic cleanup.
- Development diagnostics are gated by VITE_POS_SCANNER_DIAGNOSTICS=true and contain no tokens.
- Backend monitoring is single-flight, abortable, backoff-controlled, quiet on repeated failures, visibly reports backend unavailability, and recovers.
- Cart duplicate scans increment one variant row and remain capped by register-location availability.
- Return preview is disabled until a valid order ID, item ID, and positive integer quantity exist; changing inputs invalidates the prior preview, and 404 remains contained on the return page.

## Health and runtime verification

- A. Backend health: PASS. GET http://localhost:9000/health returned HTTP 200 with status ok after the final builds.
- B. Login: BLOCKED. The browser is logged out and /pos/sell correctly redirects to /pos/login. No credentials were read from files or invented.
- C through K: NOT EXECUTED under the mandated stop rule because an authorized browser operator was unavailable.
- The final logged-out browser load showed the Eatsie POS Authorized staff access form. New log entries for the final navigation were Vite/React development info only; historical temporary HMR reload messages occurred while files were being edited.
- No physical camera result is inferred from mocks.

## Register, assignment, and session evidence

- USA register: 01KYMKWP9T4YWNMZA47AZNQSY3, active, USD, region reg_01KXT623CTGM9NJJYK2G4DQW7E, stock location sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ.
- One explicit active Admin assignment exists for the USA register.
- One existing OPEN session exists for that same assigned Admin.
- These database facts are not treated as an authenticated browser identity. Consequently the runtime assignment and session booleans remain false until a real login proves the browser operator is the assigned user.
- Same-operator open retry, conflicting operator ownership, duplicate register sessions, and a concurrent second-register race are covered by passing tests.

## Manual lookup and USA product audit

- The authenticated POS lookup was not called because the browser did not pass login.
- Chocolate product ID: prod_01KXJNH57CMPRBEVGSAMB30EMF.
- Standard variant ID: variant_01KXJNH5ASR8XNZ9QSW29B8SJ7.
- Exact barcode: 999999999.
- Published: yes.
- POS sales channel linked: yes.
- Stored USD price: 16.99.
- USA Store API calculated price: USD 16.99, HTTP 200.
- USA register-location inventory levels: 0.
- USA available quantity: 0.
- Global available quantity/Admin display: 1065.
- Cross-region fallback: blocked. Lookup now returns POS_INSUFFICIENT_INVENTORY rather than using the global/Canada total.

## Return-preview isolation

- POSSell does not import or call previewReturn.
- A clean POS sell render makes zero return-preview calls.
- POSReturns makes no request on mount and keeps Preview disabled until explicit complete input.
- A preview 404 shows an operator message, does not crash, and never enables return completion.

## Tests and builds

- Backend: 36 suites, 547 tests passed.
- Frontend: 30 files, 226 tests passed.
- Backend build: passed.
- Frontend build: passed.
- Focused coverage includes canonical identity, exact assignments, inactive/scope errors, nullable GET session, missing/other-owner sessions, idempotent/raced opens, exact identifiers, Code 128 strings, channel/currency/location isolation, health success/failure/recovery/unmount/no-storm, expected ZXing misses, format constraints, one-shot lookup and cleanup, stale operator/register clearing, authorized-only register selection, session blocking, duplicate quantity caps, and return isolation.
- Repository-wide git diff whitespace checking reports unrelated pre-existing whitespace in other user-owned changes. The implementation files compile and all requested test/build commands pass.

## Remaining blockers

1. Supply an authorized POS operator login through the UI to verify GET /pos/me, authorized USA register selection, and the existing/opened session in one browser identity context.
2. Create or import an explicitly approved inventory level for chocolate at stock location sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ. Do not copy the global 1065 or Canada stock.
3. Apply Migration20260729010000 through the normal reviewed migration workflow to activate the database-level one-open-session-per-operator race guard.
4. After blockers 1–3, run manual code 999999999, full-size SVG camera, printed label, two-scan cart increment, unknown code, camera indicator cleanup, and clean-sell return-request verification in order.

```text
[PHASE_4_POS_BARCODE_AUTH_SESSION_CAMERA_FIX_DONE]
{
  "status": "PARTIAL",
  "backendHealthy": true,
  "operatorAuthenticated": false,
  "operatorAssignedToSelectedRegister": false,
  "staleRegisterStateFixed": true,
  "sessionConflictRootCause": "GET session treated a closed register as a required-session conflict, while the selector attempted POST open for broad 403/404/409 failures and same-operator retries were not idempotent.",
  "registerSessionPassed": false,
  "sessionIdempotencePassed": true,
  "manualLookupPassed": false,
  "barcodeLookupHttpStatus": 0,
  "code128Enabled": true,
  "notFoundExceptionHandled": true,
  "continuousDecoderPassed": true,
  "usaUsdPricePassed": true,
  "usaLocationInventoryPassed": false,
  "crossRegionFallbackBlocked": true,
  "physicalCameraScanPassed": false,
  "cameraCleanupPassed": true,
  "duplicateIncrementPassed": true,
  "returnPreview404Isolated": true,
  "backendTestsPassed": 547,
  "frontendTestsPassed": 226,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "databaseWrites": 0,
  "rootCauses": [
    "stale register state was not rebound to the canonical authenticated operator",
    "GET session returned 409 for a normal closed-register state",
    "open-session retries and frontend effects were not safely idempotent",
    "lookup errors did not precisely separate channel, currency, and location inventory",
    "ZXing unreadable frames lacked explicit expected-error classification",
    "health polling lacked single-flight abort/backoff control",
    "return preview lacked a complete-input enabled condition",
    "Admin availability 1065 is global rather than USA-register-specific"
  ],
  "remainingBlockers": [
    "authorized browser POS login was not available",
    "chocolate has no USA register-location inventory level",
    "physical Code 128 camera scan was not performed",
    "operator-session uniqueness migration is authored but not applied"
  ]
}
```
