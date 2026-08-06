import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ingestOmsOrderWorkflow } from "../workflows/oms/ingest-order"

export default async function omsOrderPlaced({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  try {
    await ingestOmsOrderWorkflow(container).run({ input: { order_id: data.id } })
  } catch (error: any) {
    const logger: any = container.resolve("logger")
    logger.error(`[OMS_ORDER_INGESTION_ERROR] order_id=${data.id} message=${String(error?.message || error)}`)
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
