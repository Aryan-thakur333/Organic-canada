# Authentication Gateway Audit

## Frontend Inspection

### Routes & Components
- **`src/routes/Approutes.jsx`**: COMPLETE - Contains legacy routes (`/login`, `/login/customer`, `/login/seller`, etc.) that need to be redirected.
- **`src/pages/Login.jsx`**: COMPLETE - Currently a monolithic page handling customer login, registration, and role selection with 6 buttons.
- **`src/pages/vendor/Login.jsx`**: COMPLETE - Vendor login page.
- **`src/pages/vendor/Register.jsx`**: COMPLETE - Single-form vendor registration (needs to be refactored into a wizard).
- **`src/pages/B2BLogin.jsx`**: COMPLETE - Handles B2B login and status verification (pending/rejected checks).
- **`src/pages/B2BCompanyRegistration.jsx`**: COMPLETE - Current B2B registration (needs to be adapted into a wizard).

### Auth Contexts & Token Storage
- **Token Storage**: `src/services/medusa/tokenStorage.js` handles token persistence.
- **Auth Service**: `src/services/medusa/authService.js` handles `/auth/customer/emailpass`.
- **Vendor API**: `src/services/vendorApi.js` & `src/services/vendorAuth.js` handles vendor login/registration.
- **B2B API**: `src/services/b2bApi.js` handles B2B logic and company status retrieval.
- **State Management**: Redux slices (`authSlice`, `vendorSlice`, `userSlice`).

## Backend Endpoints

### Customer
- **Login**: `POST /auth/customer/emailpass` (COMPLETE)
- **Registration**: `POST /auth/customer/emailpass/register` and `POST /store/customers` (COMPLETE)
- **OTP Generation**: (MISSING) Not supported by backend.
- **OTP Verification**: (MISSING) Not supported by backend.
- **Password Recovery (Request)**: `POST /auth/customer/emailpass/reset-password` (COMPLETE via Medusa)
- **Password Recovery (Reset)**: Medusa native reset flow (COMPLETE)

### Seller / Vendor
- **Registration**: `POST /vendor/register` (COMPLETE)
  - Fields supported: `business_name`, `owner_name`, `email`, `phone`, `description`, `company_details`, `password`, `confirm_password`.
- **Document Upload**: (MISSING) No file upload supported on `POST /vendor/register`.
- **Login**: `POST /vendor/login` (COMPLETE)
- **Account Status**: `GET /vendor/me` (COMPLETE - returns `status`)

### B2B Buyer
- **Registration**: `POST /store/b2b/companies` (COMPLETE)
- **Document Upload**: (MISSING) Not supported.
- **Login**: Handled through customer login + B2B API company check (COMPLETE)
- **Account Status**: `GET /store/b2b/company` (COMPLETE - returns `status`)

## Conclusion
The audit confirms we have working login and registration APIs for all 3 roles, as well as account status checks. We do **not** have backend support for OTP or Document Uploads. Therefore, these features will be disabled or omitted in the UI per the project requirements. Legacy routes will be preserved via redirects to the new `/auth` gateway flow.
