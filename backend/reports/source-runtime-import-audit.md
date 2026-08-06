# Source Runtime Import Audit

## Result

- Root cause: `src/lib/stripe.ts` re-exported the local TypeScript module with the runtime-incompatible specifier `./stripe-client.js`.
- Correction: changed that re-export to `./stripe-client`.
- Bundle module: valid. `src/modules/bundle/index.ts` resolves `./service`, `service.ts` resolves `./models/bundle-item`, and `src/links/bundle-product.ts` resolves the bundle module index.
- Runtime verification: `npm.cmd run dev` reached a stable Medusa process on port 9000; `GET /health` returned HTTP 200 with `{"status":"ok"}`.
- Runtime module-resolution errors after the correction: none observed.

## Static Release Gates

- TypeScript diagnostics: 92 remain in legacy scripts, `src/api/vendor/orders/[id]/_shared.ts`, and `src/subscribers/order-placed.ts`.
- Backend build: blocked by the remaining TypeScript diagnostics; not reported as passing.
- Unit tests: the last completed backend unit run passed 11 suites and 112 tests. A new unit run was not needed to validate the one-line runtime import correction.

## Non-Blocking Startup Warnings

- Stripe disabled because no API key is configured; COD remains available.
- Fake Redis and local event bus are active in development.
- Instrumentation registration and draft-order generated folders were skipped.
- npm reports the deprecated `public-hoist-pattern` project configuration.

## Safety

- No credentials were changed or recorded.
- No pricing, payment, order, inventory, catalog, or fulfillment operation was invoked.
- The startup script's existing marketplace schema verification/repair executed as part of `npm run dev`; no new schema behavior was added.
