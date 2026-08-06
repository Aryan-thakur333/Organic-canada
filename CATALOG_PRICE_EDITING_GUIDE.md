# Catalog Price Editing Guide

1. Open `backend/reports/real-grocery-price-remediation.csv`.
2. Review each current CAD and USD snapshot against merchant records.
3. Enter only merchant-confirmed values in the approved columns, then set that row to `approved`.
4. Leave every unreviewed row as `pending`; never edit `product_id` or `variant_id`.
5. Values are major currency units. Never divide or multiply them automatically, and never copy CAD into USD.
6. Run the validator, then the dry-run. Apply only after reviewing every planned action.

Example: if the merchant confirms Fresh Bananas should be CAD `2.99` and USD `2.49`, set those values and add `Corrected legacy CAD and added merchant-approved USD`. This does not infer that stored CAD `299` means `2.99`.

Example: if Fresh Broccoli CAD `449` is confirmed to remain `449` while USD is `3.49`, set CAD `449`, USD `3.49`, and note `CAD confirmed; USD added`. `449` never automatically means `4.49`.
