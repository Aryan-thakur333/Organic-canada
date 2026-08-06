# POS REGISTER BUTTON VISIBILITY STATUS

Live `/pos/me`:
NOT_CAPTURED — the controllable in-app browser redirected to `/pos/login`, so no POS staff token was available in that browser session. Credentials were not accessed, printed, or recreated.

Live `/pos/me/registers`:
NOT_CAPTURED — blocked by missing live POS browser authentication.

Live `/pos/me/session`:
NOT_CAPTURED — blocked by missing live POS browser authentication.

Live backend DB:
Audit database contains the expected active POS assignments and active registers.

```json
{
  "operatorId": "user_01KWPV0WK7J0KN2A8FZ0AD3T16",
  "assignmentCount": 2,
  "activeAssignmentCount": 2,
  "assignmentRegisterIds": [
    "01KYMKWP9FAB13SGT4Z5XTW6R2",
    "01KYMKWP9T4YWNMZA47AZNQSY3"
  ],
  "activeRegisterCount": 2,
  "finalRegisters": 2
}
```

Operator ID:
`user_01KWPV0WK7J0KN2A8FZ0AD3T16` from DB audit. Live browser operator ID was not captured because POS login is required.

Assignment count:
2

API register count:
NOT_CAPTURED live; focused backend resolver test confirms 2.

Frontend normalized count:
NOT_CAPTURED live; focused frontend normalization test confirms both `{ registers }` and `{ data: { registers } }` shapes normalize correctly.

Visible card count:
NOT_CAPTURED live; browser is currently at `/pos/login`.

Root cause:
The implementation had two visibility risks:

1. Backend `loadAssignedPosRegisters` filtered register status with a case-sensitive `register.status === "ACTIVE"` check. If live data is lowercase `active`, the route can return `[]` even though DB assignments exist.
2. Frontend register response handling only accepted one unwrapped response shape. If an intermediate client/proxy/mock supplied Axios-style `{ data: { registers } }`, the UI could fail normalization and render the wrong state.

Backend fix:
PASS

Frontend normalization:
PASS

Loading/empty-state fix:
PASS

Resume button:
PASS in focused component test; live browser NOT_RUN.

Switch button:
PASS in focused component test; live browser NOT_RUN.

Open button:
PASS in focused component test; live browser NOT_RUN.

Live browser:
BLOCKED — POS login required in controllable browser. Browser state captured:

```json
{
  "currentUrl": "http://localhost:5173/pos/login",
  "visibleHeading": "Eatsie POS",
  "visibleButton": "Sign in"
}
```

Process/port note:
`localhost:9000` health returned 200 and `localhost:5173` returned 200. `netstat` also showed listeners on both `9000` and `9001`, so the environment is not strictly one-backend-clean. The frontend is configured for `9000`, and verification remained scoped to `9000`.

Verification:

- Backend typecheck: PASS — `npx.cmd tsc --noEmit --pretty false`
- Focused backend POS tests: PASS — 44 passed
- Backend build: PASS
- Focused frontend POS tests: PASS — 30 passed
- Frontend build: PASS
- DB audit: PASS — assignments/registers present, final register count 2

Overall:
PARTIAL

Next required action:
Log into POS in the browser without sharing credentials, then rerun live verification. Expected live result after login:

- Canada POS Register visible
- USA POS Register visible
- If no open session: both cards show `Open Register`
- If USA session open: USA shows `CURRENT SESSION` + `Resume Register`; Canada shows `Switch Register`
