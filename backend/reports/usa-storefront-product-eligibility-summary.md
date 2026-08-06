# USA Storefront Product Eligibility Audit

- Scope: Default Publishable API Key, Default Sales Channel, USA region.
- Money unit in this audit/review CSV: Medusa v2 product price major units.
- Business data writes: 0

## Reconciliation

accessible products = 132
classified products = 132
unclassified products = 0

## Primary Classification

- visibleWithValidUsdPrice: 15
- missingVariants: 2
- missingPriceSet: 7
- missingUsdAmount: 63
- usdExistsButCalculatedPriceMissing: 0
- incorrectCalculatedCurrency: 0
- outsideDefaultSalesChannel: 0
- unpublished: 0
- storefrontClassificationExcluded: 45
- inventoryExcluded: 0
- duplicateIssue: 0
- other: 0

## Variant Pricing

- total variants: 147
- variants with valid USD calculated prices: 42
- variants requiring USD price review: 64

## Review State

- review rows: 64
- approved rows: 0
- needs-review rows: 64
- invalid rows: 0

Live import was not executed because rows still require explicit merchant/user USD price approval.
