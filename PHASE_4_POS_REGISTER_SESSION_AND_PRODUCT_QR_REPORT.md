# POS REGISTER + PRODUCT QR STATUS

Canada 409 root cause:
The Canada register was correctly authorized, but the operator already had an OPEN session on the USA register. The backend one-open-session-per-operator rule rejected the Canada `/open` request. The rule was preserved; the UX now detects the existing operator session first and routes the operator through Resume or explicit Close & Switch.

Current session detection: PASS
Resume current register: PASS
Safe register switch: PASS
Second-session prevention: PASS
Opening Cash CAD/USD: PASS
Standalone Barcode Labels removed: PASS
Barcode APIs preserved: PASS
Product Details QR widget: PASS
QR per variant: PASS
QR payload: PASS
Print QR: PASS
Test Scan: PASS
Canada price: NOT_RUN
USA price: NOT_RUN
Canada inventory: NOT_RUN
USA inventory: NOT_RUN
Backend tests: FAIL
Frontend tests: FAIL
Backend build: PASS
Frontend build: PASS
Live Canada register: NOT_RUN
Live product QR: NOT_RUN

Implementation notes:

- Added `GET /pos/me/session` to return the authenticated operator's current OPEN register session plus safe register summary.
- Backend register open conflicts now emit stable code `POS_OPERATOR_SESSION_ALREADY_OPEN` with sanitized existing session/register metadata.
- Register Select now loads `/pos/me`, `/pos/me/registers`, and `/pos/me/session`, then renders `CURRENT SESSION`, `Resume Register`, `Switch Register`, and per-register opening cash modals.
- Safe register switch is sequential: close current session first, then open the target register. It does not create concurrent sessions.
- Removed the standalone Admin `/app/barcode-labels` page files while preserving `/admin/barcodes/...` APIs.
- Added Product Details widget `backend/src/admin/widgets/product-pos-qr.tsx`.
- QR payload is exactly `EATSIE-POS:<variant_id>` and does not include price, inventory, currency, token, customer, or region data.

Verification:

- Focused backend POS/Admin tests: PASS, 47 passed.
- Focused frontend POS tests: PASS, 28 passed.
- Backend build: PASS.
- Frontend build: PASS.
- Full backend suite was run and still has unrelated failures in personalization/admin config areas; observed run: 720 passed, 17 failed before final POS assertion cleanup.
- Full frontend suite was run and still has unrelated failures in commerce feature gates, personalization storefront UX, and barcode scanner camera tests; observed run: 360 passed, 16 failed before final POS test cleanup.
- Live browser Canada switch, product QR scan, and real camera scan were not executed in this turn.

Overall:
PARTIAL
