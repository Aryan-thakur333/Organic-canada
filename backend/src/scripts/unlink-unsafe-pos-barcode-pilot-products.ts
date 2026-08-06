import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { linkProductsToSalesChannelWorkflow } from "@medusajs/core-flows"
import * as path from "path"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { classifyPilotProducts, unresolvedSuspiciousCadPriceProductIds, type PilotProduct, type PilotRegister } from "./lib/pos-barcode-pilot"

const argumentValue = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() || ""

export default async function unlinkUnsafePosBarcodePilotProducts({ container }: ExecArgs) {
  if (!process.argv.includes("--apply")) throw new Error("Unsafe pilot unlink requires explicit --apply")
  const backupReference = argumentValue("backup-reference")
  if (!backupReference) throw new Error("Unsafe pilot unlink requires --backup-reference")
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const channelService = container.resolve(Modules.SALES_CHANNEL) as any
  const posService = container.resolve(POS_MODULE) as PosModuleService
  const [channels, registers, graph] = await Promise.all([
    channelService.listSalesChannels({}, { take: 100 }), posService.listPosRegisters({}, { take: 100 }),
    query.graph({ entity: "product", fields: ["id", "title", "handle", "status", "deleted_at", "metadata", "type.value", "sales_channels.id", "sales_channels.name", "vendor.id", "variants.id", "variants.title", "variants.sku", "variants.barcode", "variants.upc", "variants.ean", "variants.manage_inventory", "variants.allow_backorder", "variants.prices.amount", "variants.prices.currency_code", "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.location_id", "variants.inventory_items.inventory.location_levels.stocked_quantity", "variants.inventory_items.inventory.location_levels.reserved_quantity"], pagination: { take: 10000 } }),
  ])
  const posChannels = channels.filter((channel: any) => channel.name?.trim().toUpperCase() === "POS" && !channel.is_disabled)
  if (posChannels.length !== 1) throw new Error(`Expected exactly one active POS sales channel; found ${posChannels.length}`)
  const products = graph.data as PilotProduct[]
  const unsafeIds = unresolvedSuspiciousCadPriceProductIds(path.resolve(process.cwd(), "reports", "suspicious-cad-prices.csv"), products)
  const decisions = classifyPilotProducts(products, posChannels[0].id, registers as PilotRegister[], unsafeIds)
  const targets = decisions.filter((decision) => decision.classification === "MANUAL_REVIEW" && decision.alreadyLinked && decision.reasons.some((reason) => reason.includes("suspicious minor-unit seed")))
  if (!targets.length) {
    console.log("[POS_PILOT_UNSAFE_PRICE_UNLINK]")
    console.log(JSON.stringify({ plannedUnlinks: 0, removedLinks: 0, auditRecords: 0, databaseWrites: 0, passed: true }, null, 2))
    return
  }
  await linkProductsToSalesChannelWorkflow(container).run({ input: { id: posChannels[0].id, remove: targets.map((decision) => decision.product!.id) } })
  for (const target of targets) await posService.createPosAuditEvents({ event_type: "POS_PILOT_PRODUCT_UNLINKED_UNSAFE_PRICE", message: "Pilot product removed from POS pending merchant price approval", metadata: { product_id: target.product!.id, product_title: target.title, sales_channel_id: posChannels[0].id, backup_reference: backupReference, reasons: target.reasons } })
  const verified = await query.graph({ entity: "product", fields: ["id", "sales_channels.id"], filters: { id: targets.map((target) => target.product!.id) }, pagination: { take: 100 } })
  const stillLinked = (verified.data as PilotProduct[]).filter((product) => product.sales_channels?.some((channel) => channel.id === posChannels[0].id))
  if (stillLinked.length) throw new Error(`Unsafe pilot POS unlink failed for: ${stillLinked.map((product) => product.id).join(", ")}`)
  console.log("[POS_PILOT_UNSAFE_PRICE_UNLINK]")
  console.log(JSON.stringify({ plannedUnlinks: targets.length, removedLinks: targets.length, auditRecords: targets.length, databaseWrites: targets.length * 2, passed: true, products: targets.map((target) => ({ id: target.product!.id, title: target.title })) }, null, 2))
}
