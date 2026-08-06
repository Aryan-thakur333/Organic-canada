import { OdooClient } from "./clients/odoo-client"
import { buildOdooInventoryProductFields } from "./mappers/odoo-inventory-product.mapper"

import type {
  ErpProductSyncResult,
  ErpHealthResult,
  ErpModuleOptions,
  OdooInventorySnapshot,
  OdooProduct,
  OdooProductCapabilities,
  OdooProductInventoryCapability,
} from "./types"
import { ErpError } from "./types"

export default class ErpModuleService {
  private readonly client?: OdooClient
  private capabilities: OdooProductCapabilities | null = null

  constructor(
    _container: Record<string, unknown>,
    private readonly options: ErpModuleOptions
  ) {
    if (options.enabled && this.hasRequiredOptions()) {
      this.client = new OdooClient(options)
    }
  }

  private hasRequiredOptions(): boolean {
    if (
      !this.options.baseUrl ||
      !this.options.databaseName ||
      !this.options.username ||
      !this.options.password
    ) {
      return false
    }

    return true
  }

  public getClient(): OdooClient {
    if (!this.options.enabled) {
      throw new ErpError(
        "ERP_DISABLED",
        "ERP integration is disabled"
      )
    }

    if (!this.client) {
      throw new ErpError(
        "ERP_CONFIG_INVALID",
        "ERP module configuration is incomplete"
      )
    }

    return this.client
  }

  async getOdooProductCapabilities(): Promise<OdooProductCapabilities> {
    if (this.capabilities) {
      return this.capabilities
    }

    try {
      const client = this.getClient()
      const [pFields, tFields] = await Promise.all([
        client.executeKeyword<Record<string, unknown>>("product.product", "fields_get", [[], ["detailed_type", "type", "is_storable", "active", "list_price", "default_code", "barcode", "product_tmpl_id", "name"]]),
        client.executeKeyword<Record<string, unknown>>("product.template", "fields_get", [[], ["detailed_type", "type", "is_storable", "active", "list_price", "default_code", "barcode", "name"]])
      ])

      this.capabilities = {
        productProductFields: new Set(Object.keys(pFields || {})),
        productTemplateFields: new Set(Object.keys(tFields || {}))
      }

      console.info(`[ERP_ODOO_CAPABILITIES] resolved productProductFields=${Array.from(this.capabilities.productProductFields).join(",")} productTemplateFields=${Array.from(this.capabilities.productTemplateFields).join(",")}`)
    } catch (err: any) {
      console.warn(`[ERP_ODOO_CAPABILITIES_FAILED] could not fetch Odoo schema metadata: ${err.message}`)
      this.capabilities = {
        productProductFields: new Set(["type", "active", "list_price", "default_code", "name"]),
        productTemplateFields: new Set(["type", "active", "list_price", "default_code", "name"])
      }
    }

    return this.capabilities
  }

  getOptions(): ErpModuleOptions {
    return this.options
  }

  getSkuPrefix(): string {
    return this.options.skuPrefix || "ERP-"
  }

  async createOdooProduct(payload: Record<string, any>): Promise<number> {
    return this.getClient().executeKeyword<number>("product.product", "create", [payload])
  }

  async writeOdooProduct(id: number, payload: Record<string, any>): Promise<boolean> {
    return this.getClient().executeKeyword<boolean>("product.product", "write", [[id], payload])
  }

  async writeOdooProductTemplate(templateId: number, payload: Record<string, any>): Promise<boolean> {
    return this.getClient().executeKeyword<boolean>("product.template", "write", [[templateId], payload])
  }

  async getProductInventoryCapability(
    productId: number
  ): Promise<OdooProductInventoryCapability> {
    return this.getClient().getProductInventoryCapability(productId)
  }

  async getProductTemplate(
    templateId: number
  ): Promise<{
    id: number
    name: string
    default_code: string | false
    type?: string
    is_storable?: boolean
    tracking?: string
    active?: boolean
    list_price?: number
  } | null> {
    return this.getClient().getProductTemplate(templateId)
  }

  /**
   * Preflight check: verifies an Odoo product is inventory-trackable
   * before any stock.quant operations are attempted.
   *
   * Throws ERP_ODOO_PRODUCT_NOT_STORABLE if the product cannot support
   * stock.quant / inventory adjustments.
   */
  async assertOdooProductInventoryTrackable(
    productId: number
  ): Promise<OdooProductInventoryCapability> {
    const capability = await this.getProductInventoryCapability(productId)

    if (!capability.inventoryTrackable) {
      throw new ErpError(
        "ERP_ODOO_PRODUCT_NOT_STORABLE",
        `Odoo product ${productId} (SKU ${capability.sku || "unknown"}) is not configured as an inventory-trackable storable good.`
      )
    }

    return capability
  }

  /**
   * Repairs an existing Odoo product to be inventory-trackable.
   * Writes only fields supported by the live Odoo schema.
   * Does NOT create a new record.
   */
  async repairOdooProductForInventory(
    productId: number
  ): Promise<{
    productId: number
    templateId: number
    sku: string
    repaired: boolean
    fieldsWritten: Record<string, unknown>
  }> {
    const capability = await this.getProductInventoryCapability(productId)

    if (capability.inventoryTrackable) {
      return {
        productId,
        templateId: capability.templateId,
        sku: capability.sku,
        repaired: false,
        fieldsWritten: {},
      }
    }

    const capabilities = await this.getOdooProductCapabilities()
    const inventoryFields = buildOdooInventoryProductFields(capabilities)

    if (Object.keys(inventoryFields).length === 0) {
      throw new ErpError(
        "ERP_ODOO_SCHEMA_INCOMPATIBLE",
        "No supported Odoo fields are available to mark a product as inventory-trackable."
      )
    }

    // Write to product.product (which propagates to product.template)
    await this.writeOdooProduct(productId, inventoryFields)

    // Also write to product.template to ensure both are consistent.
    // Odoo 18: `type` does NOT accept "product" as a value.
    // `is_storable` is the authoritative inventory-trackable flag.
    if (capability.templateId) {
      const templateCapabilities = {
        productProductFields: capabilities.productProductFields,
        productTemplateFields: capabilities.productTemplateFields,
      }
      const templateFields: Record<string, unknown> = {}

      if (templateCapabilities.productTemplateFields.has("is_storable")) {
        templateFields.is_storable = true
      }

      if (Object.keys(templateFields).length > 0) {
        await this.writeOdooProductTemplate(capability.templateId, templateFields)
      }
    }

    console.info(
      `[ERP_ODOO_PRODUCT_REPAIRED] productId=${productId} templateId=${capability.templateId} sku=${capability.sku} fields=${JSON.stringify(inventoryFields)}`
    )

    return {
      productId,
      templateId: capability.templateId,
      sku: capability.sku,
      repaired: true,
      fieldsWritten: inventoryFields,
    }
  }

  async healthCheck(): Promise<ErpHealthResult> {
    const startedAt = Date.now()
    const auth = await this.getClient().healthCheck()

    return {
      enabled: true,
      connected: true,
      provider: "odoo",
      database: auth.databaseName,
      userId: auth.uid,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    }
  }

  async getProducts(input?: {
    sku?: string
    skuPrefix?: string
    limit?: number
  }): Promise<OdooProduct[]> {
    return this.getClient().getProducts(input)
  }

  async getExactProductForSync(
    sku: string
  ): Promise<OdooProduct> {
    const skuPrefix = this.options.skuPrefix.trim()
    const requestedSku = sku.trim()

    if (!requestedSku) {
      throw new ErpError(
        "ERP_EXACT_SKU_REQUIRED",
        "An exact ERP SKU is required for product writes"
      )
    }

    if (!skuPrefix || !requestedSku.startsWith(skuPrefix)) {
      throw new ErpError(
        "ERP_PRODUCT_FILTER_INVALID",
        `Requested SKU must start with the configured ERP prefix (${skuPrefix || "not configured"})`
      )
    }

    const products = await this.getProducts({
      sku: requestedSku,
      limit: 2,
    })

    const eligibleProducts = products.filter((product) => {
      const productSku =
        typeof product.default_code === "string"
          ? product.default_code.trim()
          : ""

      return (
        product.active &&
        productSku === requestedSku &&
        productSku.startsWith(skuPrefix)
      )
    })

    if (!eligibleProducts.length) {
      throw new ErpError(
        "ERP_PRODUCT_NOT_FOUND",
        `No active Odoo product was found for SKU ${requestedSku}`
      )
    }

    if (eligibleProducts.length > 1) {
      console.warn(
        `[ERP_DUPLICATE_SKU] provider=odoo sku=${requestedSku}`
      )
      throw new ErpError(
        "ERP_DUPLICATE_SKU",
        `Multiple active Odoo products use SKU ${requestedSku}`
      )
    }

    return eligibleProducts[0]
  }

  async getExactInventorySnapshot(
    sku: string
  ): Promise<OdooInventorySnapshot> {
    const requestedSku = sku.trim()
    const skuPrefix = this.options.skuPrefix.trim()

    if (!requestedSku) {
      throw new ErpError(
        "ERP_EXACT_SKU_REQUIRED",
        "An exact ERP SKU is required for inventory sync"
      )
    }

    if (!skuPrefix || !requestedSku.startsWith(skuPrefix)) {
      throw new ErpError(
        "ERP_PRODUCT_FILTER_INVALID",
        `Requested SKU must start with the configured ERP prefix (${skuPrefix || "not configured"})`
      )
    }

    if (!this.options.odooLocationId) {
      throw new ErpError(
        "ERP_INVENTORY_LOCATION_NOT_MAPPED",
        "ERP_ODOO_LOCATION_ID must identify one internal Odoo location"
      )
    }

    return this.getClient().getInventorySnapshot(
      requestedSku,
      this.options.odooLocationId
    )
  }

  async dryRunProductSync(input: {
    findMedusaVariantsBySku(
      skus: string[]
    ): Promise<Array<{
      id: string
      sku?: string | null
      product?: { id?: string; title?: string } | null
    }>>
    limit?: number
    sku?: string
  }): Promise<ErpProductSyncResult> {
    const skuPrefix = this.options.skuPrefix.trim()

    if (!skuPrefix) {
      throw new ErpError(
        "ERP_PRODUCT_FILTER_INVALID",
        "ERP product sync requires a non-empty SKU prefix"
      )
    }

    const requestedSku = input.sku?.trim()
    if (requestedSku && !requestedSku.startsWith(skuPrefix)) {
      throw new ErpError(
        "ERP_PRODUCT_FILTER_INVALID",
        `Requested SKU must start with the configured ERP prefix (${skuPrefix})`
      )
    }

    console.info(
      `[ERP_SYNC_DRY_RUN_START] provider=odoo sku=${requestedSku || "all"} skuPrefix=${skuPrefix}`
    )

    const fetchedProducts = await this.getProducts({
      limit: input.limit ?? 20,
      sku: requestedSku,
      skuPrefix: requestedSku ? undefined : skuPrefix,
    })

    // The client narrows candidates in Odoo; this second check makes sync safe
    // even if an Odoo domain behaves differently across server configurations.
    const erpProducts = fetchedProducts.filter((product) => {
      const sku =
        typeof product.default_code === "string"
          ? product.default_code.trim()
          : ""

      return (
        product.active &&
        Boolean(sku) &&
        sku.startsWith(skuPrefix) &&
        (!requestedSku || sku === requestedSku)
      )
    })

    const activeSkuCounts = new Map<string, number>()
    for (const product of erpProducts) {
      const sku =
        typeof product.default_code === "string"
          ? product.default_code.trim()
          : ""

      if (sku) {
        activeSkuCounts.set(
          sku,
          (activeSkuCounts.get(sku) ?? 0) + 1
        )
      }
    }

    const uniqueSkus = Array.from(activeSkuCounts.keys())
    const medusaVariants =
      await input.findMedusaVariantsBySku(uniqueSkus)

    const medusaSkuCounts = new Map<string, number>()
    for (const variant of medusaVariants) {
      const sku = variant.sku?.trim()
      if (sku) {
        medusaSkuCounts.set(
          sku,
          (medusaSkuCounts.get(sku) ?? 0) + 1
        )
      }
    }

    const summary = {
      erpProductsRead: erpProducts.length,
      matchedBySku: 0,
      wouldCreate: 0,
      wouldUpdate: 0,
      skipped: 0,
      errors: 0,
    }

    const items = erpProducts.map((product) => {
      const sku =
        typeof product.default_code === "string"
          ? product.default_code.trim()
          : ""

      if (!sku) {
        summary.skipped += 1
        return {
          sku: null,
          odooProductId: product.id,
          name: product.name,
          listPrice: product.list_price,
          quantity: product.qty_available,
          action: "SKIP" as const,
          reason: "MISSING_ERP_SKU",
        }
      }

      if ((activeSkuCounts.get(sku) ?? 0) > 1) {
        summary.errors += 1
        console.warn(
          `[ERP_DUPLICATE_SKU] provider=odoo sku=${sku}`
        )
        return {
          sku,
          odooProductId: product.id,
          name: product.name,
          listPrice: product.list_price,
          quantity: product.qty_available,
          action: "ERROR" as const,
          reason: "DUPLICATE_ERP_SKU",
        }
      }

      const medusaMatchCount =
        medusaSkuCounts.get(sku) ?? 0

      if (medusaMatchCount > 1) {
        summary.errors += 1
        console.warn(
          `[ERP_DUPLICATE_SKU] provider=medusa sku=${sku}`
        )
        return {
          sku,
          odooProductId: product.id,
          name: product.name,
          listPrice: product.list_price,
          quantity: product.qty_available,
          action: "ERROR" as const,
          reason: "DUPLICATE_MEDUSA_SKU",
        }
      }

      if (medusaMatchCount === 1) {
        summary.matchedBySku += 1
        summary.wouldUpdate += 1
        return {
          sku,
          odooProductId: product.id,
          name: product.name,
          listPrice: product.list_price,
          quantity: product.qty_available,
          action: "UPDATE" as const,
          reason: "MATCHED_BY_SKU",
        }
      }

      summary.wouldCreate += 1
      return {
        sku,
        odooProductId: product.id,
        name: product.name,
        listPrice: product.list_price,
        quantity: product.qty_available,
        action: "CREATE" as const,
        reason: "SKU_NOT_FOUND_IN_MEDUSA",
      }
    })

    console.info(
      `[ERP_SYNC_DRY_RUN_COMPLETE] provider=odoo erpProductsRead=${summary.erpProductsRead} wouldCreate=${summary.wouldCreate} wouldUpdate=${summary.wouldUpdate} skipped=${summary.skipped} errors=${summary.errors}`
    )

    return {
      success: true,
      dryRun: true,
      summary,
      items,
    }
  }
}
