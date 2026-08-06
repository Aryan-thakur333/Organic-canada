# Build Stabilization Report

This report catalogs the TypeScript compiler and routing errors identified during Phase 2 stabilization.

## 1. ProductVariant Prices Property Access
* **File**: `src/scripts/audit-region-prices.ts` (and other scripts querying variants)
* **Error**: `Property 'prices' does not exist on type 'ProductVariant'`
* **Root Cause**: The default generated `ProductVariant` type from `ProductModuleService` does not contain the `prices` property because pricing is a cross-module relationship managed by the Link Module/Pricing Module in Medusa v2.
* **Fix**: Cast the Query Graph result boundary array to local interface type `AuditedProduct[]` mapping `prices` to variants as a list of amounts and currency codes.
* **Status**: Resolved.

## 2. Personalization Module Service Typings
* **File**: `src/scripts/audit-region-prices.ts` and `src/modules/personalization/__tests__/personalization.tests.ts`
* **Error**: `Property 'listPersonalizationTemplates' does not exist on type '{}'`
* **Root Cause**: Resolving `personalizationModuleService` or `PERSONALIZATION_MODULE` from container via untyped keys maps to the default `{}` empty object type.
* **Fix**: Cast the resolved container service reference explicitly to `any` (or cast the container.resolve generic).
* **Status**: Resolved.

## 3. Never Array Assignment
* **File**: `src/scripts/audit-multi-region.ts`
* **Error**: `Argument of type ... is not assignable to parameter of type 'never'`
* **Root Cause**: Initialization of arrays like `const results = []` or `const missing = []` without type parameters infers them as `never[]`.
* **Fix**: Explicitly define local types (`PriceGapMissing`, `PriceGapReport`) and type the arrays.
* **Status**: Resolved.

## 4. Payment Provider Selection & Cache Reporting
* **File**: `src/scripts/audit-multi-region.ts`
* **Error**: `One or more regions have no associated payment providers` (False blocker error)
* **Root Cause**: The script checked `!r.providers` in classification check, whereas the Query Graph field populated is `payment_providers`.
* **Fix**: Corrected references to check `r.payment_providers`.
* **Status**: Resolved.
