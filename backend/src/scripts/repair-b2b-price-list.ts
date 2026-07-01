/**
 * repair-b2b-price-list.ts
 *
 * Medusa exec script that ensures the B2B customer group exists and that
 * the B2B price list targets it.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/repair-b2b-price-list.ts
 *
 * What it does:
 *   1. Finds or creates the "B2B Partners" customer group.
 *   2. Finds the existing "B2B customer" / "B2B Customers" / "Wholesale" price list.
 *   3. Attaches the price list to the B2B customer group via rules/conditions.
 *   4. Ensures the price list is active.
 *   5. Prints a summary of what was done.
 */

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../modules/b2b"

const PRICE_LIST_NAMES = ["B2B customer", "B2B Customers", "Wholesale", "B2B Price List", "B2B Pricing", "Wholesale Pricing"]

function getPriceListRules(priceList: any): any[] {
  const rules = priceList?.price_list_rules || priceList?.rules || []
  if (Array.isArray(rules)) return rules
  if (typeof rules?.toArray === "function") return rules.toArray()
  return []
}

function priceListHasCustomerGroupRule(priceList: any, customerGroupId: string): boolean {
  const directRule = priceList?.rules?.customer_group_id
  if (Array.isArray(directRule) && directRule.includes(customerGroupId)) return true
  if (directRule === customerGroupId) return true

  return getPriceListRules(priceList).some((rule: any) => {
    if (rule?.attribute !== "customer_group_id") return false
    return Array.isArray(rule.value)
      ? rule.value.includes(customerGroupId)
      : rule.value === customerGroupId
  })
}

function summarizePriceList(priceList: any) {
  const rules = getPriceListRules(priceList).map((rule: any) => ({
    id: rule.id,
    attribute: rule.attribute,
    value: rule.value,
  }))
  const prices = priceList?.prices || priceList?.money_amounts || []
  const priceCount = Array.isArray(prices)
    ? prices.length
    : typeof prices?.length === "number"
      ? prices.length
      : 0

  return {
    id: priceList?.id,
    title: priceList?.title,
    status: priceList?.status,
    type: priceList?.type,
    rules,
    price_overrides_count: priceCount,
  }
}

async function listApprovedCompanies(b2bService: any) {
  const filters = { status: ["approved", "active"] }
  const config = { take: 500, select: ["id", "company_name", "customer_id", "status"] }
  if (typeof b2bService.listCompanies === "function") {
    try {
      const companies = await b2bService.listCompanies(filters, config)
      if (Array.isArray(companies)) return companies
    } catch {
      // Fall back to broader lookup below.
    }
  }

  if (typeof b2bService.listAndCountCompanies === "function") {
    try {
      const [companies] = await b2bService.listAndCountCompanies(filters, config)
      if (Array.isArray(companies)) return companies
    } catch {
      const [companies] = await b2bService.listAndCountCompanies({}, config)
      return (companies || []).filter((company: any) => company.status === "approved" || company.status === "active")
    }
  }

  return []
}

export default async function repairB2BPriceList({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const customerModule: any = container.resolve(Modules.CUSTOMER)
  const pricingModule: any = container.resolve(Modules.PRICING)
  const b2bService: any = container.resolve(B2B_MODULE)

  logger.info("[repair-b2b-price-list] Starting B2B price list repair...")

  // ── Step 1: Find or create B2B customer group ──────────────────────────

  let b2bGroup: any = null

  // Try by known names
  for (const name of ["B2b parteners", "B2B Partners", "B2B Customers", "B2B customer", "Wholesale Customers"]) {
    try {
      const [groups] = await customerModule.listAndCountCustomerGroups({ name })
      if (groups?.[0]) {
        b2bGroup = groups[0]
        logger.info(`[repair-b2b-price-list] Found existing customer group: "${name}" (${groups[0].id})`)
        break
      }
    } catch {
      // continue
    }
  }

  // Try listing and matching by regex
  if (!b2bGroup) {
    try {
      const [allGroups] = await customerModule.listAndCountCustomerGroups({}, { take: 100 })
      b2bGroup = allGroups.find((g: any) => /b2b|wholesale|partner/i.test(g.name || ""))
      if (b2bGroup) {
        logger.info(`[repair-b2b-price-list] Found existing customer group: "${b2bGroup.name}" (${b2bGroup.id})`)
      }
    } catch {
      // continue
    }
  }

  // Create new group if none found
  if (!b2bGroup) {
    b2bGroup = await customerModule.createCustomerGroups({ name: "B2B Partners" })
    logger.info(`[repair-b2b-price-list] Created new customer group: "B2B Partners" (${b2bGroup.id})`)
  }

  let approvedCustomersChecked = 0
  let approvedCustomersAdded = 0
  try {
    const approvedCompanies = await listApprovedCompanies(b2bService)
    for (const company of approvedCompanies) {
      if (!company?.customer_id) continue
      approvedCustomersChecked += 1
      try {
        await customerModule.addCustomerToGroup({
          customer_group_id: b2bGroup.id,
          customer_id: company.customer_id,
        })
        approvedCustomersAdded += 1
        logger.info(`[repair-b2b-price-list] Added approved B2B customer ${company.customer_id} to ${b2bGroup.name}`)
      } catch (error: any) {
        if (!/already exists|duplicate|unique/i.test(String(error?.message || error))) {
          logger.warn(`[repair-b2b-price-list] Could not add customer ${company.customer_id} to group: ${error.message}`)
        }
      }
    }
  } catch (error: any) {
    logger.warn(`[repair-b2b-price-list] Could not backfill approved B2B customers into group: ${error.message}`)
  }

  // ── Step 2: Find the B2B price list ────────────────────────────────────

  let priceList: any = null

  for (const name of PRICE_LIST_NAMES) {
    try {
      const [lists] = await pricingModule.listAndCountPriceLists({ title: name })
      if (lists?.[0]) {
        priceList = lists[0]
        logger.info(`[repair-b2b-price-list] Found price list: "${name}" (${lists[0].id})`)
        break
      }
    } catch {
      // continue
    }
  }

  // Try listing all price lists if not found by name
  if (!priceList) {
    try {
      const [allLists] = await pricingModule.listAndCountPriceLists({}, { take: 100 })
      priceList = allLists.find((l: any) =>
        /b2b|wholesale/i.test(l.title || "")
      )
      if (priceList) {
        logger.info(`[repair-b2b-price-list] Found price list: "${priceList.title}" (${priceList.id})`)
      }
    } catch {
      // continue
    }
  }

  if (!priceList) {
    logger.warn("[repair-b2b-price-list] No B2B/Wholesale price list found. Creating one...")
    try {
      const createdPriceLists = await pricingModule.createPriceLists([{
        title: "B2B customer",
        description: "Wholesale prices for B2B customers",
        type: "sale",
        status: "active",
        rules: {
          customer_group_id: b2bGroup.id,
        },
        prices: [],
      }])
      priceList = createdPriceLists?.[0]
      logger.info(`[repair-b2b-price-list] Created new price list: "B2B customer" (${priceList.id})`)
    } catch (err: any) {
      logger.error(`[repair-b2b-price-list] Failed to create price list: ${err.message}`)
      return { success: false, message: err.message }
    }
  }

  // ── Step 3: Ensure price list is active ─────────────────────────────────

  if (priceList.status !== "active") {
    try {
      const updatedPriceLists = await pricingModule.updatePriceLists([{
        id: priceList.id,
        status: "active",
      }])
      priceList = updatedPriceLists?.[0] || priceList
      logger.info(`[repair-b2b-price-list] Activated price list: "${priceList.title}"`)
    } catch (err: any) {
      logger.error(`[repair-b2b-price-list] Failed to activate price list: ${err.message}`)
    }
  }

  // ── Step 4: Ensure price list rules target the B2B customer group ───────

  const [freshLists] = await pricingModule.listAndCountPriceLists(
    { id: priceList.id },
    { take: 1, relations: ["price_list_rules", "prices"] }
  )
  priceList = freshLists?.[0] || priceList
  const beforeState = summarizePriceList(priceList)
  logger.info("[repair-b2b-price-list] Before:")
  logger.info(JSON.stringify(beforeState, null, 2))

  let hasGroupRule = priceListHasCustomerGroupRule(priceList, b2bGroup.id)

  if (!hasGroupRule) {
    try {
      await pricingModule.setPriceListRules({
        price_list_id: priceList.id,
        rules: {
          customer_group_id: [b2bGroup.id],
        },
      })
      logger.info(`[repair-b2b-price-list] Added customer group rule to price list "${priceList.title}"`)

      const [verifiedLists] = await pricingModule.listAndCountPriceLists(
        { id: priceList.id },
        { take: 1, relations: ["price_list_rules", "prices"] }
      )
      priceList = verifiedLists?.[0] || priceList
      hasGroupRule = priceListHasCustomerGroupRule(priceList, b2bGroup.id)
    } catch (err: any) {
      logger.warn(`[repair-b2b-price-list] Could not set price list rules (may need manual setup): ${err.message}`)
    }
  } else {
    logger.info(`[repair-b2b-price-list] Price list already targets B2B customer group.`)
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  const summary = {
    success: true,
    customer_group: { id: b2bGroup.id, name: b2bGroup.name },
    price_list: { id: priceList.id, title: priceList.title, status: priceList.status || "active" },
    group_attached: hasGroupRule,
    approved_customers_checked: approvedCustomersChecked,
    approved_customers_added: approvedCustomersAdded,
    before: beforeState,
    after: summarizePriceList(priceList),
  }

  logger.info("[repair-b2b-price-list] ✅ Repair complete:")
  logger.info(JSON.stringify(summary, null, 2))

  return summary
}
