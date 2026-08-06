import type { ExecArgs } from "@medusajs/framework/types"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { POS_BARCODE_PILOT_TITLES } from "./lib/pos-barcode-pilot"

export default async function verifyPosBarcodePilotWrites({ container }: ExecArgs) {
  const service = container.resolve(POS_MODULE) as PosModuleService
  const [linkEvents, unlinkEvents, barcodeEvents] = await Promise.all([
    service.listPosAuditEvents({ event_type: "POS_PILOT_PRODUCT_LINKED" }, { take: 1000 }),
    service.listPosAuditEvents({ event_type: "POS_PILOT_PRODUCT_UNLINKED_UNSAFE_PRICE" }, { take: 1000 }),
    service.listPosAuditEvents({ event_type: "VARIANT_INTERNAL_BARCODE_ASSIGNED" }, { take: 1000 }),
  ])
  const pilotLinkEvents = linkEvents.filter((event: any) => (POS_BARCODE_PILOT_TITLES as readonly string[]).includes(String(event.metadata?.product_title || "")))
  const pilotBarcodeEvents = barcodeEvents.filter((event: any) => String(event.metadata?.approval_file || "") === "pilot-pos-barcode-approvals.csv")
  const pilotUnlinkEvents = unlinkEvents.filter((event: any) => (POS_BARCODE_PILOT_TITLES as readonly string[]).includes(String(event.metadata?.product_title || "")))
  const marker = {
    salesChannelLinkWrites: pilotLinkEvents.length,
    salesChannelAuditWrites: pilotLinkEvents.length,
    unsafeSalesChannelUnlinkWrites: pilotUnlinkEvents.length,
    unsafeSalesChannelUnlinkAuditWrites: pilotUnlinkEvents.length,
    barcodeVariantWrites: pilotBarcodeEvents.length,
    barcodeAuditWrites: pilotBarcodeEvents.length,
    totalLogicalDatabaseWrites: pilotLinkEvents.length * 2 + pilotUnlinkEvents.length * 2 + pilotBarcodeEvents.length * 2,
    linkProductIds: pilotLinkEvents.map((event: any) => event.metadata?.product_id),
    barcodeVariantIds: pilotBarcodeEvents.map((event: any) => event.metadata?.variant_id),
  }
  console.log("[POS_BARCODE_PILOT_WRITE_AUDIT]")
  console.log(JSON.stringify(marker, null, 2))
}
