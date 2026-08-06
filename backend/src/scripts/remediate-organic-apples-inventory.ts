import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const VARIANT_ID = "variant_01KVSFB75GZJ4N0B9SY6BXDTZC"

export default async function remediateOrganicApplesInventory({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventory: any = container.resolve(Modules.INVENTORY)
  const mode = [...(args || []), ...process.argv.slice(2)].includes("apply") ? "apply" : "dry-run"

  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "manage_inventory", "allow_backorder", "inventory_items.inventory_item_id"],
    filters: { id: [VARIANT_ID] },
  })
  const variant = variants?.[0]
  if (!variant) throw new Error("Organic Apples variant not found")
  const itemId = variant.inventory_items?.[0]?.inventory_item_id
  if (!itemId) throw new Error("Unexpected missing inventory link; run diagnosis before remediation")
  const levels = await inventory.listInventoryLevels({ inventory_item_id: itemId })
  const available = levels.map((level: any) => Number(level.stocked_quantity ?? 0) - Number(level.reserved_quantity ?? 0))

  logger.info("[ORGANIC_APPLES_INVENTORY_REMEDIATION]")
  logger.info(JSON.stringify({
    mode,
    variantId: VARIANT_ID,
    inventoryItemId: itemId,
    levels: levels.map((level: any) => ({
      locationId: level.location_id,
      stockedQuantity: level.stocked_quantity,
      reservedQuantity: level.reserved_quantity,
      availableQuantity: Number(level.stocked_quantity ?? 0) - Number(level.reserved_quantity ?? 0),
    })),
    result: "NO_WRITE",
    reason: available.every((quantity: number) => quantity <= 0)
      ? "ZERO_AVAILABLE_QUANTITY: populate the merchant approval CSV with an approved quantity before any apply can be considered."
      : "Inventory is not a zero-stock remediation case.",
    inventoryWrites: 0,
  }, null, 2))

  if (mode === "apply") {
    throw new Error("Apply is intentionally not implemented for zero stock without an explicit merchant-approved quantity workflow")
  }
}
