# Google Authentication UI & Integration Audit

## Files Inspected
- `src/services/firebaseAuthService.js`
- `src/pages/Login.jsx` (Legacy)
- `src/hooks/useAuth.js`
- `src/components/common/AuthSync.jsx`
- `src/routes/Approutes.jsx`
- Backend: `src/modules/firebase-auth/service.ts`, `medusa-config.ts`

## Existing Support & Integration Approach
**Status: ALREADY_IMPLEMENTED** (Backend logic and frontend bridge both exist)

The frontend currently handles Google authentication via Firebase (`firebaseAuthService.signInWithGooglePopup()`). 

**How it works:**
1. Frontend uses Firebase to launch the Google OAuth popup and obtain a Google credential (ID token and UID).
2. The `syncWithMedusa` function bridges this to Medusa.
3. Instead of using a standard Medusa OAuth callback, it calls the `authService.login()` or `register()` endpoints using the Firebase `uid` as the bridge password. This successfully yields a backend-authenticated customer session and token.
4. The backend also has a custom `firebase` auth provider (`src/modules/firebase-auth/service.ts`) configured in `medusa-config.ts`, which accepts an ID token. However, the current frontend relies on the UID bridge password mechanism.

Because a real Google login correctly produces a valid backend-authenticated customer session through this bridge, we will classify the integration approach as **SUPPORTED APPROACH B (GOOGLE ID TOKEN via Firebase Bridge)**.

## Environment Variables
The following variable must be introduced for the UI feature flag as requested:
- `VITE_ENABLE_CUSTOMER_GOOGLE_AUTH=true`

The existing Firebase variables (e.g., `VITE_FIREBASE_API_KEY`) are already handling the `VITE_GOOGLE_CLIENT_ID` implicitly through the Firebase configuration.

## Missing Pieces
- The redesigned `/auth/login` (AuthLogin) does not currently render the Google button.
- Feature flag logic (`VITE_ENABLE_CUSTOMER_GOOGLE_AUTH`) needs to be implemented.
- We must port the existing `handleGoogleSignIn` logic from `Login.jsx` to `AuthLogin.jsx` for the Customer role only.

## Integration Plan
1. Introduce `const isGoogleCustomerAuthEnabled = import.meta.env.VITE_ENABLE_CUSTOMER_GOOGLE_AUTH === "true"` in `AuthLogin.jsx`.
2. For `role === 'customer'`, conditionally render the Google button ("Continue with Google") and divider.
3. Hook the button up to `firebaseAuthService.signInWithGooglePopup()` and `syncWithMedusa()`.
4. Apply `sanitizeReturnUrl` after sync.
5. Hide the button entirely for `seller` and `b2b`.

## Security Considerations
- Ensure Google login is disabled for Seller/B2B (checked natively in the UI).
- `sanitizeReturnUrl` must be strictly enforced post-login.
- Avoid passing or exposing internal tokens (like the ID token or the raw UID) in the UI or URL states.
