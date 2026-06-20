# Medusa backend (Eatsie)

Medusa **v2** application: Store API, Admin, PostgreSQL, optional Redis, optional Stripe.

## Prerequisites

- Node.js **>= 20**
- **PostgreSQL** (local Docker file provided) or a managed instance
- **Redis** recommended for production (`REDIS_URL`); optional for many local setups

## Quick start (local)

1. Start Postgres (optional if you use your own):

   ```bash
   docker compose up -d
   ```

2. Copy environment template and fill secrets (never commit `.env`):

   ```bash
   cp .env.template .env
   ```

   Set at least: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `MEDUSA_BACKEND_URL`.

3. Install and prepare the database:

   ```bash
   npm install
   npm run db:setup
   ```

   `db:setup` creates the DB (if needed), runs migrations, and syncs module links.

4. Seed demo data (regions, shipping, products, inventory, **publishable API key**):

   ```bash
   npm run seed
   ```

   Copy the publishable key from **Medusa Admin → Settings → Publishable API Keys** into the storefront `VITE_MEDUSA_PUBLISHABLE_KEY`.

5. Run the server:

   ```bash
   npm run dev
   ```

- **Store API:** `http://localhost:9000/store/...`
- **Admin:** `http://localhost:9000/app`

## Scripts

| Script            | Purpose                                      |
|-------------------|----------------------------------------------|
| `npm run dev`     | Development server with watch                |
| `npm run build`   | Production build (skips strict env check)    |
| `npm run start`   | Production server (`medusa start`)         |
| `npm run db:setup`| Create DB + migrate + sync links             |
| `npm run db:migrate` | Run pending migrations                    |
| `npm run db:sync-links` | Sync link definitions                  |
| `npm run db:create`   | Create database from `DATABASE_URL`     |
| `npm run seed`    | Run `src/scripts/seed.ts`                  |

## Environment variables

See **`.env.template`** for descriptions. Required for normal runtime (unless `MEDUSA_SKIP_ENV_CHECK=true`):

- `DATABASE_URL` — PostgreSQL URL
- `JWT_SECRET`, `COOKIE_SECRET` — long random strings
- `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS` — comma-separated allowed origins (include storefront + `http://localhost:9000` for local Admin)
- `MEDUSA_BACKEND_URL` — public URL of this API (Admin uses it)

Optional:

- `REDIS_URL` — Redis for cache / events / workflows in production-like setups
- `STRIPE_API_KEY` — registers Stripe payment provider (`pp_stripe_stripe`); link it to regions in Admin if you use card checkout
- `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED` — TLS to Postgres

## Production

1. Provision **PostgreSQL** and (recommended) **Redis**.
2. Set env vars on the host (Kubernetes secrets, Railway, etc.) — **no secrets in git**.
3. Use a strong `DATABASE_URL` with SSL (`?sslmode=require` and/or `DATABASE_SSL=true` per provider docs).
4. Set **CORS** to real origins only (storefront + Admin origin if split).
5. Set `MEDUSA_BACKEND_URL` to the **public HTTPS** URL of this service.
6. Run migrations: `npm run db:migrate` then `npm run db:sync-links` (or `db:setup` on first deploy if the database is empty).
7. Build and start:

   ```bash
   npm ci
   npm run build
   npm run start
   ```

8. Run **one** production process or use Medusa’s cluster flags (`medusa start --help`) per your hosting model.
9. Create or verify **publishable API keys** in Admin and configure the storefront.

## Publishable keys & storefront

After `npm run seed` (or via Admin), create a publishable key scoped to the default sales channel. The Vite storefront reads `VITE_MEDUSA_PUBLISHABLE_KEY` and optionally proxies to this server in dev.

## Optional: legacy `payment-server/`

The Node demo under `payment-server/` is separate from Medusa; Medusa handles payments via configured providers (`pp_system_default`, Stripe, etc.).
