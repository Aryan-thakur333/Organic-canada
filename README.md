# Eatsie — Medusa storefront + backend

This monorepo contains:

- `backend/` — Medusa v2 server (commerce API, admin, worker).
- `frontend/` — Vite + React customer storefront (uses `@medusajs/js-sdk`).
- `payment-server/` — Optional legacy Stripe helper for non-Medusa card flows.

## Local development

### 1. Medusa backend

From `backend/`:

1. Copy `.env.template` to `.env` and set `DATABASE_URL`, `STORE_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET`, and Redis if used.
2. `npm install`
3. `npm run build` (first time) then `npm run dev` (or `npm run start` after build).

`STORE_CORS` must include your storefront origin, for example:

`http://localhost:5173,http://127.0.0.1:5173`

### 2. Storefront (`frontend/`)

1. Copy `frontend/.env.example` to `frontend/.env`.
2. Set **`VITE_MEDUSA_PUBLISHABLE_KEY`** to the publishable key from Medusa Admin → Settings → Publishable API Keys.
3. For local dev with the default Vite proxy, leave **`VITE_MEDUSA_BACKEND_URL`** empty so requests go to the same origin (`/store` is proxied to `http://localhost:9000` in `vite.config.js`).
4. `npm install` then `npm run dev`.

### 3. Stripe (optional)

- **Medusa-native Stripe:** install and configure the Stripe payment module on the Medusa region; the storefront reads `client_secret` from the Medusa payment session.
- **Legacy payment-server:** set `VITE_CHECKOUT_API_BASE` and run `payment-server` for the old demo path when Medusa is not used.

## Production deployment

1. **Host Medusa** (API + worker + database + Redis) on your infrastructure or Medusa Cloud. Use HTTPS and strong `JWT_SECRET` / `COOKIE_SECRET`.
2. **Set `STORE_CORS` and `AUTH_CORS`** on the Medusa server to your production storefront origin(s) only (no wildcards in production).
3. **Build the storefront:** `cd frontend && npm run build` and serve `frontend/dist` from a static host or CDN.
4. **Point the storefront at Medusa:** set `VITE_MEDUSA_BACKEND_URL=https://your-medusa-api.example.com` and `VITE_MEDUSA_PUBLISHABLE_KEY=pk_...` at build time (Vite inlines `VITE_*` variables).
5. **Images:** if the API returns relative `/static/...` URLs, set `VITE_MEDUSA_PUBLIC_URL` to the public Medusa base URL used by browsers.

## Environment checklist (storefront)

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_MEDUSA_PUBLISHABLE_KEY` | Yes (production) | Authenticates Store API requests |
| `VITE_MEDUSA_BACKEND_URL` | Recommended in prod | Absolute Medusa base URL |
| `VITE_MEDUSA_REGION_ID` | Optional | Force region for pricing if you have multiple |
| `VITE_MEDUSA_PUBLIC_URL` | Optional | Resolve relative image paths |
| `VITE_STORE_DEFAULT_COUNTRY_CODE` | Optional | Guest checkout address default (ISO 3166-1 alpha-2) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | For card UI | Stripe.js publishable key |
| `VITE_CHECKOUT_API_BASE` | Optional | Legacy payment-server base |

Never commit real **admin** JWTs or **secret** API keys into the frontend bundle.
