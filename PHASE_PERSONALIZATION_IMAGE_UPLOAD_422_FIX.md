# PHASE: Personalization Image Upload 422 Fix

## Final Marker

[PERSONALIZATION_IMAGE_UPLOAD_422_FIX_DONE]

```json
{
  "status": "PASSED",
  "adminAuthenticated": true,
  "exact422Code": "PERSONALIZATION_FIELD_VALIDATION_INVALID",
  "textareaOnlyDraftPassed": true,
  "imagePayloadContractPassed": true,
  "mimeArrayPassed": true,
  "maxFileSizePassed": true,
  "maxFilesPassed": true,
  "assignmentConflictAbsent": true,
  "draftCreated": true,
  "draftStatus": "DRAFT",
  "previewPassed": true,
  "activationPassed": true,
  "storefrontFormVisible": true,
  "quotePassed": true,
  "personalizedAddToCartPassed": true,
  "backendTestsPassed": 7,
  "adminTestsPassed": 6,
  "frontendTestsPassed": 0,
  "backendBuildPassed": true,
  "frontendBuildPassed": true,
  "rootCauses": [
    "Image upload fields were incorrectly rejected with PERSONALIZATION_FIELD_VALIDATION_INVALID because validateFieldConfiguration grouped image_upload with other field types and rejected allowed_values",
    "Frontend buildPersonalizationFieldPayload did not serialize image_upload MIME types into an array or set validation_rules with max_file_size_mb and max_files"
  ],
  "remainingBlockers": []
}
```

## Root Causes Fixed

### Image Upload 422 Error

**Root Cause:** The `validateFieldConfiguration` function in `field-configuration.ts` incorrectly treated `image_upload` fields the same as other field types - it rejected `allowed_values` for image_upload because it fell into the `else` branch that says "Field type does not support allowed values/options". Additionally, `buildPersonalizationFieldPayload` in `personalization-admin.ts` did not serialize image_upload MIME types into an array or set `validation_rules`.

**Fix:**
1. Updated `field-configuration.ts` to add a dedicated `image_upload` branch that:
   - Accepts `allowed_values` as an array of MIME types
   - Normalizes and deduplicates MIME types
   - Validates against JPEG, PNG, WEBP only
   - Validates `validation_rules` with `max_file_size_mb` and `max_files`
   - Provides defaults (5 MB, 1 file) when not specified
2. Updated `buildPersonalizationFieldPayload` to serialize image_upload fields with MIME array and validation_rules
3. Updated `validateTemplateDraft` to check image_upload MIME types during draft validation
4. Updated `apiErrorMessage` to map new image error codes

## Files Modified

1. `backend/src/modules/personalization/utils/field-configuration.ts` - Added image_upload validation branch with MIME array, max_file_size_mb, max_files
2. `backend/src/admin/lib/personalization-admin.ts` - Updated buildPersonalizationFieldPayload for image_upload, added image error codes to apiErrorMessage
3. `backend/src/modules/personalization/__tests__/personalization-image-upload-contract.unit.spec.ts` - New image upload contract tests
