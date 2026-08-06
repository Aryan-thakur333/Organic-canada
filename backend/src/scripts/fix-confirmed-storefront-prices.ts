/**
 * fix-confirmed-storefront-prices.ts
 *
 * Targeted database repair for the 100x storefront price corruption.
 *
 * Architecture contract:
 *   CATALOG DATABASE PRICE = MAJOR UNITS (e.g. stored 19.99 → shown $19.99)
 *
 * Root cause:
 *   Vendor-create / admin-digital-create write paths multiplied human input by 100
 *   before the fix (e.g. user typed 19.99 → backend stored 1999).
 *
 * This script:
 *   - Loads a classified list of (variant_id, currency, inflated_amount, correct_amount, classification)
 *   - ONLY modifies records matching the allowlist exactly (variant ID + currency + stored amount)
 *     AND whose classification is strictly 'CONFIRMED_100X'
 *   - NEVER automatically repairs 'LIKELY_100X' or 'AMBIGUOUS' records.
 *   - Defaults to DRY RUN; requires explicit --apply to write
 *   - Is idempotent: if already corrected, skips
 *   - Never touches ERP-* products
 *   - Handles CAD and USD independently
 *
 * Usage:
 *   npx medusa exec src/scripts/fix-confirmed-storefront-prices.ts
 *   npx medusa exec src/scripts/fix-confirmed-storefront-prices.ts -- --apply
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export type RepairClassification = "CONFIRMED_100X" | "LIKELY_100X" | "AMBIGUOUS";

interface ConfirmedFix {
  variantId: string
  sku?: string
  title: string
  currency: string
  corruptedAmount: number      // what is in DB right now (inflated cents)
  correctAmount: number        // what it should be (major units)
  evidence: string
  classification: RepairClassification
}

const CONFIRMED_FIXES: ConfirmedFix[] = [
  // ── CONFIRMED_100X: Grocery / seed-category-products.ts ────────────────
  // Seeded with: { amount: 299, currency_code: "cad" } (cents)
  // Intended: $2.99 CAD per seed-category-products.ts line 23: price_cad: 2.99
  { variantId: "variant_01KVSFB7CD3CVS9WN4SCVE9YXT", title: "Fresh Bananas",       currency: "cad", corruptedAmount: 299,  correctAmount: 2.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:2.99 → stored 299" },
  { variantId: "variant_01KVSFB7EKARSRMJ14F2T30WPN", title: "Red Strawberries",    currency: "cad", corruptedAmount: 699,  correctAmount: 6.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:6.99 → stored 699" },
  { variantId: "variant_01KVSFB7GDJ405F2JQJ8A68700", title: "Green Grapes",        currency: "cad", corruptedAmount: 599,  correctAmount: 5.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:5.99 → stored 599" },
  { variantId: "variant_01KVSFB7JCCZ0V3E7Q7JQPAYGW", title: "Sweet Mangoes",      currency: "cad", corruptedAmount: 799,  correctAmount: 7.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:7.99 → stored 799" },
  { variantId: "variant_01KVSFB7M7DJ2NQP1MRFC161ZP", title: "Organic Carrots",    currency: "cad", corruptedAmount: 399,  correctAmount: 3.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:3.99 → stored 399" },
  { variantId: "variant_01KVSFB7PMVBDKJ5NHD9CQQ5NX", title: "Fresh Broccoli",     currency: "cad", corruptedAmount: 449,  correctAmount: 4.49,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:4.49 → stored 449" },
  { variantId: "variant_01KVSFB7SC8G5X8ZGN2TAPHTPG", title: "Green Spinach",      currency: "cad", corruptedAmount: 499,  correctAmount: 4.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:4.99 → stored 499" },
  { variantId: "variant_01KVSFB7WSVC6Y3C0E24ZSP890", title: "Red Tomatoes",       currency: "cad", corruptedAmount: 399,  correctAmount: 3.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:3.99 → stored 399" },
  { variantId: "variant_01KVSFB80MDTP8T8R6Z7GB0CQN", title: "Organic Potatoes",   currency: "cad", corruptedAmount: 549,  correctAmount: 5.49,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:5.49 → stored 549" },
  { variantId: "variant_01KVSFB83K91ZD462YSQSFPK8C", title: "Organic Milk",       currency: "cad", corruptedAmount: 649,  correctAmount: 6.49,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:6.49 → stored 649" },
  { variantId: "variant_01KVSFB86BTEA7ZEZ2M01STJYG", title: "Greek Yogurt",       currency: "cad", corruptedAmount: 599,  correctAmount: 5.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:5.99 → stored 599" },
  { variantId: "variant_01KVSFB88CG0FGKBQTG2KNBZE8", title: "Cheddar Cheese",     currency: "cad", corruptedAmount: 799,  correctAmount: 7.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:7.99 → stored 799" },
  { variantId: "variant_01KVSFB8B6VM0SCQ8NFQZRC239", title: "Fresh Butter",        currency: "cad", corruptedAmount: 549,  correctAmount: 5.49,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:5.49 → stored 549" },
  { variantId: "variant_01KVSFB8D6X5V3ZFD2N7NXRYY5", title: "Paneer Block",       currency: "cad", corruptedAmount: 699,  correctAmount: 6.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:6.99 → stored 699" },
  { variantId: "variant_01KVSFB8FGBH5QYY47W48PZY7B", title: "Whole Wheat Bread",  currency: "cad", corruptedAmount: 499,  correctAmount: 4.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:4.99 → stored 499" },
  { variantId: "variant_01KVSFB8HDHXQHA4PKSS9PQ89A", title: "Croissant",           currency: "cad", corruptedAmount: 349,  correctAmount: 3.49,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:3.49 → stored 349" },
  { variantId: "variant_01KVSFB8K8SQ0PERBD5HNEJE6M", title: "Sourdough Loaf",     currency: "cad", corruptedAmount: 699,  correctAmount: 6.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:6.99 → stored 699" },
  { variantId: "variant_01KVSFB8MVTVENGRRVN6V61TQN", title: "Muffins Pack",        currency: "cad", corruptedAmount: 899,  correctAmount: 8.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:8.99 → stored 899" },
  { variantId: "variant_01KVSFB8PAKFQGF5B8VM9DCSFJ", title: "Organic Cookies",    currency: "cad", corruptedAmount: 649,  correctAmount: 6.49,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:6.49 → stored 649" },
  { variantId: "variant_01KVSFB8R0M148Z5PHK7597K2E", title: "Chicken Breast",      currency: "cad", corruptedAmount: 1299, correctAmount: 12.99, classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:12.99 → stored 1299" },
  { variantId: "variant_01KVSFB8STSXDM303M3W7B1C6A", title: "Lamb Chops",          currency: "cad", corruptedAmount: 1899, correctAmount: 18.99, classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:18.99 → stored 1899" },
  { variantId: "variant_01KVSFB8VPBD68YJKXTHQMNQ8W", title: "Turkey Slices",       currency: "cad", corruptedAmount: 1099, correctAmount: 10.99, classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:10.99 → stored 1099" },
  { variantId: "variant_01KVSFB8X9WW94FBJDVM4J4VFH", title: "Beef Steak",          currency: "cad", corruptedAmount: 2299, correctAmount: 22.99, classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:22.99 → stored 2299" },
  { variantId: "variant_01KVSFB8Z51WWP1W03QSDBY8N3", title: "Chicken Sausages",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:9.99 → stored 999" },
  { variantId: "variant_01KVSFB92CWGYZ3A6S6EMXP6BE", title: "Salmon Fillet",       currency: "cad", corruptedAmount: 1999, correctAmount: 19.99, classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:19.99 → stored 1999" },
  { variantId: "variant_01KVSFB95KV4BKPP4JT3WD2MRP", title: "Fresh Prawns",        currency: "cad", corruptedAmount: 1699, correctAmount: 16.99, classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:16.99 → stored 1699" },
  { variantId: "variant_01KVSFB992JJ928VFRNB422JQ9", title: "Tuna Steak",           currency: "cad", corruptedAmount: 1899, correctAmount: 18.99, classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:18.99 → stored 1899" },
  { variantId: "variant_01KVSFB9C5W5C0347WGB5RNS4Y", title: "Crab Meat",            currency: "cad", corruptedAmount: 2199, correctAmount: 21.99, classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:21.99 → stored 2199" },
  { variantId: "variant_01KVSFB9F81ZZM6H5SSK61WGBN", title: "White Fish Fillet",  currency: "cad", corruptedAmount: 1499, correctAmount: 14.99, classification: "CONFIRMED_100X", evidence: "seed-category-products.ts price_cad:14.99 → stored 1499" },

  // ── CONFIRMED_100X: Visual Screenshot Verification (E-Book, Thekua, Pineapple, Papaya) ──
  // These specific products were explicitly observed as inflated in the customer storefront screenshot.
  { variantId: "variant_01KVW5WNE5G5M7Z46PKGYH3Y5X", title: "Thekua (mqrpiime)",       currency: "cad", corruptedAmount: 2000, correctAmount: 20.00, classification: "CONFIRMED_100X", evidence: "Screenshot $2,000.00; Vendor write path bug" },
  { variantId: "variant_01KVWF8FWA0H73XJWWDZX63PDD", title: "Thekua (mqrvd3g1)",       currency: "cad", corruptedAmount: 2000, correctAmount: 20.00, classification: "CONFIRMED_100X", evidence: "Screenshot $2,000.00; Vendor write path bug" },
  { variantId: "variant_01KVW0YMR5Q4X2P1H9QVJ0W6XK", title: "Pineapple (mqrmfj25)",   currency: "cad", corruptedAmount: 900,  correctAmount: 9.00,  classification: "CONFIRMED_100X", evidence: "Screenshot $900.00; Vendor write path bug" },
  { variantId: "variant_01KVW221YN1BGRD3G66J4KSJTQ", title: "Pineapple (mqrn4er9)",   currency: "cad", corruptedAmount: 700,  correctAmount: 7.00,  classification: "CONFIRMED_100X", evidence: "Screenshot $700.00; Vendor write path bug" },
  { variantId: "variant_01KVSZH9M19J7GWF1M8TV5D5ZZ", title: "papaya (mqqlb57)",        currency: "cad", corruptedAmount: 600,  correctAmount: 6.00,  classification: "CONFIRMED_100X", evidence: "Screenshot $600.00; Vendor write path bug" },
  { variantId: "variant_01KVSQ48EZAJH0KY9XVS2ZZ7BA", title: "Papaya Final",            currency: "cad", corruptedAmount: 799,  correctAmount: 7.99,  classification: "CONFIRMED_100X", evidence: "Screenshot $799.00; Vendor write path bug" },
  { variantId: "variant_01KVSPZAVZKYRRNKJJXMB3VJH0", title: "Papaya Pack (Small)",     currency: "cad", corruptedAmount: 499,  correctAmount: 4.99,  classification: "CONFIRMED_100X", evidence: "Screenshot $499.00; Vendor write path bug" },
  
  // E-Book Gardening CAD prices are explicitly visible in the storefront screenshot
  { variantId: "variant_01KW1E8K0NT9NVRYR5EDKC77CM", title: "E-Book Gardening (1)",   currency: "cad", corruptedAmount: 1999, correctAmount: 19.99, classification: "CONFIRMED_100X", evidence: "Screenshot $1,999.00; Admin digital write path bug" },
  { variantId: "variant_01KW1ECW9SKM0VPQBFPSXBGKCS", title: "E-Book Gardening (2)",   currency: "cad", corruptedAmount: 1999, correctAmount: 19.99, classification: "CONFIRMED_100X", evidence: "Screenshot $1,999.00; Admin digital write path bug" },
  { variantId: "variant_01KW1EJC9VS51Y9ZJZADMD4YCR", title: "E-Book Gardening (3)",   currency: "cad", corruptedAmount: 1999, correctAmount: 19.99, classification: "CONFIRMED_100X", evidence: "Screenshot $1,999.00; Admin digital write path bug" },
  { variantId: "variant_01KW1EP9JSQPZCPCQ3PZK1A1F6", title: "E-Book Gardening (4)",   currency: "cad", corruptedAmount: 1999, correctAmount: 19.99, classification: "CONFIRMED_100X", evidence: "Screenshot $1,999.00; Admin digital write path bug" },
  { variantId: "variant_01KW1EYP6Y9X6CXHN5FAEDYKZ5", title: "E-Book Gardening (5)",   currency: "cad", corruptedAmount: 1999, correctAmount: 19.99, classification: "CONFIRMED_100X", evidence: "Screenshot $1,999.00; Admin digital write path bug" },
  { variantId: "variant_01KWPX4HJTNC65C6YKW8PB33HC", title: "E-Book Gardening (6)",   currency: "cad", corruptedAmount: 1999, correctAmount: 19.99, classification: "CONFIRMED_100X", evidence: "Screenshot $1,999.00; Admin digital write path bug" },

  // ── LIKELY_100X: Other digital/vendor products (Not in screenshot, no seed source) ──
  // These records are highly likely to be 100x inflated but lack visual/seed evidence.
  // Under the "Confirmed Confirmation Rule", they are classified as LIKELY and skipped.
  { variantId: "variant_01KVMKJ3FGBYCJ3BSJWPV4CWB7", title: "Test Organic Honey", currency: "cad", corruptedAmount: 1499, correctAmount: 14.99, classification: "LIKELY_100X", evidence: "Vendor dashboard test product CAD" },
  { variantId: "variant_01KVSPT08VCN1E9D4CYYGQBG3Q", title: "Papaya (mqqc55q3)",       currency: "cad", corruptedAmount: 699,  correctAmount: 6.99,  classification: "LIKELY_100X", evidence: "Vendor dashboard Papaya CAD" },
  { variantId: "variant_01KVSPZAW0S335JX2KXGD7NEQJ", title: "Papaya Pack (Large)",     currency: "cad", corruptedAmount: 899,  correctAmount: 8.99,  classification: "LIKELY_100X", evidence: "Vendor dashboard Papaya Pack Large CAD" },
  { variantId: "variant_01KVSQ9RXKQWZBH7AK4VK7PTSV", title: "Papaya Link",             currency: "cad", corruptedAmount: 899,  correctAmount: 8.99,  classification: "LIKELY_100X", evidence: "Vendor dashboard Papaya Link CAD" },
  { variantId: "variant_01KVSQZ04ZZ120JMVMPCQ0PYQJ", title: "Papaya Link Array",       currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Vendor dashboard Papaya Link Array CAD" },
  { variantId: "variant_01KVSR6H59F57ED9M0GRE24BNJ", title: "Papaya Vendor Smoke",     currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Vendor dashboard Papaya Vendor Smoke CAD" },
  
  // lyuyhybuyhbb digital downloads
  { variantId: "variant_01KVMCKDKFZJWW29S963TVY186", title: "lyuyhybuyhbb (1)",        currency: "cad", corruptedAmount: 699,  correctAmount: 6.99,  classification: "LIKELY_100X", evidence: "Admin digital create CAD" },
  { variantId: "variant_01KVMCKDKFZJWW29S963TVY186", title: "lyuyhybuyhbb (1)",        currency: "usd", corruptedAmount: 901,  correctAmount: 9.01,  classification: "LIKELY_100X", evidence: "Admin digital create USD" },
  { variantId: "variant_01KVMCN2VRXEM77SFC9PQQKMQ3", title: "lyuyhybuyhbb (2)",        currency: "cad", corruptedAmount: 699,  correctAmount: 6.99,  classification: "LIKELY_100X", evidence: "Admin digital create CAD" },
  { variantId: "variant_01KVMCN2VRXEM77SFC9PQQKMQ3", title: "lyuyhybuyhbb (2)",        currency: "usd", corruptedAmount: 901,  correctAmount: 9.01,  classification: "LIKELY_100X", evidence: "Admin digital create USD" },

  // E-Book Gardening USD prices (only CAD is visible in storefront screenshot)
  { variantId: "variant_01KW1E8K0NT9NVRYR5EDKC77CM", title: "E-Book Gardening (1)",   currency: "usd", corruptedAmount: 2499, correctAmount: 24.99, classification: "LIKELY_100X", evidence: "Admin digital upload USD" },
  { variantId: "variant_01KW1ECW9SKM0VPQBFPSXBGKCS", title: "E-Book Gardening (2)",   currency: "usd", corruptedAmount: 2499, correctAmount: 24.99, classification: "LIKELY_100X", evidence: "Admin digital upload USD" },
  { variantId: "variant_01KW1EJC9VS51Y9ZJZADMD4YCR", title: "E-Book Gardening (3)",   currency: "usd", corruptedAmount: 2499, correctAmount: 24.99, classification: "LIKELY_100X", evidence: "Admin digital upload USD" },
  { variantId: "variant_01KW1EP9JSQPZCPCQ3PZK1A1F6", title: "E-Book Gardening (4)",   currency: "usd", corruptedAmount: 2499, correctAmount: 24.99, classification: "LIKELY_100X", evidence: "Admin digital upload USD" },
  { variantId: "variant_01KW1EYP6Y9X6CXHN5FAEDYKZ5", title: "E-Book Gardening (5)",   currency: "usd", corruptedAmount: 2499, correctAmount: 24.99, classification: "LIKELY_100X", evidence: "Admin digital upload USD" },
  { variantId: "variant_01KWPX4HJTNC65C6YKW8PB33HC", title: "E-Book Gardening (6)",   currency: "usd", corruptedAmount: 2499, correctAmount: 24.99, classification: "LIKELY_100X", evidence: "Admin digital upload USD" },

  // CAD-Only test products
  { variantId: "variant_01KW1EJCG4JQN437Y6ZM7N3TCH", title: "CAD-Only (1)",            currency: "cad", corruptedAmount: 950,  correctAmount: 9.50,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.50 CAD" },
  { variantId: "variant_01KW1EP9RWPPB3SB8E8GNZMN30", title: "CAD-Only (2)",            currency: "cad", corruptedAmount: 950,  correctAmount: 9.50,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.50 CAD" },
  { variantId: "variant_01KW1EYPC56TGZDNJVS8N2DZ8A", title: "CAD-Only (3)",            currency: "cad", corruptedAmount: 950,  correctAmount: 9.50,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.50 CAD" },
  
  // USD-Only test products
  { variantId: "variant_01KW1EJCKFF1S0EP2ZCTFFBQNJ", title: "USD-Only (1)",            currency: "usd", corruptedAmount: 1450, correctAmount: 14.50, classification: "LIKELY_100X", evidence: "Admin digital upload entered 14.50 USD" },
  { variantId: "variant_01KW1EP9X76KCJ2MTY9PNAK081", title: "USD-Only (2)",            currency: "usd", corruptedAmount: 1450, correctAmount: 14.50, classification: "LIKELY_100X", evidence: "Admin digital upload entered 14.50 USD" },
  { variantId: "variant_01KW1EYPEV6SS324ESV386FAMQ", title: "USD-Only (3)",            currency: "usd", corruptedAmount: 1450, correctAmount: 14.50, classification: "LIKELY_100X", evidence: "Admin digital upload entered 14.50 USD" },
  
  // E2E Digital Book series (entered 9.99)
  { variantId: "variant_01KWQ08JKGSYB0K690PSTC3TN3", title: "E2E Digital Book (1)",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  { variantId: "variant_01KWQ0DK6K6H6SFK0140PP1WEJ", title: "E2E Digital Book (2)",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  { variantId: "variant_01KWQ0EW6QHKYG9VJGED0AWW6E", title: "E2E Digital Book (3)",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  { variantId: "variant_01KWQ0FGY17EH6H97SZMQST22V", title: "E2E Digital Book (4)",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  { variantId: "variant_01KWQ19X5RGXHQ5HA22TEG3H9Y", title: "E2E Digital Book (5)",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  { variantId: "variant_01KWQ1BJ77T14ZJRW8ETNH7VC4", title: "E2E Digital Book (6)",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  { variantId: "variant_01KWQ1CWDAMKYPYS8SJ5X8K4PT", title: "E2E Digital Book (7)",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  { variantId: "variant_01KWQ1EK3EB6FCTZK7SM8GXJPE", title: "E2E Digital Book (8)",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  { variantId: "variant_01KWQ21E1ZPCTH0HKKP6VFG5FZ", title: "E2E Digital Book (9)",   currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  
  // master class notes / book (1700/999)
  { variantId: "variant_01KWHSBERK2DJ0DNPQR3NYZ9BY", title: "master class notes",      currency: "cad", corruptedAmount: 1700, correctAmount: 17.00, classification: "LIKELY_100X", evidence: "Admin digital upload entered 17.00" },
  { variantId: "variant_01KWHT1K91GCQTENK2204MYG41", title: "master class book",       currency: "cad", corruptedAmount: 999,  correctAmount: 9.99,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.99" },
  
  // master class of chatgpt (900)
  { variantId: "variant_01KWHZ0X8N97ZVTCZBK0BGHJF8", title: "master class of chatgpt",currency: "cad", corruptedAmount: 900,  correctAmount: 9.00,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 9.00" },
  
  // ORGANIC OIL (1000)
  { variantId: "variant_01KWW0QM4SQPZ5RZKAFAFGETBZ", title: "ORGANIC OIL 20260706",   currency: "cad", corruptedAmount: 1000, correctAmount: 10.00, classification: "LIKELY_100X", evidence: "Vendor create; stored 1000" },
  
  // DECIMAL OIL
  { variantId: "variant_01KWW0R7NT0T4WR9WM88ATBPTR", title: "DECIMAL OIL 20260706",   currency: "cad", corruptedAmount: 599,  correctAmount: 5.99,  classification: "LIKELY_100X", evidence: "Vendor create; stored 599" },
  
  // new-test
  { variantId: "variant_01KWPGEGD1VE1E8RCPSSZHGCCR", title: "new test",                currency: "cad", corruptedAmount: 500,  correctAmount: 5.00,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 5.00" },
  
  // Empty File products
  { variantId: "variant_01KW1E8K6N09Y4GB3RC81NES8M", title: "Empty File (1)",          currency: "usd", corruptedAmount: 500,  correctAmount: 5.00,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 5.00 USD" },
  { variantId: "variant_01KW1ECWDX1HNB8T3K58SG9C5W", title: "Empty File (2)",          currency: "usd", corruptedAmount: 500,  correctAmount: 5.00,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 5.00 USD" },
  { variantId: "variant_01KW1EJCP1SXBJ4K71R3050VRH", title: "Empty File (3)",          currency: "usd", corruptedAmount: 500,  correctAmount: 5.00,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 5.00 USD" },
  { variantId: "variant_01KW1EPA048N2MR3Z95G0JE5C0", title: "Empty File (4)",          currency: "usd", corruptedAmount: 500,  correctAmount: 5.00,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 5.00 USD" },
  { variantId: "variant_01KW1EYPHJ3V67JXKEG4G2N6V6", title: "Empty File (5)",          currency: "usd", corruptedAmount: 500,  correctAmount: 5.00,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 5.00 USD" },
  
  // anaana
  { variantId: "variant_01KWHV6ZRNCK5WTHEX10JPM6FZ", title: "anaana",                  currency: "cad", corruptedAmount: 196,  correctAmount: 1.96,  classification: "LIKELY_100X", evidence: "Admin digital upload entered 1.96" },
  
  // Codex DUV
  { variantId: "variant_01KWMAM042JP42Y1AX94QRR9V7", title: "Codex DUV (2000)",        currency: "cad", corruptedAmount: 2000, correctAmount: 20.00, classification: "LIKELY_100X", evidence: "Admin digital upload entered 20.00" },
]

export default async function fixConfirmedStorefrontPrices({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const pricing = container.resolve<any>("pricing")

  const args = process.argv
  const isApply   = args.includes("--apply")
  const targetSku = args.find(a => a.startsWith("--sku="))?.split("=")[1] ?? null
  const targetVid = args.find(a => a.startsWith("--variant-id="))?.split("=")[1] ?? null

  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║         CONFIRMED STOREFRONT PRICE REPAIR SCRIPT         ║")
  console.log("╚══════════════════════════════════════════════════════════╝")
  console.log(`Mode        : ${isApply ? "⚡ APPLY (writes to database)" : "🔍 DRY RUN (read-only)"}`)
  if (targetSku) console.log(`Filter SKU  : ${targetSku}`)
  if (targetVid) console.log(`Filter VID  : ${targetVid}`)
  console.log("")

  // Load all price records from DB
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "handle", "metadata",
      "variants.id", "variants.title", "variants.sku",
      "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code",
    ],
    pagination: { take: 10000 }
  })

  // Build lookup: variantId → { priceId, amount } per currency
  type PriceRecord = { priceId: string; amount: number; currency: string; variantSku: string }
  const priceMap = new Map<string, PriceRecord[]>()

  for (const product of products || []) {
    const isErp = String(product.handle || "").startsWith("erp-") || product.metadata?.erp_mapped === true
    for (const variant of product.variants || []) {
      const isErpSku = String(variant.sku || "").toUpperCase().startsWith("ERP-")
      if (isErp || isErpSku) continue  // hard skip ERP

      // SKU filter
      if (targetSku && variant.sku !== targetSku) continue
      // Variant ID filter
      if (targetVid && variant.id !== targetVid) continue

      const records: PriceRecord[] = (variant.prices || []).map((p: any) => ({
        priceId: p.id,
        amount: Number(p.amount),
        currency: String(p.currency_code).toLowerCase(),
        variantSku: variant.sku || "N/A"
      }))
      if (records.length) priceMap.set(variant.id, records)
    }
  }

  // Intersect allowlist with actual DB state
  interface PlannedUpdate {
    priceId: string
    variantId: string
    sku: string
    title: string
    currency: string
    before: number
    after: number
    evidence: string
    classification: RepairClassification
    status: "PLANNED" | "SKIP_ALREADY_CORRECT" | "SKIP_NOT_FOUND" | "SKIP_AMOUNT_MISMATCH" | "SKIP_LIKELY_OR_AMBIGUOUS"
  }

  const planned: PlannedUpdate[] = []
  let alreadyCorrect = 0
  let notFound = 0
  let amountMismatch = 0
  let likelyOrAmbiguousSkipped = 0

  for (const fix of CONFIRMED_FIXES) {
    const records = priceMap.get(fix.variantId)
    if (!records) {
      notFound++
      planned.push({ priceId: "", variantId: fix.variantId, sku: "N/A", title: fix.title, currency: fix.currency, before: fix.corruptedAmount, after: fix.correctAmount, evidence: fix.evidence, classification: fix.classification, status: "SKIP_NOT_FOUND" })
      continue
    }

    const priceRecord = records.find(r => r.currency === fix.currency.toLowerCase())
    if (!priceRecord) {
      notFound++
      planned.push({ priceId: "", variantId: fix.variantId, sku: records[0]?.variantSku || "N/A", title: fix.title, currency: fix.currency, before: fix.corruptedAmount, after: fix.correctAmount, evidence: fix.evidence, classification: fix.classification, status: "SKIP_NOT_FOUND" })
      continue
    }

    const actualAmount = priceRecord.amount

    // Idempotency: if already at correct value, skip
    if (actualAmount === fix.correctAmount) {
      alreadyCorrect++
      planned.push({ priceId: priceRecord.priceId, variantId: fix.variantId, sku: priceRecord.variantSku, title: fix.title, currency: fix.currency, before: actualAmount, after: fix.correctAmount, evidence: fix.evidence, classification: fix.classification, status: "SKIP_ALREADY_CORRECT" })
      continue
    }

    // Safety: only act if DB amount exactly matches expected corrupted value
    if (actualAmount !== fix.corruptedAmount) {
      amountMismatch++
      planned.push({ priceId: priceRecord.priceId, variantId: fix.variantId, sku: priceRecord.variantSku, title: fix.title, currency: fix.currency, before: actualAmount, after: fix.correctAmount, evidence: fix.evidence, classification: fix.classification, status: "SKIP_AMOUNT_MISMATCH" })
      continue
    }

    // Safety constraint: strictly enforce CONFIRMED_100X only for automatic repair
    if (fix.classification !== "CONFIRMED_100X") {
      likelyOrAmbiguousSkipped++
      planned.push({ priceId: priceRecord.priceId, variantId: fix.variantId, sku: priceRecord.variantSku, title: fix.title, currency: fix.currency, before: actualAmount, after: fix.correctAmount, evidence: fix.evidence, classification: fix.classification, status: "SKIP_LIKELY_OR_AMBIGUOUS" })
      continue
    }

    planned.push({ priceId: priceRecord.priceId, variantId: fix.variantId, sku: priceRecord.variantSku, title: fix.title, currency: fix.currency, before: actualAmount, after: fix.correctAmount, evidence: fix.evidence, classification: fix.classification, status: "PLANNED" })
  }

  const toApply = planned.filter(p => p.status === "PLANNED")

  // Print plan table
  console.log("┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐")
  console.log("│  PRICE REPAIR PLAN                                                                                           │")
  console.log("├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤")
  console.log(`${"Title".padEnd(30)} ${"Cur".padEnd(5)} ${"Before".padEnd(8)} ${"After".padEnd(8)} ${"Classification".padEnd(16)} Status`)
  console.log("─".repeat(110))
  for (const p of planned) {
    let statusText = ""
    if (p.status === "PLANNED") {
      statusText = "✅ WILL REPAIR"
    } else if (p.status === "SKIP_ALREADY_CORRECT") {
      statusText = "⏭  ALREADY CORRECT"
    } else if (p.status === "SKIP_NOT_FOUND") {
      statusText = "❓ NOT FOUND"
    } else if (p.status === "SKIP_AMOUNT_MISMATCH") {
      statusText = "⚠️  MISMATCH (SKIP)"
    } else if (p.status === "SKIP_LIKELY_OR_AMBIGUOUS") {
      statusText = "🚫 SKIPPED (REQUIRES MANUAL)"
    }
    console.log(`${p.title.slice(0, 29).padEnd(30)} ${p.currency.toUpperCase().padEnd(5)} ${String(p.before).padEnd(8)} ${String(p.after).padEnd(8)} ${p.classification.padEnd(16)} ${statusText}`)
  }
  console.log("─".repeat(110))
  console.log("")
  console.log(`Summary:`)
  console.log(`  Will repair (CONFIRMED_100X)      : ${toApply.length}`)
  console.log(`  Already correct                   : ${alreadyCorrect}`)
  console.log(`  Not found in DB                   : ${notFound}`)
  console.log(`  Amount mismatch (skipped)         : ${amountMismatch}`)
  console.log(`  Likely/Ambiguous (skipped manual) : ${likelyOrAmbiguousSkipped}`)
  console.log("")

  if (!isApply) {
    console.log("DRY RUN complete. No changes written.")
    console.log("To apply corrections, run:")
    console.log("  npx medusa exec src/scripts/fix-confirmed-storefront-prices.ts -- --apply")
    return
  }

  if (toApply.length === 0) {
    console.log("No CONFIRMED_100X updates to apply.")
    return
  }

  console.log("⚡ Applying price corrections to database...")
  let repaired = 0
  const errors: string[] = []
  for (const update of toApply) {
    try {
      await pricing.updatePrices([{ id: update.priceId, amount: update.after }])
      console.log(`  [OK] ${update.title} (${update.variantId}) ${update.currency.toUpperCase()}: ${update.before} → ${update.after}`)
      repaired++
    } catch (err: any) {
      const msg = `  [FAIL] ${update.title} (${update.variantId}) ${update.currency.toUpperCase()}: ${err?.message}`
      console.error(msg)
      errors.push(msg)
    }
  }

  console.log("")
  console.log(`✅ Repaired: ${repaired} / ${toApply.length}`)
  if (errors.length) {
    console.error(`❌ Errors:   ${errors.length}`)
    errors.forEach(e => console.error(e))
  }
}
