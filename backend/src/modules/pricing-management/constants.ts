export const PRICING_MANAGEMENT_MODULE = "pricingManagement"
export const APPROVAL_STATUSES = ["pending", "approved", "review", "rejected"] as const
export const APPLY_BATCH_STATUSES = ["planned", "applying", "completed", "failed", "rolled_back"] as const
export const APPLY_ACTION_TYPES = ["CAD_CREATE", "CAD_UPDATE", "USD_CREATE", "USD_UPDATE", "SKIP", "ROLLBACK_CREATE", "ROLLBACK_UPDATE", "ROLLBACK_REMOVE"] as const
export const IMPORT_PREVIEW_STATUSES = ["pending", "ready", "committed", "expired", "rejected"] as const
export const SUPPORTED_CURRENCIES = ["cad", "usd"] as const
