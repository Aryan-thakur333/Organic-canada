import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { B2B_MODULE } from "../modules/b2b"

const B2B_GROUP_NAMES = ["B2b parteners", "B2B Partners", "B2B Customers", "B2B customer", "Wholesale Customers"]
const PRICE_LIST_NAMES = ["B2B customer", "B2B Customers", "Wholesale", "B2B Price List", "B2B Pricing", "Wholesale Pricing"]

function asArray(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value.toArray === "function") return value.toArray()
  return [value]
}

function getRules(priceList: any): any[] {
  return asArray(priceList?.price_list_rules || priceList?.rules)
}

function ruleTargetsGroup(rule: any, groupId: string) {
  if (rule?.attribute !== "customer_group_id") return false
  const value = rule.value
  return Array.isArray(value) ? value.includes(groupId) : value === groupId
}

async function findB2BGroup(customerModule: any) {
  for (const name of B2B_GROUP_NAMES) {
    const groups = await customerModule.listCustomerGroups?.({ name }, { take: 1 })
      ?? (await customerModule.listAndCountCustomerGroups({ name }, { take: 1 }))[0]
    if (groups?.[0]) return groups[0]
  }

  const allGroups = await customerModule.listCustomerGroups?.({}, { take: 100 })
    ?? (await customerModule.listAndCountCustomerGroups({}, { take: 100 }))[0]
  return allGroups.find((group: any) => /b2b|wholesale|partner/i.test(group.name || "")) || null
}

async function findB2BPriceList(pricingModule: any) {
  for (const title of PRICE_LIST_NAMES) {
    const lists = await pricingModule.listPriceLists?.({ title }, { take: 1, relations: ["price_list_rules", "prices"] })
      ?? (await pricingModule.listAndCountPriceLists({ title }, { take: 1, relations: ["price_list_rules", "prices"] }))[0]
    if (lists?.[0]) return lists[0]
  }

  const allLists = await pricingModule.listPriceLists?.({}, { take: 100, relations: ["price_list_rules", "prices"] })
    ?? (await pricingModule.listAndCountPriceLists({}, { take: 100, relations: ["price_list_rules", "prices"] }))[0]
  return allLists.find((list: any) => /b2b|wholesale/i.test(list.title || "")) || null
}

async function findSampleCompany(b2bService: any) {
  const filters = { status: ["approved", "active"] }
  try {
    const companies = await b2bService.listCompanies(filters, { take: 1, order: { updated_at: "DESC" } })
    return companies?.[0] || null
  } catch {
    const [companies] = await b2bService.listAndCountCompanies(filters, { take: 1, order: { updated_at: "DESC" } })
    return companies?.[0] || null
  }
}

async function getCustomerGroups(customerModule: any, customerId: string) {
  try {
    const customer = await customerModule.retrieveCustomer(customerId, { relations: ["groups"] })
    return asArray(customer?.groups || customer?.customer_groups)
  } catch {
    const groupCustomers = await customerModule.listCustomerGroupCustomers?.({ customer_id: customerId }, { take: 100 })
      ?? (await customerModule.listAndCountCustomerGroupCustomers?.({ customer_id: customerId }, { take: 100 }) || [[]])[0]
    const groupIds = asArray(groupCustomers).map((entry) => entry.customer_group_id).filter(Boolean)
    if (!groupIds.length) return []
    return customerModule.listCustomerGroups?.({ id: groupIds }, { take: 100 })
      ?? (await customerModule.listAndCountCustomerGroups({ id: groupIds }, { take: 100 }))[0]
  }
}

export default async function debugB2BPricingContext({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const customerModule: any = container.resolve(Modules.CUSTOMER)
  const pricingModule: any = container.resolve(Modules.PRICING)
  const b2bService: any = container.resolve(B2B_MODULE)

  const company = await findSampleCompany(b2bService)
  const customer = company?.customer_id
    ? await customerModule.retrieveCustomer(company.customer_id).catch(() => null)
    : null
  const customerGroups = company?.customer_id ? await getCustomerGroups(customerModule, company.customer_id) : []
  const b2bGroup = await findB2BGroup(customerModule)
  const priceList = await findB2BPriceList(pricingModule)
  const rules = getRules(priceList)
  const prices = asArray(priceList?.prices || priceList?.money_amounts).slice(0, 5)
  const targetGroupIds = rules
    .filter((rule) => rule?.attribute === "customer_group_id")
    .flatMap((rule) => Array.isArray(rule.value) ? rule.value : [rule.value])
    .filter(Boolean)

  const summary = {
    customer: {
      id: customer?.id || company?.customer_id || null,
      email: customer?.email || company?.email || null,
    },
    company: company
      ? { id: company.id, name: company.company_name, status: company.status }
      : null,
    assigned_customer_groups: customerGroups.map((group: any) => ({ id: group.id, name: group.name })),
    b2b_customer_group: b2bGroup ? { id: b2bGroup.id, name: b2bGroup.name } : null,
    price_list: priceList ? { id: priceList.id, title: priceList.title, status: priceList.status, type: priceList.type } : null,
    price_list_rules: rules.map((rule: any) => ({ id: rule.id, attribute: rule.attribute, value: rule.value })),
    price_list_target_customer_group_ids: targetGroupIds,
    price_list_targets_b2b_group: Boolean(b2bGroup && rules.some((rule) => ruleTargetsGroup(rule, b2bGroup.id))),
    price_overrides_sample: prices.map((price: any) => ({
      id: price.id,
      amount: price.amount,
      currency_code: price.currency_code,
      price_set_id: price.price_set_id,
    })),
  }

  logger.info("[debug-b2b-pricing-context]")
  logger.info(JSON.stringify(summary, null, 2))
  return summary
}
