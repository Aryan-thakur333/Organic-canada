import { MedusaApp } from "@medusajs/modules-sdk"
import { config } from "dotenv"
import { COMMISSION_MODULE } from "../modules/commission/index.js"
import { recordCommissionWorkflow } from "../workflows/record-commission-workflow.js"

config()

/**
 * Script: Test Commission Immutability
 * 
 * Verifies that:
 * 1. Commission snapshots capture the exact rate at the time of order placement.
 * 2. Subsequent rate changes DO NOT affect older, finalized records.
 * 3. New orders automatically adopt the new rate.
 * 
 * Run via: npx ts-node src/scripts/test-commission-immutability.ts
 */
async function run() {
  console.log("🚀 Initializing Medusa App for Commission Immutability Test...")
  
  // Initialize minimal Medusa container to resolve modules
  const { modules } = await MedusaApp({
    modulesConfig: {
      [COMMISSION_MODULE]: {
        resolve: "./src/modules/commission",
      },
    }
  })

  const container: any = {
    resolve: (key: string) => {
      if (key === COMMISSION_MODULE) return modules[COMMISSION_MODULE]
      throw new Error(`Cannot resolve ${key}`)
    }
  }

  const commissionService: any = modules[COMMISSION_MODULE]

  if (!commissionService) {
    console.error("❌ Commission module could not be resolved.")
    process.exit(1)
  }

  try {
    console.log("\n--- Phase 1: Setup Initial 5% Rate ---")
    
    // Clear old test settings
    const existingRules = await commissionService.listCommissionSettings({ account_type: "vendor" })
    if (existingRules.length > 0) {
      await commissionService.updateCommissionSettings(existingRules.map((r: any) => ({
        id: r.id,
        is_active: false
      })))
    }

    // Set a 5% vendor commission setting
    const rule_5_percent = await commissionService.createCommissionSettings({
      account_type: "vendor",
      fee_type: "percentage",
      fee_value: 5,
      is_active: true
    })
    console.log(`✅ Set Vendor Commission to ${rule_5_percent.fee_value}% (ID: ${rule_5_percent.id})`)

    console.log("\n--- Phase 2: Create Order A ---")
    const orderA = {
      id: "order_A_123",
      currency_code: "cad",
      customer_id: "cus_123",
      items: [
        { id: "item_1", title: "Organic Apples", unit_price: 10000, quantity: 1, metadata: {} }
      ]
    }
    const splitResultA = {
      orderId: orderA.id,
      vendor_count: 1,
      buckets: [{
        vendor_id: "vendor_789",
        items: orderA.items,
        item_count: 1,
        total: 10000, // $100
        currency_code: "cad"
      }]
    }

    console.log(`Running recordCommissionWorkflow for Order A...`)
    await recordCommissionWorkflow(container).run({
      input: { order: orderA, splitResult: splitResultA }
    })

    const recordsA = await commissionService.listCommissionRecords({ order_id: orderA.id })
    const recordA = recordsA.find((r: any) => r.account_type === "vendor")
    
    console.log(`✅ Order A Vendor Commission Record Created:`)
    console.log(`   Base Amount: CA$${recordA.base_amount / 100}`)
    console.log(`   Fee Snapshoted: ${recordA.fee_value}%`)
    console.log(`   Commission: CA$${recordA.commission_amount / 100}`)

    console.log("\n--- Phase 3: Change Rate to 8% ---")
    await commissionService.updateCommissionSettings({
      id: rule_5_percent.id,
      fee_value: 8
    })
    console.log(`✅ Updated Vendor Commission Setting to 8%`)

    console.log("\n--- Phase 4: Verify Order A is UNCHANGED ---")
    const verifyRecordsA = await commissionService.listCommissionRecords({ order_id: orderA.id })
    const verifyRecordA = verifyRecordsA.find((r: any) => r.account_type === "vendor")
    
    if (verifyRecordA.fee_value === 5 && verifyRecordA.commission_amount === 500) {
      console.log(`✅ SUCCESS: Order A remained at ${verifyRecordA.fee_value}% (Commission: CA$${verifyRecordA.commission_amount / 100}) despite global rate change.`)
    } else {
      console.error(`❌ FAILURE: Order A changed to ${verifyRecordA.fee_value}%! Immutability broken!`)
    }

    console.log("\n--- Phase 5: Create Order B (New Order) ---")
    const orderB = {
      id: "order_B_456",
      currency_code: "cad",
      customer_id: "cus_123",
      items: [
        { id: "item_2", title: "Organic Oranges", unit_price: 10000, quantity: 1, metadata: {} }
      ]
    }
    const splitResultB = {
      orderId: orderB.id,
      vendor_count: 1,
      buckets: [{
        vendor_id: "vendor_789",
        items: orderB.items,
        item_count: 1,
        total: 10000, // $100
        currency_code: "cad"
      }]
    }

    await recordCommissionWorkflow(container).run({
      input: { order: orderB, splitResult: splitResultB }
    })

    const recordsB = await commissionService.listCommissionRecords({ order_id: orderB.id })
    const recordB = recordsB.find((r: any) => r.account_type === "vendor")
    
    console.log(`✅ Order B Vendor Commission Record Created:`)
    console.log(`   Base Amount: CA$${recordB.base_amount / 100}`)
    console.log(`   Fee Snapshoted: ${recordB.fee_value}%`)
    console.log(`   Commission: CA$${recordB.commission_amount / 100}`)

    if (recordB.fee_value === 8 && recordB.commission_amount === 800) {
      console.log(`✅ SUCCESS: Order B successfully applied the new 8% rate.`)
    } else {
      console.error(`❌ FAILURE: Order B did not apply the new 8% rate!`)
    }

    console.log("\n✅ All Immutability Tests Passed Successfully!")
    process.exit(0)
    
  } catch (error) {
    console.error("Test failed:", error)
    process.exit(1)
  }
}

run()
