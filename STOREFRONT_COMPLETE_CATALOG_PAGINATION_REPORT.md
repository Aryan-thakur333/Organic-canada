# Storefront Complete Catalog Pagination Report

## Result

The Store API returns 132 bounded product candidates for both storefront regions. They are not all public catalog entries: 47 are hidden by the explicit test/debug safeguard. The listing now runs the pipeline in this order: public visibility, exact active-region price, active search/type filters, copied-array sorting, then pagination.

| Group | USA | Canada | Should appear in public listing | Reason |
| --- | ---: | ---: | --- | --- |
| Raw Store API candidates | 132 | 132 | No | Candidate set is intentionally broader than the public catalog. |
| Hidden test/debug candidates | 47 | 47 | No | Metadata/title-handle safeguard. |
| Public candidates | 85 | 85 | Depends on region price | Legitimate products after the safeguard. |
| Region-unavailable public candidates | 70 | 7 | No | No exact price in the active regional currency. |
| Final eligible products | 15 | 78 | Yes | Public with an exact active-region price. |

## Pagination

- Page size: 24.
- USA: 15 eligible products, one page.
- Canada: 78 eligible products, four pages.
- The listing shows `Showing X-Y of N products`, direct numbered pages, Previous/Next buttons, and scrolls to the product grid after a page change.
- Page changes reset to page one when the region, search query, type filter, or sort order changes.

## Findings

The original appearance of a small USA catalog was primarily data-driven: 70 public products lack an explicit USD price and remain unavailable until merchant-approved USD prices are created. Canada has enough eligible products to require pagination; all 78 are reachable through four bounded pages.

`ProductCard` does not return `null` for optional fields. It uses image and description fallbacks, while strict regional-price exclusion happens before card rendering. `All Products` has no category restriction, so uncategorized eligible products remain visible. Large stored values remain displayed as stored major-unit amounts and are catalog findings, not formatter conversions.

## Verification

- Read-only Store API report generated for USA and Canada.
- Focused frontend suite: 7 files, 58 tests passed.
- Frontend production build: passed.
- Browser checks: USA shows `Showing 1-15 of 15 products` including Organic Apples at `$3.99`; Canada shows the page-one range, supports direct page 2 and page 4 navigation, and a Canada-region search shows Organic Apples at `$4.99`.
- Price writes: 0.
- Catalog writes: 0.
