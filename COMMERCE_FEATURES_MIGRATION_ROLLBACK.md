# Commerce Features Migration and Rollback Plan

Date: 2026-07-30  
Backup: `D:\eatsie-project\backups\before-commerce-features-20260730-111515.backup`

## Safety position

All commerce flags default to disabled. The migrations are additive; no production columns or business data are deleted. A clean database migration was executed successfully and the disposable database was removed. The existing database was backed up before applying the migrations.

## Applied migrations

1. `subscription/Migration20260730000001` — provider IDs, billing lifecycle, checkout/idempotency records and indexes.
2. `personalization/Migration20260716000000` — non-destructive compatibility bootstrap for a historical cross-module migration-name collision.
3. `personalization/Migration20260730000002` — secure asset ownership, quote/snapshot and production status fields.
4. `personalization/Migration20260730000004` — legacy `type` to `field_type` compatibility and nullable legacy template `name`.
5. `bundle/Migration20260730000003` — bundle definition, component and reservation/order snapshot persistence.

## Operational rollback (preferred)

1. Set all six backend/storefront feature flags to `false` and redeploy both applications.
2. Disable the Stripe subscription webhook destination if it was configured. Do not delete Stripe subscriptions; reconcile them with provider state first.
3. Allow in-flight one-time orders to complete. Do not remove bundle reservations while checkout/order processing is active.
4. Keep additive tables and columns in place. This preserves audit, provider-event, personalization snapshot and inventory-reservation evidence.
5. Revert application code only after the flags are disabled and background workers are stopped.

This compensating rollback is safer than schema-down execution because completed orders and provider events must remain auditable.

## Database restore (disaster recovery only)

Use the verified pre-change backup only during an approved outage. Stop API and worker processes, restore into a new database, validate row counts and migration state, then switch the connection. Never restore over the active production database. Any orders, payments or inventory changes after the backup timestamp must be reconciled before cutover.

## Migration down constraints

- The compatibility bootstrap has an intentionally non-destructive `down` operation.
- Other down migrations must only be run on a disposable/restored database after confirming no feature records exist.
- Do not drop subscription provider-event records, personalization order snapshots, or bundle reservation snapshots from a live system.
- No direct SQL inventory correction is authorized; use Medusa inventory and reservation services.

## Post-rollback verification

- Normal USA/USD and Canada/CAD one-time checkout remains available.
- Feature routes return disabled/unsupported responses.
- No subscription renewal job creates a PaymentIntent or order.
- No active bundle reservation is orphaned.
- Stripe provider subscriptions and local records reconcile one-to-one.

