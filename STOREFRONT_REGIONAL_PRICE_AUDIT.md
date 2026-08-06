# Storefront Regional Price Audit

Product prices are stored and returned in major currency units. This audit reports stored catalog data as-is; it does not infer `/100` corrections.

- totalProducts: 130
- totalVariants: 147
- cadPresent: 132
- cadMissing: 15
- usdPresent: 42
- usdMissing: 105
- suspiciousCad: 79
- suspiciousUsd: 121
- duplicateOrConflicting: 0
- database writes: 0

## Examples requiring merchant review

| Product | Variant | CAD | USD | CAD finding | USD finding |
| --- | --- | ---: | ---: | --- | --- |
| Test Organic Honey | Standard | 1499 | missing | unusually_large | missing |
| Audit Test Product mqnomg5v82uo | Standard | 1999 | missing | unusually_large | missing |
| Audit Test Product 2 mqnomg9ca8cy | Standard | 2999 | missing | unusually_large | missing |
| Audit Test Product mqnonk9qmk45 | Standard | 1999 | missing | unusually_large | missing |
| Audit Test Product 2 mqnonkbwsjq0 | Standard | 2999 | missing | unusually_large | missing |
| Audit Test Product mqnopihsgq1s | Standard | 1999 | missing | unusually_large | missing |
| Audit Test Product 2 mqnopikuj9ea | Standard | 2999 | missing | unusually_large | missing |
| Audit Test Product mqnoqwxr36fh | Standard | 1999 | missing | unusually_large | missing |
| Audit Test Product 2 mqnoqx0i97dr | Standard | 2999 | missing | unusually_large | missing |
| Audit Test Product mqnos0izqqe5 | Standard | 1999 | missing | unusually_large | missing |
| Audit Test Product 2 mqnos0lumnu4 | Standard | 2999 | missing | unusually_large | missing |
| Audit Test Product f275b8c1 | Standard | 1999 | missing | unusually_large | missing |
| Test Product 62c6c1fc | Standard | 1999 | missing | unusually_large | missing |
| Audit Test Product 88b24761 | Standard | 1999 | missing | unusually_large | missing |
| Final 1782042414 | Standard | 1999 | missing | unusually_large | missing |
| Debug mqnq7xl0f0gw | Standard | 1999 | missing | unusually_large | missing |
| Fresh Bananas | Standard | 299 | missing | none | missing |
| Red Strawberries | Standard | 699 | missing | none | missing |
| Green Grapes | Standard | 599 | missing | none | missing |
| Sweet Mangoes | Standard | 799 | missing | none | missing |
