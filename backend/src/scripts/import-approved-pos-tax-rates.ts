import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createTaxRatesWorkflow, createTaxRegionsWorkflow, updateTaxRatesWorkflow } from "@medusajs/core-flows"
import * as path from "path"
import { parseBoolean, readApprovedCsv, resolveProjectReportsDir, splitIds } from "./lib/approved-pos-csv"

const HEADERS = [
  "country_code", "state_or_province", "postal_scope", "rate_percent", "tax_code", "tax_name",
  "priority", "compound", "applies_to_shipping", "applies_to_products", "effective_from",
  "effective_to", "approved_by", "approval_reference", "product_ids", "product_type_ids",
  "shipping_option_ids", "notes",
] as const

type Rule = { reference: "product" | "product_type" | "shipping_option"; reference_id: string }
type TaxRegion = { id: string; country_code: string; province_code: string | null; parent_id: string | null; provider_id: string | null }
type ExistingRate = {
  id: string
  tax_region_id: string
  name: string
  code: string | null
  rate: number | null
  is_default: boolean
  is_combinable: boolean
  metadata?: Record<string, unknown> | null
  rules?: Rule[]
}
type TaxPlan = {
  rowNumber: number
  countryCode: "ca" | "us"
  provinceCode: string
  taxRegionId?: string
  taxRegionAction: "EXISTING" | "CREATE"
  name: string
  code: string
  rate: number
  priority: number
  compound: boolean
  effectiveFrom: string
  effectiveTo: string | null
  rules: Rule[]
  affectedTaxCategories: string[]
  approval: { approvedBy: string; approvalReference: string; notes: string }
  action: "CREATE" | "UPDATE" | "NO_CHANGE"
  existingRateId?: string
}

const allArgs = (args?: string[]) => [...(args || []), ...process.argv.slice(2)]
const isApply = (args?: string[]) => allArgs(args).includes("apply") && !allArgs(args).includes("dry-run")
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const sameRules = (left: Rule[] = [], right: Rule[] = []) => {
  const normalized = (rules: Rule[]) => rules.map((rule) => `${rule.reference}:${rule.reference_id}`).sort().join("|")
  return normalized(left) === normalized(right)
}

export default async function importApprovedPosTaxRates({ container, args }: ExecArgs) {
  const apply = isApply(args)
  const csvPath = path.join(resolveProjectReportsDir(), "approved-pos-tax-rates.csv")
  const rows = readApprovedCsv(csvPath, HEADERS)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const tax = container.resolve(Modules.TAX)

  const [taxRegionsRaw, existingRatesRaw, productResult, productTypeResult, shippingResult] = await Promise.all([
    tax.listTaxRegions({}, { take: 1000 }),
    tax.listTaxRates({}, { take: 1000, relations: ["rules"] }),
    query.graph({ entity: "product", fields: ["id", "title", "type_id"], pagination: { take: 10000 } }),
    query.graph({ entity: "product_type", fields: ["id", "value"], pagination: { take: 10000 } }),
    query.graph({
      entity: "shipping_option",
      fields: ["id", "name", "service_zone.geo_zones.country_code", "service_zone.fulfillment_set.location.address.country_code"],
      pagination: { take: 1000 },
    }),
  ])
  const taxRegions = taxRegionsRaw as TaxRegion[]
  const existingRates = existingRatesRaw as ExistingRate[]
  const products = new Map((productResult.data as Array<{ id: string; title: string; type_id?: string | null }>).map((product) => [product.id, product]))
  const productTypes = new Map((productTypeResult.data as Array<{ id: string; value: string }>).map((type) => [type.id, type]))
  const shippingOptions = shippingResult.data as Array<{ id: string; name: string; service_zone?: { geo_zones?: Array<{ country_code?: string }>; fulfillment_set?: { location?: { address?: { country_code?: string } } } } }>
  const invalidRows: Array<{ rowNumber: number; reasons: string[] }> = []
  const conflictingRates: Array<{ rowNumber: number; reason: string; taxRateIds?: string[] }> = []
  const plans: TaxPlan[] = []
  const duplicateKeys = new Set<string>()
  const today = new Date().toISOString().slice(0, 10)

  for (const row of rows) {
    const values = row.values
    const reasons: string[] = []
    const countryCode = values.country_code.toLowerCase()
    const provinceCode = values.state_or_province.toLowerCase()
    const rate = Number(values.rate_percent)
    const priority = Number(values.priority)
    const compound = parseBoolean(values.compound)
    const appliesToShipping = parseBoolean(values.applies_to_shipping)
    const appliesToProducts = parseBoolean(values.applies_to_products)
    const productIds = splitIds(values.product_ids)
    const productTypeIds = splitIds(values.product_type_ids)
    let shippingOptionIds = splitIds(values.shipping_option_ids)

    if (!(["ca", "us"] as string[]).includes(countryCode)) reasons.push("country_code must be ca or us")
    if (!/^[a-z]{2}$/.test(provinceCode)) reasons.push("state_or_province must be a two-letter subdivision code")
    if (values.postal_scope) reasons.push("postal_scope is not supported by Medusa tp_system; refusing to apply a broader rate")
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) reasons.push("rate_percent must be > 0 and <= 100")
    if (!values.tax_code) reasons.push("tax_code is required")
    if (!values.tax_name) reasons.push("tax_name is required")
    if (!Number.isSafeInteger(priority) || priority < 0) reasons.push("priority must be an integer >= 0")
    if (compound === null) reasons.push("compound must be true or false")
    if (appliesToShipping === null) reasons.push("applies_to_shipping must be true or false")
    if (appliesToProducts === null) reasons.push("applies_to_products must be true or false")
    if (appliesToShipping === false && appliesToProducts === false) reasons.push("rate must apply to products, shipping, or both")
    if (!isoDate.test(values.effective_from) || Number.isNaN(Date.parse(`${values.effective_from}T00:00:00Z`))) reasons.push("effective_from must be a valid YYYY-MM-DD date")
    if (values.effective_to && (!isoDate.test(values.effective_to) || Number.isNaN(Date.parse(`${values.effective_to}T00:00:00Z`)))) reasons.push("effective_to must be blank or a valid YYYY-MM-DD date")
    if (values.effective_to && values.effective_to < values.effective_from) reasons.push("effective_to cannot precede effective_from")
    if (values.effective_from > today) reasons.push("rate is not yet effective; scheduled activation is not supported by this importer")
    if (values.effective_to && values.effective_to < today) reasons.push("rate is expired")
    if (!values.approved_by) reasons.push("approved_by is required")
    if (!values.approval_reference) reasons.push("approval_reference is required")
    if (appliesToProducts && !productIds.length && !productTypeIds.length) reasons.push("applies_to_products requires product_ids or product_type_ids; no default product rate is created")
    for (const productId of productIds) if (!products.has(productId)) reasons.push(`unknown product_id ${productId}`)
    for (const typeId of productTypeIds) if (!productTypes.has(typeId)) reasons.push(`unknown product_type_id ${typeId}`)

    if (appliesToShipping && !shippingOptionIds.length && (["ca", "us"] as string[]).includes(countryCode)) {
      shippingOptionIds = shippingOptions.filter((option) =>
        option.service_zone?.geo_zones?.some((zone) => zone.country_code?.toLowerCase() === countryCode) &&
        option.service_zone?.fulfillment_set?.location?.address?.country_code?.toLowerCase() === countryCode
      ).map((option) => option.id)
      if (!shippingOptionIds.length) reasons.push("no same-country shipping options were found for applies_to_shipping")
    }
    for (const optionId of shippingOptionIds) {
      const option = shippingOptions.find((candidate) => candidate.id === optionId)
      if (!option) reasons.push(`unknown shipping_option_id ${optionId}`)
      else if (!option.service_zone?.geo_zones?.some((zone) => zone.country_code?.toLowerCase() === countryCode)) reasons.push(`shipping option ${optionId} is outside ${countryCode}`)
    }

    const duplicateKey = `${countryCode}:${provinceCode}:${values.tax_code}`
    if (duplicateKeys.has(duplicateKey)) reasons.push("duplicate country/subdivision/tax_code row")
    duplicateKeys.add(duplicateKey)
    const parent = taxRegions.find((region) => region.country_code === countryCode && !region.parent_id && !region.province_code)
    if (!parent) reasons.push(`parent tax region for ${countryCode} does not exist`)
    const region = taxRegions.find((candidate) => candidate.country_code === countryCode && candidate.province_code === provinceCode)
    const rules: Rule[] = [
      ...productIds.map((reference_id) => ({ reference: "product" as const, reference_id })),
      ...productTypeIds.map((reference_id) => ({ reference: "product_type" as const, reference_id })),
      ...shippingOptionIds.map((reference_id) => ({ reference: "shipping_option" as const, reference_id })),
    ]
    const matching = region ? existingRates.filter((candidate) => candidate.tax_region_id === region.id && candidate.code === values.tax_code) : []
    if (matching.length > 1) conflictingRates.push({ rowNumber: row.rowNumber, reason: "multiple existing rates share this jurisdiction and code", taxRateIds: matching.map((item) => item.id) })
    const selectorConflicts = region ? existingRates.filter((candidate) => candidate.tax_region_id === region.id && candidate.code !== values.tax_code && candidate.rules?.some((existingRule) => rules.some((rule) => rule.reference === existingRule.reference && rule.reference_id === existingRule.reference_id))) : []
    if (selectorConflicts.length) conflictingRates.push({ rowNumber: row.rowNumber, reason: "another rate in this jurisdiction targets the same product/type/shipping selector", taxRateIds: selectorConflicts.map((item) => item.id) })

    if (reasons.length) {
      invalidRows.push({ rowNumber: row.rowNumber, reasons })
      continue
    }
    const existing = matching[0]
    const unchanged = existing && existing.name === values.tax_name && Number(existing.rate) === rate && existing.is_default === false && Boolean(existing.is_combinable) === compound && sameRules(existing.rules, rules)
    plans.push({
      rowNumber: row.rowNumber,
      countryCode: countryCode as "ca" | "us",
      provinceCode,
      taxRegionId: region?.id,
      taxRegionAction: region ? "EXISTING" : "CREATE",
      name: values.tax_name,
      code: values.tax_code,
      rate,
      priority,
      compound: compound!,
      effectiveFrom: values.effective_from,
      effectiveTo: values.effective_to || null,
      rules,
      affectedTaxCategories: [...productIds, ...productTypeIds],
      approval: { approvedBy: values.approved_by, approvalReference: values.approval_reference, notes: values.notes },
      action: !existing ? "CREATE" : unchanged ? "NO_CHANGE" : "UPDATE",
      existingRateId: existing?.id,
    })
  }

  let writes = 0
  const report = () => {
    console.log("[APPROVED_POS_TAX_RATES]")
    console.log(JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      csvPath,
      rows: rows.length,
      ratesToCreate: plans.filter((plan) => plan.action === "CREATE"),
      ratesToUpdate: plans.filter((plan) => plan.action === "UPDATE"),
      unchangedRates: plans.filter((plan) => plan.action === "NO_CHANGE"),
      conflictingRates,
      invalidRows,
      affectedRegions: [...new Set(plans.map((plan) => `${plan.countryCode}-${plan.provinceCode}`))],
      affectedTaxCategories: [...new Set(plans.flatMap((plan) => plan.affectedTaxCategories))],
      writes,
    }, null, 2))
  }

  if (!apply) {
    report()
    return
  }
  if (!rows.length) {
    report()
    throw new Error("Apply blocked: approved tax CSV has no rows")
  }
  if (invalidRows.length || conflictingRates.length) {
    report()
    throw new Error("Apply blocked: approved tax CSV has invalid or conflicting rows; no writes performed")
  }

  const regionCache = new Map<string, TaxRegion>()
  for (const plan of plans) {
    const regionKey = `${plan.countryCode}:${plan.provinceCode}`
    let region = regionCache.get(regionKey) || taxRegions.find((candidate) => candidate.country_code === plan.countryCode && candidate.province_code === plan.provinceCode)
    if (!region) {
      const parent = taxRegions.find((candidate) => candidate.country_code === plan.countryCode && !candidate.parent_id && !candidate.province_code)!
      const created = await createTaxRegionsWorkflow(container).run({ input: [{ country_code: plan.countryCode, province_code: plan.provinceCode, parent_id: parent.id, provider_id: parent.provider_id || "tp_system", metadata: { configured_by: "import-approved-pos-tax-rates" } }] })
      region = created.result[0] as TaxRegion
      writes++
    }
    regionCache.set(regionKey, region)
    const metadata = {
      priority: plan.priority,
      effective_from: plan.effectiveFrom,
      effective_to: plan.effectiveTo,
      approved_by: plan.approval.approvedBy,
      approval_reference: plan.approval.approvalReference,
      notes: plan.approval.notes,
      configured_by: "import-approved-pos-tax-rates",
    }
    if (plan.action === "CREATE") {
      const created = await createTaxRatesWorkflow(container).run({ input: [{ tax_region_id: region.id, name: plan.name, code: plan.code, rate: plan.rate, is_default: false, rules: plan.rules, created_by: plan.approval.approvedBy, metadata }] })
      writes++
      if (plan.compound) {
        await updateTaxRatesWorkflow(container).run({ input: { selector: { id: created.result[0].id }, update: { is_combinable: true, updated_by: plan.approval.approvedBy } } })
        writes++
      }
    } else if (plan.action === "UPDATE") {
      await updateTaxRatesWorkflow(container).run({ input: { selector: { id: plan.existingRateId! }, update: { name: plan.name, code: plan.code, rate: plan.rate, is_default: false, is_combinable: plan.compound, rules: plan.rules, metadata, updated_by: plan.approval.approvedBy } } })
      writes++
    }
  }
  report()
}
