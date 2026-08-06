/**
 * report-storefront-price-anomalies.ts
 *
 * READ-ONLY audit script. Queries every variant price in the catalog and
 * classifies it against the known allowlist of confirmed corrupted records.
 *
 * Classification:
 *   CONFIRMED_100X  – variant ID and amount match an entry in the allowlist
 *   LIKELY_100X     – seeded grocery product with integer amount matching cents
 *   AMBIGUOUS       – large integer amount but no confirmed evidence
 *   NORMAL          – appears correct (major unit, ERP-excluded, or already fixed)
 *
 * Usage:
 *   npx medusa exec src/scripts/report-storefront-price-anomalies.ts
 */

import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Confirmed and Likely corrupted variant IDs from fix-confirmed-storefront-prices.ts
const CORRUPTED_VARIANT_AMOUNTS: Record<string, Record<string, { amount: number, classification: "CONFIRMED_100X" | "LIKELY_100X" | "AMBIGUOUS" }>> = {
  // Groceries (CONFIRMED_100X)
  "variant_01KVSFB7CD3CVS9WN4SCVE9YXT": { cad: { amount: 299, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB7EKARSRMJ14F2T30WPN": { cad: { amount: 699, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB7GDJ405F2JQJ8A68700": { cad: { amount: 599, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB7JCCZ0V3E7Q7JQPAYGW": { cad: { amount: 799, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB7M7DJ2NQP1MRFC161ZP": { cad: { amount: 399, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB7PMVBDKJ5NHD9CQQ5NX": { cad: { amount: 449, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB7SC8G5X8ZGN2TAPHTPG": { cad: { amount: 499, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB7WSVC6Y3C0E24ZSP890": { cad: { amount: 399, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB80MDTP8T8R6Z7GB0CQN": { cad: { amount: 549, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB83K91ZD462YSQSFPK8C": { cad: { amount: 649, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB86BTEA7ZEZ2M01STJYG": { cad: { amount: 599, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB88CG0FGKBQTG2KNBZE8": { cad: { amount: 799, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8B6VM0SCQ8NFQZRC239": { cad: { amount: 549, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8D6X5V3ZFD2N7NXRYY5": { cad: { amount: 699, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8FGBH5QYY47W48PZY7B": { cad: { amount: 499, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8HDHXQHA4PKSS9PQ89A": { cad: { amount: 349, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8K8SQ0PERBD5HNEJE6M": { cad: { amount: 699, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8MVTVENGRRVN6V61TQN": { cad: { amount: 899, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8PAKFQGF5B8VM9DCSFJ": { cad: { amount: 649, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8R0M148Z5PHK7597K2E": { cad: { amount: 1299, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8STSXDM303M3W7B1C6A": { cad: { amount: 1899, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8VPBD68YJKXTHQMNQ8W": { cad: { amount: 1099, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8X9WW94FBJDVM4J4VFH": { cad: { amount: 2299, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB8Z51WWP1W03QSDBY8N3": { cad: { amount: 999, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB92CWGYZ3A6S6EMXP6BE": { cad: { amount: 1999, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB95KV4BKPP4JT3WD2MRP": { cad: { amount: 1699, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB992JJ928VFRNB422JQ9": { cad: { amount: 1899, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB9C5W5C0347WGB5RNS4Y": { cad: { amount: 2199, classification: "CONFIRMED_100X" } },
  "variant_01KVSFB9F81ZZM6H5SSK61WGBN": { cad: { amount: 1499, classification: "CONFIRMED_100X" } },

  // Visual Screenshot Verification (CONFIRMED_100X in CAD)
  "variant_01KVW5WNE5G5M7Z46PKGYH3Y5X": { cad: { amount: 2000, classification: "CONFIRMED_100X" } },
  "variant_01KVWF8FWA0H73XJWWDZX63PDD": { cad: { amount: 2000, classification: "CONFIRMED_100X" } },
  "variant_01KVW0YMR5Q4X2P1H9QVJ0W6XK": { cad: { amount: 900, classification: "CONFIRMED_100X" } },
  "variant_01KVW221YN1BGRD3G66J4KSJTQ": { cad: { amount: 700, classification: "CONFIRMED_100X" } },
  "variant_01KVSZH9M19J7GWF1M8TV5D5ZZ": { cad: { amount: 600, classification: "CONFIRMED_100X" } },
  "variant_01KVSQ48EZAJH0KY9XVS2ZZ7BA": { cad: { amount: 799, classification: "CONFIRMED_100X" } },
  "variant_01KVSPZAVZKYRRNKJJXMB3VJH0": { cad: { amount: 499, classification: "CONFIRMED_100X" } },
  
  "variant_01KW1E8K0NT9NVRYR5EDKC77CM": { cad: { amount: 1999, classification: "CONFIRMED_100X" }, usd: { amount: 2499, classification: "LIKELY_100X" } },
  "variant_01KW1ECW9SKM0VPQBFPSXBGKCS": { cad: { amount: 1999, classification: "CONFIRMED_100X" }, usd: { amount: 2499, classification: "LIKELY_100X" } },
  "variant_01KW1EJC9VS51Y9ZJZADMD4YCR": { cad: { amount: 1999, classification: "CONFIRMED_100X" }, usd: { amount: 2499, classification: "LIKELY_100X" } },
  "variant_01KW1EP9JSQPZCPCQ3PZK1A1F6": { cad: { amount: 1999, classification: "CONFIRMED_100X" }, usd: { amount: 2499, classification: "LIKELY_100X" } },
  "variant_01KW1EYP6Y9X6CXHN5FAEDYKZ5": { cad: { amount: 1999, classification: "CONFIRMED_100X" }, usd: { amount: 2499, classification: "LIKELY_100X" } },
  "variant_01KWPX4HJTNC65C6YKW8PB33HC": { cad: { amount: 1999, classification: "CONFIRMED_100X" }, usd: { amount: 2499, classification: "LIKELY_100X" } },

  // LIKELY_100X (No screenshot/seed source evidence)
  "variant_01KVMKJ3FGBYCJ3BSJWPV4CWB7": { cad: { amount: 1499, classification: "LIKELY_100X" } },
  "variant_01KVSPT08VCN1E9D4CYYGQBG3Q": { cad: { amount: 699, classification: "LIKELY_100X" } },
  "variant_01KVSPZAW0S335JX2KXGD7NEQJ": { cad: { amount: 899, classification: "LIKELY_100X" } },
  "variant_01KVSQ9RXKQWZBH7AK4VK7PTSV": { cad: { amount: 899, classification: "LIKELY_100X" } },
  "variant_01KVSQZ04ZZ120JMVMPCQ0PYQJ": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KVSR6H59F57ED9M0GRE24BNJ": { cad: { amount: 999, classification: "LIKELY_100X" } },
  
  "variant_01KVMCKDKFZJWW29S963TVY186": { cad: { amount: 699, classification: "LIKELY_100X" }, usd: { amount: 901, classification: "LIKELY_100X" } },
  "variant_01KVMCN2VRXEM77SFC9PQQKMQ3": { cad: { amount: 699, classification: "LIKELY_100X" }, usd: { amount: 901, classification: "LIKELY_100X" } },
  
  "variant_01KW1EJCG4JQN437Y6ZM7N3TCH": { cad: { amount: 950, classification: "LIKELY_100X" } },
  "variant_01KW1EP9RWPPB3SB8E8GNZMN30": { cad: { amount: 950, classification: "LIKELY_100X" } },
  "variant_01KW1EYPC56TGZDNJVS8N2DZ8A": { cad: { amount: 950, classification: "LIKELY_100X" } },
  
  "variant_01KW1EJCKFF1S0EP2ZCTFFBQNJ": { usd: { amount: 1450, classification: "LIKELY_100X" } },
  "variant_01KW1EP9X76KCJ2MTY9PNAK081": { usd: { amount: 1450, classification: "LIKELY_100X" } },
  "variant_01KW1EYPEV6SS324ESV386FAMQ": { usd: { amount: 1450, classification: "LIKELY_100X" } },
  
  "variant_01KWQ08JKGSYB0K690PSTC3TN3": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KWQ0DK6K6H6SFK0140PP1WEJ": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KWQ0EW6QHKYG9VJGED0AWW6E": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KWQ0FGY17EH6H97SZMQST22V": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KWQ19X5RGXHQ5HA22TEG3H9Y": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KWQ1BJ77T14ZJRW8ETNH7VC4": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KWQ1CWDAMKYPYS8SJ5X8K4PT": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KWQ1EK3EB6FCTZK7SM8GXJPE": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KWQ21E1ZPCTH0HKKP6VFG5FZ": { cad: { amount: 999, classification: "LIKELY_100X" } },
  
  "variant_01KWHSBERK2DJ0DNPQR3NYZ9BY": { cad: { amount: 1700, classification: "LIKELY_100X" } },
  "variant_01KWHT1K91GCQTENK2204MYG41": { cad: { amount: 999, classification: "LIKELY_100X" } },
  "variant_01KWHZ0X8N97ZVTCZBK0BGHJF8": { cad: { amount: 900, classification: "LIKELY_100X" } },
  
  "variant_01KWW0QM4SQPZ5RZKAFAFGETBZ": { cad: { amount: 1000, classification: "LIKELY_100X" } },
  "variant_01KWW0R7NT0T4WR9WM88ATBPTR": { cad: { amount: 599, classification: "LIKELY_100X" } },
  "variant_01KWPGEGD1VE1E8RCPSSZHGCCR": { cad: { amount: 500, classification: "LIKELY_100X" } },
  
  "variant_01KW1E8K6N09Y4GB3RC81NES8M": { usd: { amount: 500, classification: "LIKELY_100X" } },
  "variant_01KW1ECWDX1HNB8T3K58SG9C5W": { usd: { amount: 500, classification: "LIKELY_100X" } },
  "variant_01KW1EJCP1SXBJ4K71R3050VRH": { usd: { amount: 500, classification: "LIKELY_100X" } },
  "variant_01KW1EPA048N2MR3Z95G0JE5C0": { usd: { amount: 500, classification: "LIKELY_100X" } },
  "variant_01KW1EYPHJ3V67JXKEG4G2N6V6": { usd: { amount: 500, classification: "LIKELY_100X" } },
  
  "variant_01KWHV6ZRNCK5WTHEX10JPM6FZ": { cad: { amount: 196, classification: "LIKELY_100X" } },
  "variant_01KWMAM042JP42Y1AX94QRR9V7": { cad: { amount: 2000, classification: "LIKELY_100X" } },
}

const AMBIGUOUS_THRESHOLD_IF_INTEGER = 5000

export default async function reportStorefrontPriceAnomalies({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║       STOREFRONT PRICE ANOMALY REPORT (READ ONLY)        ║")
  console.log("╚══════════════════════════════════════════════════════════╝")
  console.log("")

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "handle", "metadata", "status", "created_at", "updated_at",
      "sales_channels.id", "sales_channels.name",
      "variants.id", "variants.title", "variants.sku", "variants.created_at",
      "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code",
    ],
    pagination: { take: 10000 }
  })

  const rows: any[] = []
  const counts = { CONFIRMED_100X: 0, LIKELY_100X: 0, AMBIGUOUS: 0, NORMAL: 0 }

  for (const product of products || []) {
    const isErp = String(product.handle || "").startsWith("erp-") || product.metadata?.erp_mapped === true
    for (const variant of product.variants || []) {
      const isErpSku = String(variant.sku || "").toUpperCase().startsWith("ERP-")

      for (const price of variant.prices || []) {
        const currency = String(price.currency_code || "").toLowerCase()
        if (currency !== "cad" && currency !== "usd") continue
        const amount = Number(price.amount)
        if (!Number.isFinite(amount)) continue

        let classification = "NORMAL"
        let suspectedCorrect: number | null = null
        let reason = ""

        if (isErp || isErpSku) {
          classification = "NORMAL"
          reason = "ERP product — excluded from repair"
        } else {
          // Check allowlist/likely list
          const entry = CORRUPTED_VARIANT_AMOUNTS[variant.id]?.[currency]
          if (entry) {
            if (amount === entry.amount) {
              classification = entry.classification
              suspectedCorrect = Math.round(amount / 100 * 100) / 100
              reason = `In allowed repair catalog as ${entry.classification}`
            } else if (amount === Math.round(entry.amount / 100 * 100) / 100) {
              classification = "NORMAL"
              reason = "Previously repaired — amount matches correct major-unit value"
            } else {
              classification = "AMBIGUOUS"
              reason = `In allowlist but amount ${amount} differs from expected corrupted (${entry.amount})`
            }
          } else if (Number.isInteger(amount) && amount >= AMBIGUOUS_THRESHOLD_IF_INTEGER) {
            classification = "AMBIGUOUS"
            reason = `Large integer amount (${amount}) — insufficient evidence to auto-classify`
          } else {
            classification = "NORMAL"
            reason = "Amount appears to be a valid major-unit price"
          }
        }

        counts[classification as keyof typeof counts]++
        rows.push({
          classification,
          product_id: product.id,
          variant_id: variant.id,
          sku: variant.sku || "N/A",
          title: `${product.title}`,
          currency: currency.toUpperCase(),
          stored_amount: amount,
          suspected_correct: suspectedCorrect,
          created_at: product.created_at,
          metadata_type: product.metadata?.product_type || (product.metadata?.is_digital ? "digital" : "standard"),
          reason,
        })
      }
    }
  }

  // Sort
  const order = ["CONFIRMED_100X", "LIKELY_100X", "AMBIGUOUS", "NORMAL"]
  rows.sort((a, b) => order.indexOf(a.classification) - order.indexOf(b.classification))

  console.log("RESULTS:")
  console.log("")
  console.log(`${"Status".padEnd(16)} ${"Title".padEnd(40)} ${"Cur".padEnd(5)} ${"Amount".padEnd(10)} ${"Correct?".padEnd(10)} Reason`)
  console.log("─".repeat(110))
  for (const r of rows) {
    const label = r.classification === "CONFIRMED_100X" ? "❌ CONFIRMED_100X" :
                  r.classification === "LIKELY_100X" ? "🔶 LIKELY_100X" :
                  r.classification === "AMBIGUOUS" ? "⚠️  AMBIGUOUS" : "✅ NORMAL"
    console.log(`${label.padEnd(18)} ${r.title.slice(0, 39).padEnd(40)} ${r.currency.padEnd(5)} ${String(r.stored_amount).padEnd(10)} ${String(r.suspected_correct ?? "-").padEnd(10)} ${r.reason}`)
  }

  console.log("")
  console.log("╔════════════════════════════════╗")
  console.log("║           SUMMARY              ║")
  console.log("╠════════════════════════════════╣")
  console.log(`║ CONFIRMED_100X  : ${String(counts.CONFIRMED_100X).padEnd(12)} ║`)
  console.log(`║ LIKELY_100X     : ${String(counts.LIKELY_100X).padEnd(12)} ║`)
  console.log(`║ AMBIGUOUS       : ${String(counts.AMBIGUOUS).padEnd(12)} ║`)
  console.log(`║ NORMAL          : ${String(counts.NORMAL).padEnd(12)} ║`)
  console.log("╚════════════════════════════════╝")
  console.log("")
  console.log("To repair CONFIRMED_100X records only:")
  console.log("  npx medusa exec src/scripts/fix-confirmed-storefront-prices.ts")
  console.log("  npx medusa exec src/scripts/fix-confirmed-storefront-prices.ts -- --apply")
}
