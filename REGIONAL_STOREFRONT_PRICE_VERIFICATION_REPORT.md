# Regional Storefront Price Verification Report

- Backend healthy: true
- Product amount convention: major units (no universal division by 100)
- Production products resolved: 3/3
- Valid CAD checks: 7
- Valid USD checks: 7
- Missing-price checks: 0
- Currency mismatches: 0
- Amount mismatches: 0
- Writes performed: 0

## Checks

| Product | Variant | Region | Raw price | Calculated price | Status | Finding |
| --- | --- | --- | --- | --- | --- | --- |
| Organic Apples | variant_01KVSFB75GZJ4N0B9SY6BXDTZC | Canada | 4.99 CAD | 4.99 CAD | VALID_CAD | SUSPICIOUS_AUDIT_FLAG: Listed in suspicious-cad-prices.csv; merchant review is required and no intended replacement value is inferred. |
| Organic Apples | variant_01KVSFB75GZJ4N0B9SY6BXDTZC | USA | 3.99 USD | 3.99 USD | VALID_USD | NORMAL: Finite, positive major-unit raw amount. |
| Organic OIL | variant_01KWW11NCJY9SGGGPJ5D7WB4FR | Canada | 25 CAD | 25 CAD | VALID_CAD | SUSPICIOUS_AUDIT_FLAG: Listed in suspicious-cad-prices.csv; merchant review is required and no intended replacement value is inferred. |
| Organic OIL | variant_01KWW11NCJY9SGGGPJ5D7WB4FR | USA | 18.99 USD | 18.99 USD | VALID_USD | NORMAL: Finite, positive major-unit raw amount. |
| chocolate | variant_01KXJNH5ASR8XNZ9QSW29B8SJ7 | Canada | 22 CAD | 22 CAD | VALID_CAD | SUSPICIOUS_AUDIT_FLAG: Listed in suspicious-cad-prices.csv; merchant review is required and no intended replacement value is inferred. |
| chocolate | variant_01KXJNH5ASR8XNZ9QSW29B8SJ7 | USA | 16.99 USD | 16.99 USD | VALID_USD | NORMAL: Finite, positive major-unit raw amount. |
| Medusa Sweatshirt | variant_01KVJF9J7TBTE05S8FBCXNTTGD | Canada | 10 CAD | 10 CAD | VALID_CAD | SUSPICIOUS_AUDIT_FLAG: Listed in suspicious-cad-prices.csv; merchant review is required and no intended replacement value is inferred. |
| Medusa Sweatshirt | variant_01KVJF9J7TH3XVZSS7EASJNP2S | Canada | 10 CAD | 10 CAD | VALID_CAD | SUSPICIOUS_AUDIT_FLAG: Listed in suspicious-cad-prices.csv; merchant review is required and no intended replacement value is inferred. |
| Medusa Sweatshirt | variant_01KVJF9J7TXJP70XZXEAQWVATX | Canada | 10 CAD | 10 CAD | VALID_CAD | SUSPICIOUS_AUDIT_FLAG: Listed in suspicious-cad-prices.csv; merchant review is required and no intended replacement value is inferred. |
| Medusa Sweatshirt | variant_01KVJF9J7VH1FXQ845RECAFW8V | Canada | 10 CAD | 10 CAD | VALID_CAD | SUSPICIOUS_AUDIT_FLAG: Listed in suspicious-cad-prices.csv; merchant review is required and no intended replacement value is inferred. |
| Medusa Sweatshirt | variant_01KVJF9J7TBTE05S8FBCXNTTGD | USA | 15 USD | 15 USD | VALID_USD | NORMAL: Finite, positive major-unit raw amount. |
| Medusa Sweatshirt | variant_01KVJF9J7TH3XVZSS7EASJNP2S | USA | 15 USD | 15 USD | VALID_USD | NORMAL: Finite, positive major-unit raw amount. |
| Medusa Sweatshirt | variant_01KVJF9J7TXJP70XZXEAQWVATX | USA | 15 USD | 15 USD | VALID_USD | NORMAL: Finite, positive major-unit raw amount. |
| Medusa Sweatshirt | variant_01KVJF9J7VH1FXQ845RECAFW8V | USA | 15 USD | 15 USD | VALID_USD | NORMAL: Finite, positive major-unit raw amount. |

## Manual Approval State

The suspicious CAD audit contains 0 manually approved corrections. Blank approved_corrected_cad_price cells remain unapproved and are never inferred by this verifier.
