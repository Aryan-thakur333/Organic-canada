# Digital Regional Price Review

This document audits the 63 digital product price gaps in `missing-region-prices.csv` (lines 60-122).

---

## 1. Grouped Digital Products

### A. Legitimate Published Digital Products (5 Rows)
These are production-ready digital products that require storefront pricing:
1. `master class notes` (row 73)
2. `master class book` (row 74)
3. `master class of chatgpt` (row 76)
4. `organic book` (row 90)
5. `physics book` (row 118)

### B. Empty or Invalid Products (7 Rows)
These are products created without proper file attachments or are generic placeholders:
- `Empty File ...` (rows 60, 61, 64, 67, 70)
- `e book` (rows 71-72)

### C. Old E2E Products (17 Rows)
These are timestamped digital downloads generated during automated Cypress or Playwright end-to-end tests:
- `Verification E-Book` (rows 93-94)
- `E2E Digital Book 1783183369763` (rows 98-99)
- `E2E Digital Book 1783183395158` (rows 100-101)
- `E2E Digital Book 1783183460882` (row 102)
- `E2E Digital Book 1783183625341` (row 103)
- `E2E Digital Book 1783183667294` (row 104)
- `E2E Digital Book 1783183688543` (row 105)
- `E2E Digital Book 1783184553026` (row 107)
- `E2E Digital Book 1783184607341` (row 108)
- `E2E Digital Book 1783184650573` (row 109)
- `E2E Digital Book 1783184706575` (row 110)
- `E2E Digital Book 1783185281422` (row 113)
- `E2E Digital Book 1783185324049` (row 114)
- `E2E Digital Book 1783187248294` (row 116)

### D. Test Uploads (14 Rows)
These were created during verification of file upload endpoints or pricing validations:
- `CAD-Only ...` (rows 62, 65, 68)
- `USD-Only ...` (rows 63, 66, 69)
- `Codex Digital Upload Verification` (rows 86-88)
- `new test` (row 92)
- `Price Final Test ...` (rows 119-122)

### E. Debug Products (20 Rows)
These are dummy products created during manual workspace runs:
- `anaana` (row 75)
- `abcd` (row 77)
- `kdksks` (row 78)
- `ssff` (row 79)
- `most imp` (rows 80-81)
- `hacker dock` (rows 82-83)
- `medusa doc` (rows 84-85)
- `abcdefg` (row 89)
- `prince product` (row 91)
- `first product` (rows 95-96)
- `1 st product` (row 97)
- `2nd book` (row 111)
- `3rd book` (row 112)
- `kmdcdlka` (row 115)
- `open ebbbok` (row 117)

---

## 2. Policy Recommendation
Only the **5 Legitimate Published Digital Products** should receive regional CAD/USD prices. The rest of the test, E2E, empty, and debug products should be left unpriced and scheduled for automated deletion/cleanup in the next maintenance cycle.
