import type { ExecArgs } from "@medusajs/framework/types"
import { calculateMultiVendorPayouts } from "../utils/commission/vendor-payout.js"

/**
 * Script to test multi-vendor commission calculation logic
 * without triggering checkout or creating real orders.
 * 
 * Run with:
 * npx medusa exec ./src/scripts/test-multi-vendor-commission.ts
 */
export default async function testMultiVendorCommission({ container }: ExecArgs) {
  console.log("=== Multi-Vendor Commission Test ===")

  // Mock Active Vendor Rule (e.g. 15% Platform Commission)
  const activeVendorRule = {
    fee_type: "percentage" as const,
    fee_value: 15,
  }

  // Helper to print results
  const printResults = (testName: string, buckets: any[], results: any[]) => {
    console.log(`\n--- Test: ${testName} ---`)
    let totalVendorSubtotals = 0
    let totalPlatformCommission = 0
    let totalVendorPayout = 0

    results.forEach(res => {
      console.log(`Vendor: ${res.vendor_id}`)
      console.log(`  Subtotal:      CA$${(res.subtotal / 100).toFixed(2)}`)
      console.log(`  Commission:   -CA$${(res.commission_amount / 100).toFixed(2)} (${activeVendorRule.fee_value}%)`)
      console.log(`  Payout:       =CA$${(res.vendor_payout / 100).toFixed(2)}`)
      
      // Math verification check
      const mathCheck = (res.subtotal - res.commission_amount) === res.vendor_payout
      if (!mathCheck) {
        console.error(`  ❌ MATH FAILED! Subtotal - Commission !== Payout`)
      }

      totalVendorSubtotals += res.subtotal
      totalPlatformCommission += res.commission_amount
      totalVendorPayout += res.vendor_payout
    })

    console.log(`\n  Totals for this order:`)
    console.log(`  Total Vendor Items Value: CA$${(totalVendorSubtotals / 100).toFixed(2)}`)
    console.log(`  Total Platform Revenue:   CA$${(totalPlatformCommission / 100).toFixed(2)}`)
    console.log(`  Total Payout to Vendors:  CA$${(totalVendorPayout / 100).toFixed(2)}`)
  }

  // 1. Single Vendor Test
  const singleVendorBuckets = [
    {
      vendor_id: "vend_apple",
      item_count: 2,
      total: 5000, // CA$50.00
    }
  ]
  const singleResults = calculateMultiVendorPayouts(singleVendorBuckets, activeVendorRule)
  printResults("Single Vendor Order", singleVendorBuckets, singleResults)

  // 2. Multi-Vendor Test
  const multiVendorBuckets = [
    {
      vendor_id: "vend_electronics",
      item_count: 1,
      total: 100000, // CA$1000.00
    },
    {
      vendor_id: "vend_books",
      item_count: 3,
      total: 4550, // CA$45.50
    }
  ]
  const multiResults = calculateMultiVendorPayouts(multiVendorBuckets, activeVendorRule)
  printResults("Multi-Vendor Order", multiVendorBuckets, multiResults)

  // 3. Fixed Fee Edge Case Test
  const fixedVendorRule = {
    fee_type: "fixed" as const,
    fee_value: 1000, // CA$10.00 fixed per vendor bucket
  }

  const fixedFeeBuckets = [
    {
      vendor_id: "vend_toys",
      item_count: 1,
      total: 500, // CA$5.00 (Commission shouldn't exceed subtotal)
    },
    {
      vendor_id: "vend_games",
      item_count: 1,
      total: 5000, // CA$50.00
    }
  ]
  const fixedResults = calculateMultiVendorPayouts(fixedFeeBuckets, fixedVendorRule)
  
  console.log(`\n--- Test: Fixed Fee Order (Capped at Subtotal) ---`)
  fixedResults.forEach(res => {
    console.log(`Vendor: ${res.vendor_id}`)
    console.log(`  Subtotal:      CA$${(res.subtotal / 100).toFixed(2)}`)
    console.log(`  Commission:   -CA$${(res.commission_amount / 100).toFixed(2)} (Fixed CA$10.00 max)`)
    console.log(`  Payout:       =CA$${(res.vendor_payout / 100).toFixed(2)}`)
  })

  console.log("\n=== Test Complete ===")
}
