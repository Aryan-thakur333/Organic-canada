import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { convertDraftOrderWorkflow } from "@medusajs/medusa/core-flows"
import { B2B_MODULE } from "../modules/b2b/index"
import { COMMISSION_MODULE } from "../modules/commission"
import { QuoteStatus } from "./create-request-for-quote"
import { createOrReuseB2BQuotePaymentCollection } from "./b2b/create-or-reuse-payment-collection"
import {
  calculateLineTotalMinor,
  getQuoteNegotiatedTotalMinor,
  getQuoteOriginalTotalMinor,
  normalizeMoneyToMinor,
  normalizeStoredMinor,
  quoteAdjustmentTotalMinor,
  storedMinor,
} from "../utils/b2b/money"
import { validateQuoteInventoryAvailability } from "../utils/b2b/validate-quote-inventory"
import { ensureOrderPaymentCollection } from "../utils/b2b/quote-payment"
import {
  B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE,
  B2B_CUSTOMER_COMMISSION_POLICY,
  getQuoteCommissionSnapshot,
  getQuoteFinalPayableTotalMinor,
  getQuoteNegotiatedSubtotalMinor,
} from "../utils/b2b/quote-commission"

export type CustomerAcceptQuoteInput = {
  quote_id: string
  customer_id: string
  offer_version?: number | string | null
  settlement_mode?: "online" | "offline" | "invoice" | null
  selected_payment_provider_id?: "stripe" | "paypal" | "invoice" | "offline" | null
  shipping_address_id?: string | null
  shipping_address?: Record<string, any> | null
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeQuoteUnitPriceToMinor(value: any, source = "unknown") {
  const n = Number(value)

  if (!Number.isFinite(n) || n <= 0) {
    const error: any = new Error("Invalid quote unit price")
    error.status = 400
    throw error
  }

  if (source === "stored_quote") {
    return Math.round(n)
  }

  if (source === "frontend_input") {
    return normalizeMoneyToMinor(n, "frontend_decimal")
  }

  return normalizeMoneyToMinor(n, "auto")
}

function safeString(value: any, fallback: string) {
  const str = String(value || "").trim()
  return str || fallback
}

function quoteOrderId(quote: any) {
  return quote.order_id || quote.created_order_id || quote.metadata?.order_id || null
}

function quoteIsExpired(quote: any) {
  return Boolean(quote.expires_at && new Date(quote.expires_at).getTime() < Date.now())
}

function resolveOrderTotalMinor(order: any): number | null {
  const candidates = [
    order?.metadata?.final_payable_total,
    order?.summary?.current_order_total,
    order?.total,
    order?.metadata?.negotiated_total,
  ]

  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value)) {
      return Math.round(value)
    }
  }

  return null
}

function getQuoteItems(quote: any) {
  return quote.negotiated_items || quote.requested_items || quote.items || []
}

function normalizeQuoteItemForOrder(item: any, quoteId: string) {
  const quantity = toNumber(item.quantity, 0)
  const rawUnitPrice =
    item.negotiated_unit_price ??
    item.unit_price ??
    item.requested_unit_price ??
    item.current_calculated_unit_price
  const rawLineTotal = item.line_total ?? item.total
  let unitPrice = normalizeQuoteUnitPriceToMinor(rawUnitPrice, "stored_quote")

  if (
    quantity > 1 &&
    Number.isFinite(Number(rawLineTotal)) &&
    Number.isFinite(Number(rawUnitPrice)) &&
    normalizeStoredMinor(rawLineTotal) === normalizeStoredMinor(rawUnitPrice)
  ) {
    const inferredUnitPrice = Math.round(normalizeStoredMinor(rawLineTotal) / quantity)
    if (inferredUnitPrice > 0 && inferredUnitPrice * quantity === normalizeStoredMinor(rawLineTotal)) {
      unitPrice = inferredUnitPrice
    }
  }

  const lineTotal = calculateLineTotalMinor(unitPrice, quantity)
  const manualQuoteItem = !item.variant_id
  const requiresShipping = item.requires_shipping === false
    ? false
    : item.metadata?.requires_shipping === false
      ? false
      : !manualQuoteItem
  const fallbackSku = manualQuoteItem
    ? "B2B-QUOTE-ITEM"
    : `B2B-QUOTE-${String(item.variant_id || quoteId).slice(-8)}`
  const sku = safeString(item.sku || item.variant_sku || item.metadata?.sku, fallbackSku)
  const title = safeString(
    item.title || item.product_title || item.name,
    manualQuoteItem ? "B2B Quote Item" : "B2B Quote Variant"
  )
  const variantTitle = safeString(item.variant_title || item.subtitle, manualQuoteItem ? "Custom" : "Default")
  const productTitle = safeString(item.product_title || item.title || item.name, title)

  return {
    title,
    subtitle: variantTitle,
    quantity,
    unit_price: unitPrice,
    product_id: item.product_id || undefined,
    variant_id: item.variant_id || undefined,
    product_title: productTitle,
    variant_title: variantTitle,
    variant_sku: sku,
    requires_shipping: requiresShipping,
    metadata: {
      ...(item.metadata || {}),
      source: "b2b_quote",
      quote_id: quoteId,
      quote_item_id: item.id || item.item_id || null,
      sku,
      variant_sku: sku,
      product_title: productTitle,
      variant_title: variantTitle,
      negotiated_unit_price: unitPrice,
      negotiated_line_total: lineTotal,
      manual_quote_item: manualQuoteItem,
      requires_shipping: requiresShipping,
      requires_allocation: !manualQuoteItem,
    },
  }
}

function buildB2BCommissionLineItem(quote: any, negotiatedSubtotal: number) {
  const snapshot = getQuoteCommissionSnapshot(quote)
  if (!snapshot || snapshot.policy !== B2B_CUSTOMER_COMMISSION_POLICY || snapshot.commission_amount <= 0) {
    return null
  }

  return {
    title: "B2B Customer Commission",
    subtitle: "Platform fee",
    quantity: 1,
    unit_price: snapshot.commission_amount,
    product_title: "B2B Customer Commission",
    variant_title: "Platform fee",
    variant_sku: "B2B-CUSTOMER-COMMISSION",
    requires_shipping: false,
    metadata: {
      source: "b2b_quote_commission",
      quote_id: quote.id,
      is_platform_fee: true,
      customer_type: B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE,
      account_type: B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE,
      policy: snapshot.policy,
      base_amount: snapshot.base_amount || negotiatedSubtotal,
      fee_type: snapshot.fee_type,
      fee_value: snapshot.fee_value,
      fee_amount: snapshot.commission_amount,
      final_payable_total: snapshot.final_payable_total,
      requires_allocation: false,
    },
  }
}

async function ensureB2BQuoteCommissionRecord(container: any, quote: any, order: any) {
  const snapshot = getQuoteCommissionSnapshot(quote)
  if (!snapshot || snapshot.policy !== B2B_CUSTOMER_COMMISSION_POLICY || snapshot.commission_amount <= 0) {
    return
  }

  const commissionService: any = container.resolve(COMMISSION_MODULE)
  const existing = await commissionService.listCommissionRecords(
    {
      order_id: order.id,
      account_type: B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE,
    },
    { take: 1 }
  )

  if (existing?.length) {
    return
  }

  await commissionService.createCommissionRecords({
    order_id: order.id,
    account_type: B2B_CUSTOMER_COMMISSION_ACCOUNT_TYPE,
    base_amount: snapshot.base_amount,
    fee_type: snapshot.fee_type,
    fee_value: snapshot.fee_value,
    commission_amount: snapshot.commission_amount,
    status: "collected",
    metadata: {
      source: "b2b_quote",
      quote_id: quote.id,
      customer_id: order.customer_id || quote.customer_id || null,
      currency_code: snapshot.currency_code || quote.currency_code || "cad",
      policy: snapshot.policy,
      final_payable_total: snapshot.final_payable_total,
    },
  })
}

async function listCustomerGroups(customerModule: any, filters: Record<string, any>, config: Record<string, any> = {}) {
  if (typeof customerModule.listCustomerGroups === "function") {
    return await customerModule.listCustomerGroups(filters, config)
  }

  if (typeof customerModule.listAndCountCustomerGroups === "function") {
    const [groups] = await customerModule.listAndCountCustomerGroups(filters, config)
    return groups || []
  }

  return []
}

async function getCustomerGroupById(customerModule: any, id?: string | null) {
  if (!id) return null

  try {
    if (typeof customerModule.retrieveCustomerGroup === "function") {
      return await customerModule.retrieveCustomerGroup(id)
    }
  } catch {
    // fall through to list lookup
  }

  try {
    const groups = await listCustomerGroups(customerModule, { id }, { take: 1 })
    return groups?.[0] || null
  } catch {
    return null
  }
}

async function getCustomerGroups(customerModule: any, customer: any, customerId: string) {
  const directGroups = customer?.groups || customer?.customer_groups
  if (Array.isArray(directGroups) && directGroups.length) {
    return directGroups
  }

  try {
    const groupCustomers = await customerModule.listCustomerGroupCustomers?.({ customer_id: customerId }, { take: 100 })
      ?? (await customerModule.listAndCountCustomerGroupCustomers?.({ customer_id: customerId }, { take: 100 }) || [[]])[0]
    const groupIds = Array.isArray(groupCustomers)
      ? groupCustomers.map((entry: any) => entry.customer_group_id).filter(Boolean)
      : []

    if (!groupIds.length) return []
    return await listCustomerGroups(customerModule, { id: groupIds }, { take: 100 })
  } catch {
    return []
  }
}

async function findB2BCustomerGroup(customerModule: any) {
  const names = ["B2B partners", "B2B Partners", "B2b parteners", "B2B Customers", "Wholesale Customers"]

  for (const name of names) {
    try {
      const groups = await listCustomerGroups(customerModule, { name }, { take: 1 })
      if (groups?.[0]) return groups[0]
    } catch {
      // continue
    }
  }

  try {
    const groups = await listCustomerGroups(customerModule, {}, { take: 100 })
    return groups.find((group: any) => /b2b|wholesale|partner/i.test(group.name || "")) || null
  } catch {
    return null
  }
}

async function resolveB2BContext({ container, customerId, companyId, quote }: any) {
  const b2bService: any = container.resolve(B2B_MODULE)
  const customerModule: any = container.resolve(Modules.CUSTOMER)

  let company: any = null
  let customer: any = null
  let customerGroup: any = null

  if (companyId) {
    try {
      company = await b2bService.retrieveCompany(companyId)
    } catch {
      company = null
    }
  }

  if (customerId) {
    try {
      customer = await customerModule.retrieveCustomer(customerId, { relations: ["groups"] })
    } catch {
      try {
        customer = await customerModule.retrieveCustomer(customerId)
      } catch {
        customer = null
      }
    }
  }

  const companyGroupId =
    company?.customer_group_id ||
    company?.metadata?.customer_group_id ||
    quote?.metadata?.customer_group_id ||
    customer?.metadata?.customer_group_id ||
    null

  customerGroup = await getCustomerGroupById(customerModule, companyGroupId)

  if (!customerGroup && customerId) {
    const groups = await getCustomerGroups(customerModule, customer, customerId)
    customerGroup = groups?.[0] || null
  }

  if (!customerGroup) {
    customerGroup = await findB2BCustomerGroup(customerModule)
  }

  return {
    company,
    customer,
    customerGroup,
    companyName:
      company?.company_name ||
      quote?.company_name ||
      quote?.metadata?.company_name ||
      null,
    customerGroupName: customerGroup?.name || "B2B partners",
  }
}

function compactAddress(address: any, customer: any = null, company: any = null) {
  if (!address || typeof address !== "object") {
    return null
  }

  const customerName = [
    customer?.first_name,
    customer?.last_name,
  ].filter(Boolean)
  const companyContact = String(company?.contact_name || "").trim().split(/\s+/).filter(Boolean)
  const firstName = safeString(address.first_name, customerName[0] || companyContact[0] || "B2B")
  const lastName = safeString(
    address.last_name,
    customerName.slice(1).join(" ") || companyContact.slice(1).join(" ") || "Customer"
  )
  const normalized = {
    first_name: firstName,
    last_name: lastName,
    company: address.company || company?.company_name || undefined,
    address_1: safeString(address.address_1 || address.address1, ""),
    address_2: address.address_2 || address.address2 || undefined,
    city: safeString(address.city, ""),
    country_code: String(address.country_code || address.country || "").toLowerCase(),
    province: address.province || address.state || undefined,
    postal_code: safeString(address.postal_code || address.postalCode || address.zip, ""),
    phone: address.phone || customer?.phone || company?.phone || undefined,
    metadata: {
      ...(address.metadata || {}),
      source: address.metadata?.source || "b2b_quote_accept",
    },
  }

  return normalized.address_1 && normalized.city && normalized.country_code && normalized.postal_code
    ? normalized
    : null
}

async function resolveCustomerAddress(customerModule: any, customerId: string, addressId?: string | null) {
  if (addressId) {
    const matches = await customerModule.listCustomerAddresses?.({ id: addressId, customer_id: customerId }, { take: 1 })
    if (matches?.[0]) return matches[0]
  }

  const defaults = await customerModule.listCustomerAddresses?.(
    { customer_id: customerId, is_default_shipping: true },
    { take: 1 }
  )
  if (defaults?.[0]) return defaults[0]

  const addresses = await customerModule.listCustomerAddresses?.({ customer_id: customerId }, { take: 1 })
  return addresses?.[0] || null
}

async function resolveQuoteShippingAddress({
  container,
  input,
  quote,
  b2bContext,
  requiresShipping,
}: {
  container: any
  input: CustomerAcceptQuoteInput
  quote: any
  b2bContext: any
  requiresShipping: boolean
}) {
  const customerModule: any = container.resolve(Modules.CUSTOMER)
  const candidates: any[] = []

  candidates.push(input.shipping_address)

  try {
    candidates.push(await resolveCustomerAddress(customerModule, input.customer_id, input.shipping_address_id))
  } catch {
    // address lookup is best-effort; validation below decides whether it is required
  }

  candidates.push(b2bContext.company?.address)
  candidates.push(b2bContext.company?.metadata?.shipping_address)
  candidates.push(quote.metadata?.shipping_address)

  for (const candidate of candidates) {
    const normalized = compactAddress(candidate, b2bContext.customer, b2bContext.company)
    if (normalized) {
      return normalized
    }
  }

  if (requiresShipping) {
    const error: any = new Error("A valid shipping address is required before accepting this quote.")
    error.status = 400
    throw error
  }

  const countryCode = String(quote.metadata?.country_code || "ca").toLowerCase()
  const customerName = [
    b2bContext.customer?.first_name,
    b2bContext.customer?.last_name,
  ].filter(Boolean).join(" ") || quote.customer_name || ""

  return {
    first_name: customerName.split(" ")?.[0] || "B2B",
    last_name: customerName.split(" ")?.slice(1).join(" ") || "Customer",
    address_1: "B2B quote order",
    city: "B2B",
    country_code: countryCode,
    postal_code: "A1A 1A1",
    metadata: {
      source: "b2b_quote_non_shipping_fallback",
      placeholder: true,
    },
  }
}

async function getCustomerCompanyId(query: any, customerId: string) {
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "company.id"],
    filters: { id: customerId },
  })

  return customers?.[0]?.company?.id || null
}

async function assertQuoteAccess(quote: any, customerId: string, query: any) {
  if (quote.customer_id === customerId) {
    return
  }

  const customerCompanyId = await getCustomerCompanyId(query, customerId)
  if (customerCompanyId && quote.company_id === customerCompanyId) {
    return
  }

  const error: any = new Error("Quote not found")
  error.status = 404
  throw error
}

async function retrieveOrderIfPresent(orderService: any, orderId?: string | null) {
  if (!orderId) {
    return null
  }

  try {
    return await orderService.retrieveOrder(orderId)
  } catch {
    return null
  }
}

async function retrieveB2BQuoteOrder(orderService: any, orderId: string) {
  return await orderService.retrieveOrder(orderId, {
    relations: ["summary", "items", "items.adjustments"],
  })
}

async function applyB2BQuoteNegotiationAdjustments(
  orderService: any,
  order: any,
  originalTotal: number,
  negotiatedSubtotal: number
) {
  const discountTotal = originalTotal - negotiatedSubtotal
  if (discountTotal <= 0) {
    return order
  }

  const merchandiseItems = (order.items || []).filter((item: any) => !item.metadata?.is_platform_fee)
  let remainingDiscount = discountTotal
  const adjustments: any[] = []

  for (const item of merchandiseItems) {
    if (!item?.id || remainingDiscount <= 0) {
      continue
    }

    const itemSubtotal = toNumber(item.unit_price) * toNumber(item.quantity)
    const amount = Math.min(itemSubtotal, remainingDiscount)
    if (amount <= 0) {
      continue
    }

    adjustments.push({
      item_id: item.id,
      code: "B2B_QUOTE_NEGOTIATION",
      amount,
      description: "B2B quote negotiated merchandise adjustment",
    })
    remainingDiscount -= amount
  }

  if (!adjustments.length || remainingDiscount > 0) {
    return order
  }

  await orderService.createOrderLineItemAdjustments(order.id, adjustments)

  return await retrieveB2BQuoteOrder(orderService, order.id)
}

async function resolveOrderContext(query: any, quote: any) {
  const currencyCode = String(quote.currency_code || quote.metadata?.currency_code || "cad").toLowerCase()
  let regionId = quote.region_id || quote.metadata?.region_id || null
  let salesChannelId = quote.sales_channel_id || quote.metadata?.sales_channel_id || null

  if (!regionId) {
    const { data: matchingRegions } = await query.graph({
      entity: "region",
      fields: ["id", "currency_code", "countries.iso_2"],
      filters: { currency_code: currencyCode },
      pagination: { take: 1 },
    })
    regionId = matchingRegions?.[0]?.id || null
  }

  if (!regionId) {
    const { data: regions } = await query.graph({
      entity: "region",
      fields: ["id", "currency_code", "countries.iso_2"],
      pagination: { take: 1 },
    })
    regionId = regions?.[0]?.id || null
  }

  if (!salesChannelId) {
    const { data: salesChannels } = await query.graph({
      entity: "sales_channel",
      fields: ["id"],
      pagination: { take: 1 },
    })
    salesChannelId = salesChannels?.[0]?.id || null
  }

  return { currencyCode, regionId, salesChannelId }
}

function acceptancePaymentContext(input: CustomerAcceptQuoteInput) {
  const offline = input.settlement_mode === "offline" || input.settlement_mode === "invoice"

  return {
    settlementMode: offline ? "offline" : "online",
    paymentState: offline ? "awaiting_remittance" : "payment_required",
    selectedPaymentProviderId: offline
      ? input.selected_payment_provider_id || "invoice"
      : input.selected_payment_provider_id || null,
  }
}

async function createOrderFromQuote(
  container: any,
  quote: any,
  paymentContext: ReturnType<typeof acceptancePaymentContext>,
  input: CustomerAcceptQuoteInput
) {
  const orderService: any = container.resolve(Modules.ORDER)
  const query: any = container.resolve("query")
  const { currencyCode, regionId, salesChannelId } = await resolveOrderContext(query, quote)
  const b2bContext = await resolveB2BContext({
    container,
    customerId: quote.customer_id,
    companyId: quote.company_id,
    quote,
  })
  const sourceItems = getQuoteItems(quote)

  console.log("[B2B_ORDER_MONEY_TRACE]", {
    quote_id: quote.id,
    negotiated_total: quote.negotiated_total,
    original_total: quote.original_total,
    items: sourceItems.map((item: any) => ({
      title: item.title,
      sku: item.sku || item.variant_sku || item.metadata?.sku || null,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      negotiated_unit_price: item.negotiated_unit_price,
      requested_unit_price: item.requested_unit_price,
      total: item.total ?? item.line_total ?? null,
      metadata: item.metadata,
    })),
  })

  const items = sourceItems
    .map((item: any) => normalizeQuoteItemForOrder(item, quote.id))
    .filter((item: any) => item.quantity > 0 && item.unit_price >= 0)

  if (!items.length) {
    const error: any = new Error("Quote has no items to convert to an order")
    error.status = 400
    throw error
  }

  const requiresShipping = items.some((item: any) => item.requires_shipping !== false && item.metadata?.requires_shipping !== false)
  const itemsSubtotal = items.reduce(
    (sum: number, item: any) => sum + toNumber(item.unit_price) * toNumber(item.quantity),
    0
  )
  const originalTotal = getQuoteOriginalTotalMinor(quote)
  const negotiatedSubtotal = getQuoteNegotiatedSubtotalMinor(quote)
  const finalPayableTotal = getQuoteFinalPayableTotalMinor(quote)
  const commissionSnapshot = getQuoteCommissionSnapshot(quote)
  const commissionLineItem = buildB2BCommissionLineItem(quote, negotiatedSubtotal)
  const orderItems = commissionLineItem ? [...items, commissionLineItem] : items
  const subtotal = itemsSubtotal + (commissionLineItem?.unit_price || 0)
  const quoteTotal = toNumber(quote.metadata?.final_payable_total ?? quote.total ?? quote.negotiated_total ?? quote.requested_total ?? quote.subtotal, finalPayableTotal)
  const total = finalPayableTotal
  const orderDiscountTotal = Math.abs(Math.min(0, negotiatedSubtotal - originalTotal))
  const now = new Date().toISOString()
  const address = await resolveQuoteShippingAddress({
    container,
    input,
    quote,
    b2bContext,
    requiresShipping,
  })

  console.log("[B2B_QUOTE_ACCEPT_TOTAL_CHECK]", {
    quote_id: quote.id,
    expectedSubtotal: subtotal,
    quoteSubtotal: quote.subtotal,
    quoteTotal,
    orderTotal: total,
    orderDiscountTotal,
    requiresShipping,
  })

  const orderInput = {
    email: quote.customer_email || b2bContext.customer?.email,
    customer_id: quote.customer_id,
    currency_code: currencyCode,
    region_id: regionId || undefined,
    sales_channel_id: salesChannelId || undefined,
    subtotal,
    total,
    tax_total: 0,
    discount_total: orderDiscountTotal,
    shipping_total: 0,
    payment_status: "awaiting",
    status: "pending",
    shipping_address: address,
    billing_address: address,
    items: orderItems,
    metadata: {
      ...(quote.metadata?.order_metadata || {}),
      source: "b2b_quote",
      quote_id: quote.id,
      company_id: quote.company_id,
      company_name: b2bContext.companyName,
      customer_group_id: b2bContext.customerGroup?.id || quote.metadata?.customer_group_id || null,
      customer_group_name: b2bContext.customerGroupName,
      b2b_customer: true,
      payment_terms: quote.payment_terms || quote.metadata?.payment_terms || "net_30",
      payment_state: paymentContext.paymentState,
      settlement_mode: paymentContext.settlementMode,
      selected_payment_provider_id: paymentContext.selectedPaymentProviderId,
      customer_id: quote.customer_id,
      offer_version: Math.max(1, storedMinor(quote.offer_version, 1)),
      original_total: originalTotal,
      negotiated_total: negotiatedSubtotal,
      negotiated_subtotal: negotiatedSubtotal,
      commission_amount: commissionSnapshot?.commission_amount || 0,
      commission_type: commissionSnapshot?.fee_type || "none",
      commission_value: commissionSnapshot?.fee_value || 0,
      commission_policy: commissionSnapshot?.policy || B2B_CUSTOMER_COMMISSION_POLICY,
      final_payable_total: finalPayableTotal,
      quote_adjustment_total: negotiatedSubtotal - originalTotal,
      payment_collection_id: quote.payment_collection_id || quote.metadata?.payment_collection_id || null,
      quote_total_snapshot: quoteTotal,
      requested_total: quote.requested_total ?? quote.subtotal ?? subtotal,
      accepted_at: now,
      b2b_payment_required: true,
      can_fulfill_before_payment: false,
      fulfillment_gate_reason: "b2b_quote_payment_required",
      shipping_address_source: address?.metadata?.source || null,
    },
  }

  console.log("[B2B_ORDER_CREATE_INPUT_TRACE]", {
      order_total_expected: total,
    currency_code: orderInput.currency_code,
    customer_id: orderInput.customer_id,
    email: orderInput.email,
    item_count: orderInput.items?.length,
    items: orderInput.items?.map((item: any) => ({
      title: item.title,
      sku: item.variant_sku || item.metadata?.sku,
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.unit_price * item.quantity,
      metadata: item.metadata,
    })),
    shipping_address: orderInput.shipping_address,
    metadata: orderInput.metadata,
  })

  const order = await orderService.createOrders(orderInput)

  return await applyB2BQuoteNegotiationAdjustments(orderService, order, originalTotal, negotiatedSubtotal)
}

const customerAcceptQuoteStep = createStep(
  "customer-accept-quote-step",
  async (input: CustomerAcceptQuoteInput, { container }) => {
    const b2bService: any = container.resolve(B2B_MODULE)
    const orderService: any = container.resolve(Modules.ORDER)
    const query: any = container.resolve("query")
    const quote = await b2bService.retrieveQuote(input.quote_id)

    if (!quote) {
      const error: any = new Error("Quote not found")
      error.status = 404
      throw error
    }

    await assertQuoteAccess(quote, input.customer_id, query)
    const b2bContext = await resolveB2BContext({
      container,
      customerId: input.customer_id,
      companyId: quote.company_id,
      quote,
    })

    console.log("[B2B_QUOTE_ACCEPT_REACHED]", {
      quote_id: quote.id,
      customer_id: input.customer_id,
      company_id: quote.company_id,
      status: quote.status,
      currency_code: quote.currency_code,
    })

    if (quote.status === QuoteStatus.ACCEPTED) {
      const order = await retrieveOrderIfPresent(orderService, quoteOrderId(quote))
      return new StepResponse({ quote, order })
    }

    if (quote.status !== QuoteStatus.PENDING_CUSTOMER) {
      const error: any = new Error(`Quote status is "${quote.status}". Only pending_customer quotes can be accepted.`)
      error.status = 400
      throw error
    }

    if (quoteIsExpired(quote)) {
      const error: any = new Error("Quote offer has expired.")
      error.status = 400
      throw error
    }

    if (input.offer_version != null && Number(input.offer_version) !== Number(quote.offer_version || 1)) {
      const error: any = new Error("Quote offer has changed. Refresh the quote before accepting.")
      error.status = 409
      throw error
    }

    await validateQuoteInventoryAvailability({ quote, container })

    const paymentContext = acceptancePaymentContext(input)
    const paymentCollection = await createOrReuseB2BQuotePaymentCollection(b2bService, quote)

    let order: any

    if (quote.draft_order_id) {
      const negotiatedItems = quote.negotiated_items || []
      for (const item of negotiatedItems) {
        const lineItemId = item.item_id
        if (!lineItemId) continue
        const unitPrice = normalizeQuoteUnitPriceToMinor(
          item.negotiated_unit_price ?? item.unit_price ?? item.requested_unit_price,
          "stored_quote"
        )

        await orderService.updateOrderLineItems(lineItemId, {
          id: lineItemId,
          quantity: item.quantity,
          unit_price: unitPrice,
          metadata: {
            ...(item.metadata || {}),
            b2b_quote_id: quote.id,
            source: "b2b_quote",
            sku: item.sku || item.variant_sku || item.metadata?.sku || "B2B-QUOTE-ITEM",
            negotiated_unit_price: unitPrice,
            manual_quote_item: !item.variant_id,
            requires_allocation: Boolean(item.variant_id),
          },
        })
      }

      const { result: convertedOrder } = await convertDraftOrderWorkflow(container).run({
        input: { id: quote.draft_order_id },
      })

      const [updatedOrder] = await orderService.updateOrders([
        {
          id: convertedOrder.id,
          metadata: {
            ...(convertedOrder.metadata || {}),
            source: "b2b_quote",
            quote_id: quote.id,
            company_id: quote.company_id,
            company_name: b2bContext.companyName,
            customer_group_id: b2bContext.customerGroup?.id || quote.metadata?.customer_group_id || null,
            customer_group_name: b2bContext.customerGroupName,
            b2b_customer: true,
            payment_terms: quote.payment_terms || quote.metadata?.payment_terms || "net_30",
            payment_state: paymentContext.paymentState,
            settlement_mode: paymentContext.settlementMode,
            selected_payment_provider_id: paymentContext.selectedPaymentProviderId,
            customer_id: quote.customer_id,
            offer_version: Math.max(1, storedMinor(quote.offer_version, 1)),
            original_total: getQuoteOriginalTotalMinor(quote),
            negotiated_total: getQuoteNegotiatedTotalMinor(quote),
            quote_adjustment_total: quoteAdjustmentTotalMinor(quote),
            payment_collection_id: paymentCollection.id,
            b2b_payment_required: true,
            can_fulfill_before_payment: false,
            fulfillment_gate_reason: "b2b_quote_payment_required",
          },
        },
      ])
      order = updatedOrder || convertedOrder
    } else {
      order = await createOrderFromQuote(container, {
        ...quote,
        payment_collection_id: paymentCollection.id,
        metadata: {
          ...(quote.metadata || {}),
          payment_collection_id: paymentCollection.id,
        },
      }, paymentContext, input)
    }

    const finalPayableTotal = getQuoteFinalPayableTotalMinor(quote)
    const negotiatedSubtotal = getQuoteNegotiatedSubtotalMinor(quote)

    await ensureB2BQuoteCommissionRecord(container, quote, order)

    const orderPaymentCollection = await ensureOrderPaymentCollection(
      container,
      quote,
      order.id,
      finalPayableTotal
    )
    const realPaymentCollectionId = orderPaymentCollection?.id || paymentCollection.id
    const expectedNegotiatedTotal = finalPayableTotal
    const actualOrderTotal = resolveOrderTotalMinor(order)

    if (actualOrderTotal !== null && actualOrderTotal !== expectedNegotiatedTotal) {
      const error: any = new Error(
        `B2B quote payable total mismatch: expected ${expectedNegotiatedTotal}, got ${actualOrderTotal}`
      )
      error.status = 409
      throw error
    }

    try {
      const [metadataOrder] = await orderService.updateOrders([
        {
          id: order.id,
          metadata: {
            ...(order.metadata || {}),
            payment_collection_id: realPaymentCollectionId,
            b2b_payment_required: true,
            can_fulfill_before_payment: false,
            fulfillment_gate_reason: "b2b_quote_payment_required",
          },
        },
      ])
      order = metadataOrder || order
    } catch {
      // Non-fatal: the payment collection was still linked by Medusa's workflow.
    }

    const acceptedTotal = Number.isFinite(Number(order?.metadata?.final_payable_total))
      ? Number(order.metadata.final_payable_total)
      : Number.isFinite(Number(quote.negotiated_total ?? quote.total))
        ? Number(quote.metadata?.final_payable_total ?? quote.total ?? quote.negotiated_total)
        : null

    const updatedQuote = await b2bService.updateQuotes({
      id: quote.id,
      status: QuoteStatus.ACCEPTED,
      payment_state: paymentContext.paymentState,
      accepted_at: new Date(),
      order_id: order.id,
      created_order_id: order.id,
      payment_collection_id: realPaymentCollectionId,
      selected_payment_provider_id: paymentContext.selectedPaymentProviderId,
      ...(acceptedTotal !== null
        ? {
            negotiated_total: negotiatedSubtotal,
            quote_adjustment_total: negotiatedSubtotal - getQuoteOriginalTotalMinor(quote),
            subtotal: negotiatedSubtotal,
            total: acceptedTotal,
          }
        : {}),
      metadata: {
        ...(quote.metadata || {}),
        accepted_at: new Date().toISOString(),
        order_id: order.id,
        converted_order_id: order.id,
        payment_state: paymentContext.paymentState,
        settlement_mode: paymentContext.settlementMode,
        selected_payment_provider_id: paymentContext.selectedPaymentProviderId,
        payment_collection_id: realPaymentCollectionId,
        acceptance_lock: {
          locked_at: new Date().toISOString(),
          customer_id: input.customer_id,
        },
        company_name: b2bContext.companyName,
        customer_group_id: b2bContext.customerGroup?.id || quote.metadata?.customer_group_id || null,
        customer_group_name: b2bContext.customerGroupName,
        b2b_customer: true,
        offer_version: Math.max(1, storedMinor(quote.offer_version, 1)),
        original_total: getQuoteOriginalTotalMinor(quote),
        negotiated_total: negotiatedSubtotal,
        negotiated_subtotal: negotiatedSubtotal,
        final_payable_total: acceptedTotal,
      },
    })

    return new StepResponse(
      { quote: updatedQuote, order },
      {
        quote_id: quote.id,
        order_id: order.id,
        previous_status: quote.status,
        previous_order_id: quote.order_id,
        previous_created_order_id: quote.created_order_id,
        previous_accepted_at: quote.accepted_at,
        previous_metadata: quote.metadata,
      }
    )
  },
  async (data: any, { container }) => {
    if (!data?.quote_id) return
    const b2bService: any = container.resolve(B2B_MODULE)
    await b2bService.updateQuotes({
      id: data.quote_id,
      status: data.previous_status,
      order_id: data.previous_order_id || null,
      created_order_id: data.previous_created_order_id || null,
      accepted_at: data.previous_accepted_at || null,
      metadata: data.previous_metadata || null,
    })
  }
)

export const customerAcceptQuoteWorkflow = createWorkflow(
  "customer-accept-quote",
  (input: CustomerAcceptQuoteInput) => {
    return new WorkflowResponse(customerAcceptQuoteStep(input))
  }
)
