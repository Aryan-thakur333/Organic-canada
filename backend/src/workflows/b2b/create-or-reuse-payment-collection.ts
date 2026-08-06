import { storedMinor } from "../../utils/b2b/money"
import { getQuoteFinalPayableTotalMinor } from "../../utils/b2b/quote-commission"

export type B2BQuotePaymentCollection = {
  id: string
  amount: number
  currency_code: string
  quote_id: string
  offer_version: number
}

export async function createOrReuseB2BQuotePaymentCollection(
  b2bService: any,
  quote: any
): Promise<B2BQuotePaymentCollection> {
  const amount = getQuoteFinalPayableTotalMinor(quote)
  const offerVersion = Math.max(1, storedMinor(quote.offer_version, 1))
  const currencyCode = String(quote.currency_code || "cad").toLowerCase()
  const expectedId = `b2bpc_${quote.id}_v${offerVersion}`
  const existingId = quote.payment_collection_id || quote.metadata?.payment_collection_id
  const paymentCollectionId = existingId || expectedId

  if (!existingId) {
    await b2bService.updateQuotes({
      id: quote.id,
      payment_collection_id: paymentCollectionId,
      metadata: {
        ...(quote.metadata || {}),
        payment_collection_id: paymentCollectionId,
        payment_collection: {
          id: paymentCollectionId,
          amount,
          currency_code: currencyCode,
          quote_id: quote.id,
          offer_version: offerVersion,
        },
      },
    })
  }

  return {
    id: paymentCollectionId,
    amount,
    currency_code: currencyCode,
    quote_id: quote.id,
    offer_version: offerVersion,
  }
}
