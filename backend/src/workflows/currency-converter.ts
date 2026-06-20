import {
  createWorkflow,
  createStep,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"

// ── Types ──────────────────────────────────────────────────────────────────

export type CurrencyConverterInput = {
  /** The amount in the source currency (in minor units / cents) */
  amount: number
  /** ISO currency code of the source (e.g. "eur", "usd") */
  from_currency: string
  /** ISO currency code of the target (e.g. "inr", "usd") */
  to_currency: string
  /** Optional region_id — if provided, uses the region's tax-inclusive settings */
  region_id?: string
}

export type CurrencyConverterOutput = {
  original_amount: number
  from_currency: string
  to_currency: string
  converted_amount: number
  rate: number
  region_id: string | null
}

// ── Static exchange rate table (fallback) ──────────────────────────────────
// In production, replace this with a live FX API or Medusa PriceList rules.
// Rates are expressed as: 1 unit of FROM = RATE units of TO.

const FALLBACK_RATES: Record<string, Record<string, number>> = {
  eur: {
    usd: 1.08,
    inr: 90.5,
    gbp: 0.85,
    jpy: 169.5,
    aud: 1.63,
    cad: 1.47,
    chf: 0.96,
    cny: 7.83,
  },
  usd: {
    eur: 0.93,
    inr: 83.8,
    gbp: 0.79,
    jpy: 157.0,
    aud: 1.51,
    cad: 1.36,
    chf: 0.89,
    cny: 7.25,
  },
  inr: {
    eur: 0.011,
    usd: 0.012,
    gbp: 0.0094,
  },
}

function getRate(from: string, to: string): number {
  // Same currency — identity
  if (from === to) return 1

  // Direct lookup
  const direct = FALLBACK_RATES[from]?.[to]
  if (direct != null) return direct

  // Inverse lookup
  const inverse = FALLBACK_RATES[to]?.[from]
  if (inverse != null) return 1 / inverse

  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    `No exchange rate available for ${from.toUpperCase()} → ${to.toUpperCase()}`
  )
}

// ── Step: Fetch region currency ────────────────────────────────────────────

const resolveRegionCurrencyStep = createStep(
  "resolve-region-currency",
  async ({ region_id }: { region_id: string }, { container }) => {
    const query = container.resolve("query")

    const { data: regions } = await query.graph({
      entity: "region",
      fields: ["id", "name", "currency_code"],
      filters: { id: region_id },
    })

    const region = regions?.[0]
    if (!region) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Region "${region_id}" not found`
      )
    }

    return new StepResponse({
      region_id: region.id,
      region_name: region.name,
      currency_code: region.currency_code,
    })
  },
  async () => {}
)

// ── Step: Perform conversion ───────────────────────────────────────────────

const performConversionStep = createStep(
  "perform-currency-conversion",
  async (
    input: {
      amount: number
      from_currency: string
      to_currency: string
      region_id: string | null
    }
  ) => {
    const { amount, from_currency, to_currency, region_id } = input
    const rate = getRate(from_currency, to_currency)
    const converted_amount = Math.round(amount * rate)

    const output: CurrencyConverterOutput = {
      original_amount: amount,
      from_currency,
      to_currency,
      converted_amount,
      rate,
      region_id,
    }

    return new StepResponse(output)
  },
  async () => {}
)

// ── Workflow ───────────────────────────────────────────────────────────────

/**
 * Currency Converter Workflow
 *
 * Converts a price amount between currencies using a configurable exchange rate
 * table. Supports dynamic region-based currency resolution.
 *
 * Usage:
 * ```
 * // Direct conversion
 * const { result } = await currencyConverterWorkflow(container).run({
 *   input: { amount: 499, from_currency: "eur", to_currency: "inr" }
 * })
 *
 * // Region-aware (resolves target currency from the region)
 * const { result } = await currencyConverterWorkflow(container).run({
 *   input: {
 *     amount: 499,
 *     from_currency: "eur",
 *     to_currency: "inr",
 *     region_id: "reg_01J..."
 *   }
 * })
 * ```
 */
export const currencyConverterWorkflow = createWorkflow(
  "currency-converter",

  (input: CurrencyConverterInput) => {
    // If a region_id is provided, resolve the region's currency as target
    const regionInfo = input.region_id
      ? resolveRegionCurrencyStep({ region_id: input.region_id })
      : null

    const targetCurrency = regionInfo?.currency_code ?? input.to_currency

    const result = performConversionStep({
      amount: input.amount,
      from_currency: input.from_currency,
      to_currency: targetCurrency,
      region_id: input.region_id ?? null,
    })

    return new WorkflowResponse(result)
  }
)
