# Regional Price Cleanup Report

This report classifies the 125 missing regional price gaps exported from the Medusa backend database.

---

## 1. Summary of Classifications

| Classification | Count | Description |
| :--- | :--- | :--- |
| **PRODUCTION_STOREFRONT** | 38 | Legitimate physical grocery items displayed in the storefront. |
| **DIGITAL_PRODUCTION** | 5 | Legitimate digital resources (e-books, master class notes). |
| **TEST_DATA** | 28 | Items created for manual testing, sandbox pricing, or QA checks. |
| **DEBUG_DATA** | 25 | Dummy items created during development (e.g. `abcd`, `kdksks`). |
| **EMPTY_OR_INVALID_PRODUCT** | 7 | Products with incomplete uploads or placeholder files. |
| **OLD_E2E_DATA** | 22 | Automated end-to-end regression records containing timestamps in their titles. |
| **Total Gaps** | **125** | |

---

## 2. Row Details & Classifications

### 1. PRODUCTION_STOREFRONT (38 Rows)
- **Standard Groceries (30 rows)**: Rows 18-47 (Apples, Bananas, Strawberries, Grapes, Mangoes, Carrots, Broccoli, Spinach, Tomatoes, Potatoes, Milk, Yogurt, Cheese, Butter, Paneer, Breads, Croissant, Sourdough, Muffins, Cookies, Chicken, Lamb, Turkey, Beef, Sausages, Salmon, Prawns, Tuna, Crab, White Fish).
- **Storefront Fruits (2 rows)**: Row 48 (`Papaya`), Row 55 (`papaya`).
- **Storefront Packs (2 rows)**: Rows 49-50 (`Papaya Pack 2015cd` - Small & Large).
- **Storefront Pineapple (2 rows)**: Rows 56-57 (`Pineapple`).
- **Storefront Oils & Sweets (2 rows)**: Row 125 (`Organic OIL`), Row 126 (`chocolate`).

### 2. DIGITAL_PRODUCTION (5 Rows)
- **Master Class Series**: Row 73 (`master class notes`), Row 74 (`master class book`), Row 76 (`master class of chatgpt`).
- **Standard Books**: Row 90 (`organic book`), Row 118 (`physics book`).

### 3. TEST_DATA (28 Rows)
- **Manual Honey/Audit**: Row 2 (`Test Organic Honey`), Rows 3-12 (`Audit Test Product mqnomg5v82uo` etc. - 10 rows), Row 13 (`Audit Test Product f275b8c1`), Row 14 (`Test Product 62c6c1fc`), Row 15 (`Audit Test Product 88b24761`).
- **Indian Sweets QA**: Rows 58-59 (`Thekua` - 2 rows).
- **Price Mismatch Tests**: Rows 62, 65, 68 (`CAD-Only ...` - 3 rows), Rows 63, 66, 69 (`USD-Only ...` - 3 rows).
- **Digital Sandbox**: Row 86-88 (`Codex Digital Upload Verification` - 3 rows), Row 92 (`new test`), Rows 119-122 (`Price Final Test` - 4 rows).

### 4. DEBUG_DATA (25 Rows)
- **Standard Debug**: Row 17 (`Debug mqnq7xl0f0gw`).
- **Dummy Uploads**: Row 75 (`anaana`), Row 77 (`abcd`), Row 78 (`kdksks`), Row 79 (`ssff`), Rows 80-81 (`most imp` - 2 rows), Rows 82-83 (`hacker dock` - 2 rows), Rows 84-85 (`medusa doc` - 2 rows), Row 89 (`abcdefg`), Row 91 (`prince product`), Rows 95-96 (`first product` - 2 rows), Row 97 (`1 st product` - 1 row), Row 111 (`2nd book`), Row 112 (`3rd book`), Row 115 (`kmdcdlka`), Row 117 (`open ebbbok`).

### 5. EMPTY_OR_INVALID_PRODUCT (7 Rows)
- **Missing File Attachments**: Rows 60-61, 64, 67, 70 (`Empty File ...` - 5 rows).
- **Placeholder E-Book**: Rows 71-72 (`e book` - 2 rows).

### 6. OLD_E2E_DATA (22 Rows)
- **Physical E2E Products**: Row 16 (`Final 1782042414`), Rows 51-54 (`Papaya Final/Link ...` - 4 rows), Rows 123-124 (`ORGANIC OIL/DECIMAL OIL` - 2 rows).
- **Digital E2E Products**: Rows 93-94 (`Verification E-Book` - 2 rows), Rows 98-110 (`E2E Digital Book 1783183369763` etc. - 13 rows).
