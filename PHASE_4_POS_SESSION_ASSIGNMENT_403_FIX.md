# Phase 4 POS Session Assignment 403 Fix

Date: 2026-07-30  
Status: **PASSED**

## Outcome

The POS register list, register-session lookup, and register-open authorization now use one canonical assignment matcher. A freshly authenticated `admin@eatsie.com` can see both assigned active register cards and open the USA register without the incorrect assignment 403. The existing USA session is reused; the acceptance run did not call the session-open endpoint and made no database writes.

## Root cause and diagnosis

The live database was already correct: the authenticated operator has an active, non-deleted `ADMIN` assignment to the active USA register, and one matching open session exists. The reported 403 was not reproducible on the initial pre-fix fresh-login check.

The code nevertheless contained a real consistency defect capable of producing the reported symptom:

- The working register-list path loaded assignments by canonical `operator_id`, joined registers, and filtered records in memory.
- The register-scoped session path used a separate authorization implementation and a different query/filter/error path.
- Status/role/ID checks were not normalized consistently, and assignment query failures did not share one safe error contract.

This split allowed a card to be admitted by one matcher and rejected by another. The repair removes that split rather than adding fixture-specific bypasses.

```json
{
  "marker": "[POS_SESSION_403_SOURCE]",
  "sourceFiles": [
    "backend/src/utils/pos/register-assignments.ts",
    "backend/src/utils/pos/security.ts",
    "backend/src/api/pos/registers/[id]/session/route.ts",
    "backend/src/api/pos/me/registers/route.ts"
  ],
  "throwLocation": "assertOperatorAssignedToRegister",
  "sessionRouteAuthorizationHelper": "requirePosContext -> assertOperatorAssignedToRegister",
  "registerListAuthorizationHelper": "loadAssignedPosRegisters -> assertOperatorAssignedToRegister",
  "sameMatcher": true
}
```

## Backend implementation

`assertOperatorAssignedToRegister` is now the shared source of truth. It:

- normalizes operator/register IDs and uppercases role/register status before comparison;
- queries assignments using the canonical operator ID, then explicitly requires the exact register ID, `active === true`, and no `deleted_at`;
- permits only the requested POS roles and enforces assignment region/location scope;
- requires the joined register to exist, be non-deleted, and have normalized `ACTIVE` status;
- returns the stable 403 contract `POS_OPERATOR_NOT_ASSIGNED_TO_REGISTER` / `Operator is not assigned to this register.`;
- converts assignment query failures into the safe 500 contract `POS_REGISTER_ASSIGNMENT_QUERY_FAILED` without leaking database details.

The session route now normalizes the actual `req.params.id`, authorizes that exact ID through the shared matcher, and queries an open session using the exact operator/register/status tuple. Existing matching sessions are returned; duplicates are detected; no session is created by the GET route.

The open route uses the same normalized register parameter and shared authorization path. Its existing idempotent reuse behavior is preserved.

```json
{
  "marker": "[POS_ASSIGNMENT_QUERY_COMPARISON]",
  "registerList": {
    "queryIdentity": "canonical operator_id",
    "registerMatch": "exact normalized register_id",
    "activeRequired": true,
    "deletedExcluded": true,
    "roleNormalized": true,
    "registerStatusNormalized": true
  },
  "sessionAuthorization": {
    "queryIdentity": "canonical operator_id",
    "registerMatch": "exact normalized register_id",
    "activeRequired": true,
    "deletedExcluded": true,
    "roleNormalized": true,
    "registerStatusNormalized": true
  },
  "differences": [],
  "passed": true
}
```

Development diagnostics were added at the critical boundaries:

- `[POS_ASSIGNMENT_AUTH_ID_TRACE]`: authenticated actor ID, auth identity ID, operator ID used, and fixture-ID comparison.
- `[POS_ASSIGNMENT_ROLE_STATUS_TRACE]`: assignment match, normalized role, active/deleted flags, register match, and normalized register status.
- `[POS_SESSION_REGISTER_PARAM]`: raw and normalized route parameter.
- `[POS_SESSION_REUSE_TRACE]`: exact operator/register lookup and whether an existing session was returned.

## Frontend behavior

When session authorization returns the new 403 code (or the legacy code during rollout), the register selection page now:

- stays on register selection;
- shows exactly `Operator is not assigned to this register.`;
- refreshes assignments once;
- does not retry the failed session request;
- does not call `/open`;
- does not navigate into the register.

The in-flight selection guard also ensures repeated clicks do not issue duplicate selection requests or create duplicate sessions.

## Read-only runtime audit

The Medusa audit script is `backend/src/scripts/audit-pos-session-assignment-403.ts`. It performed reads only.

```json
{
  "marker": "[POS_USA_ASSIGNMENT_RUNTIME_AUDIT]",
  "operatorId": "user_01KWPV0WK7J0KN2A8FZ0AD3T16",
  "registerId": "01KYMKWP9T4YWNMZA47AZNQSY3",
  "assignmentFound": true,
  "assignmentId": "01KYMKWP9W6AYWQDKE7B27V4RX",
  "active": true,
  "deleted": false,
  "role": "ADMIN",
  "registerFound": true,
  "registerStatus": "ACTIVE",
  "currentHelperPassed": true,
  "passed": true,
  "databaseWrites": 0
}
```

```json
{
  "marker": "[POS_SESSION_REUSE_TRACE]",
  "authorizationPassed": true,
  "openSessionsFound": 1,
  "matchingUsaSessionFound": true,
  "sessionId": "01KYP39VH0W0JKFYZMNNYPA6A9",
  "newSessionCreated": false,
  "wrongRegisterSessionReturned": false,
  "passed": true
}
```

## Test evidence

- Backend full unit suite: **45/45 suites, 631/631 tests passed**.
- Focused backend assignment/session suites after the final test-fixture adjustment: **19/19 tests passed**.
- Focused frontend POS register/session/error suites: **35/35 tests passed**.
- Full frontend suite: **334 passed**; the existing `BarcodeScannerModal.test.jsx` camera-mock suite still has 10 unrelated failures.
- TypeScript: the POS register-selection type error was corrected. Four unrelated pre-existing errors remain in barcode-label rendering, the barcode scan-details test, and admin POS runtime diagnostics.

The new regression coverage includes USA and Canada authorization, inactive/deleted/unassigned records, query failure safety, normalized role/status checks, inactive registers, list/session matcher equivalence, route-param normalization, exact existing-session reuse, precise frontend 403 behavior, one assignment refresh, no open call, no navigation, and repeated-click deduplication.

## Fresh-login live acceptance

The browser test signed out, signed back in as `admin@eatsie.com`, confirmed two visible cards, and clicked the USA card once. The application navigated to the exact USA register and rendered `Register session ready`. Two safe GET observations were logged (selection authorization followed by register-page hydration); neither created a session. There was no 403, no `/open` call, and no Canada register request.

```json
{
  "marker": "[POS_USA_SESSION_LIVE_ACCEPTANCE]",
  "cardsVisibleBeforeClick": 2,
  "usaCardClicked": true,
  "usaCardMatchesRequestedId": true,
  "sessionGetFulfilled": true,
  "sessionRequestLogCount": 2,
  "forbiddenErrorAbsent": true,
  "postOpenCalled": false,
  "wrongCanadaRequestSent": false,
  "existingSessionReused": true,
  "newSessionCreated": false,
  "passed": true
}
```

## Final status marker

```json
{
  "marker": "[POS_SESSION_ASSIGNMENT_403_FIX_FINAL]",
  "status": "PASSED",
  "rootCause": "Register listing and register-scoped session authorization used separate assignment query/filter implementations; the shared canonical matcher now enforces the same normalized identity, assignment, role, and register-status rules everywhere.",
  "backendTestsPassed": 631,
  "frontendFocusedTestsPassed": 35,
  "liveFreshLoginPassed": true,
  "existingSessionReused": true,
  "newSessionCreated": false,
  "databaseWrites": 0,
  "remainingBlockers": [
    "10 unrelated pre-existing BarcodeScannerModal camera-mock test failures in the full frontend suite",
    "4 unrelated pre-existing TypeScript errors outside the POS session-assignment fix"
  ]
}
```
