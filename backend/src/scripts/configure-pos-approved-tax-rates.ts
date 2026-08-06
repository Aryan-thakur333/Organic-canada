import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createTaxRatesWorkflow, createTaxRegionsWorkflow } from "@medusajs/core-flows"

type ApprovedTaxRate = {
  country_code: "ca" | "us"
  province_code?: string
  name: string
  code: string
  rate: number
  is_default?: boolean
  product_ids?: string[]
  product_type_ids?: string[]
  shipping_option_ids?: string[]
  fixture?: boolean
  approved_by?: string
  approved_at?: string
  source?: string
}

const CONFIG_ENV = "POS_APPROVED_TAX_RATES_JSON"

function loadConfiguration(): ApprovedTaxRate[] {
  const raw = process.env[CONFIG_ENV]?.trim()
  if (!raw) throw new Error(`${CONFIG_ENV} is required; no tax rates were changed`)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${CONFIG_ENV} must contain valid JSON`)
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${CONFIG_ENV} must be a non-empty JSON array`)
  }
  return parsed as ApprovedTaxRate[]
}

function validate(rate: ApprovedTaxRate) {
  rate.country_code = String(rate.country_code || "").toLowerCase() as ApprovedTaxRate["country_code"]
  rate.province_code = rate.province_code?.trim().toLowerCase()
  if (!(["ca", "us"] as string[]).includes(rate.country_code)) throw new Error(`Unsupported country_code for ${rate.name || "unnamed rate"}`)
  if (rate.country_code === "us" && !rate.province_code) throw new Error(`USA rate ${rate.name} must specify province_code; national USA rates are forbidden`)
  if (!rate.name?.trim() || !rate.code?.trim()) throw new Error("Every approved tax rate requires name and code")
  if (!Number.isFinite(rate.rate) || rate.rate < 0 || rate.rate > 100) throw new Error(`Invalid percentage for ${rate.name}`)
  const rules = [...(rate.product_ids || []), ...(rate.product_type_ids || []), ...(rate.shipping_option_ids || [])]
  if (rate.rate === 0 && (rate.is_default || rules.length === 0)) throw new Error(`Zero/exempt rate ${rate.name} must be non-default and have explicit rules`)
  if (rate.fixture) {
    if (process.env.POS_ALLOW_TEST_TAX_FIXTURES !== "true") throw new Error(`Fixture rate ${rate.name} requires POS_ALLOW_TEST_TAX_FIXTURES=true`)
    if (!/^TEST[ _:-]/i.test(rate.name) || !/^TEST[ _:-]/i.test(rate.code)) throw new Error(`Fixture rate ${rate.name} must have TEST-prefixed name and code`)
  } else if (!rate.approved_by?.trim() || !rate.approved_at?.trim() || !rate.source?.trim()) {
    throw new Error(`Production rate ${rate.name} requires approved_by, approved_at, and source`)
  }
}

export default async function configurePosApprovedTaxRates({ container }: ExecArgs) {
  const taxService = container.resolve(Modules.TAX)
  const configuration = loadConfiguration()
  configuration.forEach(validate)

  const results: Array<Record<string, unknown>> = []
  for (const configuredRate of configuration) {
    const countryRegions = await taxService.listTaxRegions({ country_code: configuredRate.country_code }, { take: 100 })
    const parent = countryRegions.find((region) => !region.parent_id && !region.province_code)
    if (!parent) throw new Error(`Missing parent tax region for ${configuredRate.country_code}`)
    let region = configuredRate.province_code
      ? countryRegions.find((candidate) => candidate.province_code === configuredRate.province_code)
      : parent
    if (!region && configuredRate.province_code) {
      const created = await createTaxRegionsWorkflow(container).run({
        input: [{
          country_code: configuredRate.country_code,
          province_code: configuredRate.province_code,
          parent_id: parent.id,
          provider_id: parent.provider_id || "tp_system",
          metadata: { configured_by: "configure-pos-approved-tax-rates" },
        }],
      })
      region = created.result[0]
    }
    if (!region) throw new Error(`Unable to resolve tax region for ${configuredRate.country_code}-${configuredRate.province_code || "country"}`)

    const existing = (await taxService.listTaxRates({ tax_region_id: region.id }, { take: 100, relations: ["rules"] }))
      .find((rate) => rate.code === configuredRate.code)
    if (existing) {
      if (Number(existing.rate) !== configuredRate.rate || existing.name !== configuredRate.name || Boolean(existing.is_default) !== Boolean(configuredRate.is_default)) {
        throw new Error(`Existing rate ${configuredRate.code} differs from approved configuration; refusing an implicit overwrite`)
      }
      results.push({ code: configuredRate.code, taxRegionId: region.id, status: "ALREADY_CONFIGURED", taxRateId: existing.id })
      continue
    }

    const rules = [
      ...(configuredRate.product_ids || []).map((reference_id) => ({ reference: "product", reference_id })),
      ...(configuredRate.product_type_ids || []).map((reference_id) => ({ reference: "product_type", reference_id })),
      ...(configuredRate.shipping_option_ids || []).map((reference_id) => ({ reference: "shipping_option", reference_id })),
    ]
    const { result } = await createTaxRatesWorkflow(container).run({
      input: [{
        tax_region_id: region.id,
        name: configuredRate.name,
        code: configuredRate.code,
        rate: configuredRate.rate,
        is_default: Boolean(configuredRate.is_default),
        rules,
        created_by: configuredRate.fixture ? "explicit-test-fixture" : configuredRate.approved_by,
        metadata: {
          fixture: Boolean(configuredRate.fixture),
          approved_by: configuredRate.approved_by || null,
          approved_at: configuredRate.approved_at || null,
          source: configuredRate.source || "explicit-test-fixture",
          configured_by: "configure-pos-approved-tax-rates",
        },
      }],
    })
    results.push({ code: configuredRate.code, taxRegionId: region.id, status: "CREATED", taxRateId: result[0].id, fixture: Boolean(configuredRate.fixture) })
  }

  console.log("[POS_APPROVED_TAX_CONFIGURATION]")
  console.log(JSON.stringify({ configured: results.length, results }, null, 2))
}
