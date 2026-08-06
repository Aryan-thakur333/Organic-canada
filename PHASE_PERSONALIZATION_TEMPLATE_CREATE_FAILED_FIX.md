# PHASE: Personalization Template Create Failed Fix

## Final Marker

[PERSONALIZATION_TEMPLATE_CREATE_FAILED_FIX_DONE]

```json
{
  "status": "PASSED",
  "rootCause": "vendor_id NOT NULL constraint rejected empty string for non-vendor products",
  "fixes": [
    "Made vendor_id nullable in PersonalizationTemplate model",
    "Created Migration20260716000004 to drop NOT NULL constraint on vendor_id",
    "Updated admin POST route to pass null instead of empty string when product has no vendor_id",
    "Updated test assertion to expect vendor_id value"
  ],
  "filesModified": [
    "backend/src/modules/personalization/models/personalization-template.ts",
    "backend/src/modules/personalization/migrations/Migration20260716000004.ts",
    "backend/src/api/admin/personalization-templates/route.ts",
    "backend/src/modules/personalization/__tests__/personalization-admin-hardening.unit.spec.ts"
  ],
  "migrationRequired": true,
  "remainingBlockers": []
}
```

## Root Cause

The `PERSONALIZATION_TEMPLATE_CREATE_FAILED` error was caused by a database-level constraint violation:

1. Migration `Migration20260716000003` added `vendor_id` as `text NOT NULL DEFAULT ''`
2. The model defined `vendor_id: model.text()` (required, not nullable)
3. The admin POST route passed `vendor_id: String(product.metadata?.vendor_id || "")`
4. When a product had no `vendor_id` in metadata, this became an empty string `""`
5. The database rejected the empty string for the NOT NULL column, causing a generic `PERSONALIZATION_TEMPLATE_CREATE_FAILED` error

## Fix Applied

1. **Made `vendor_id` nullable** in the model definition
2. **Created migration** to drop the NOT NULL constraint
3. **Updated admin route** to pass `null` instead of `""` when no vendor exists
4. **Updated test** to expect the `vendor_id` value in the assertion

## Action Required

Run the migration after deploying:

```bash
cd backend && npx medusa db:migrate
```
