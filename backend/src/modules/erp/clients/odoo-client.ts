import type {
  ErpErrorCode,
  ErpModuleOptions,
  OdooAuthenticationResult,
  OdooInventorySnapshot,
  OdooProduct,
  OdooProductInventoryCapability,
} from "../types"
import { ErpError } from "../types"

type JsonRpcResponse<T> = {
  jsonrpc: "2.0"
  id: number
  result?: T
  error?: {
    code: number
    message: string
    data?: {
      name?: string
      message?: string
      debug?: string
    }
  }
}

export class OdooClient {
  constructor(
    private readonly options: ErpModuleOptions
  ) {}

  private get endpoint(): string {
    return `${this.options.baseUrl.replace(/\/$/, "")}/jsonrpc`
  }

  private async request<T>(
    service: string,
    method: string,
    args: unknown[],
    errorCode: ErpErrorCode
  ): Promise<T> {
    const controller = new AbortController()

    const timeoutId = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs
    )

    try {
      const response = await fetch(
        this.endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "call",
            params: {
              service,
              method,
              args,
            },
            id: Date.now(),
          }),
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        throw new ErpError(
          "ERP_CONNECTION_FAILED",
          `Odoo HTTP request failed with status ${response.status}`
        )
      }

      const payload = (await response
        .json()
        .catch(() => {
          throw new ErpError(
            "ERP_MALFORMED_RESPONSE",
            "Odoo returned a malformed JSON response"
          )
        })) as JsonRpcResponse<T>

      if (payload.error) {
        throw new ErpError(
          errorCode,
          payload.error.data?.message ||
          payload.error.message ||
          "Unknown Odoo error"
        )
      }

      if (payload.result === undefined) {
        throw new ErpError(
          "ERP_MALFORMED_RESPONSE",
          "Odoo response has no result"
        )
      }

      return payload.result
    } catch (error) {
      if (error instanceof ErpError) {
        throw error
      }

      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        throw new ErpError(
          "ERP_TIMEOUT",
          "ERP request timed out"
        )
      }

      throw new ErpError(
        "ERP_CONNECTION_FAILED",
        "Could not connect to Odoo"
      )
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private get dbName(): string {
    return this.options.databaseName
  }

  async authenticate(): Promise<OdooAuthenticationResult> {
    try {
      const uid = await this.request<number | false>(
        "common",
        "authenticate",
        [
          this.dbName,
          this.options.username,
          this.options.password,
          {},
        ],
        "ERP_AUTHENTICATION_FAILED"
      )

      if (!uid) {
        throw new ErpError(
          "ERP_AUTHENTICATION_FAILED",
          "Odoo authentication failed"
        )
      }

      console.info(
        `[ERP_CONNECT_SUCCESS] provider=odoo database=${this.dbName} userId=${uid}`
      )

      return {
        uid,
        databaseName: this.dbName,
        username: this.options.username,
      }
    } catch (error) {
      const code =
        error instanceof ErpError
          ? error.code
          : "ERP_CONNECTION_FAILED"

      console.warn(
        `[ERP_CONNECT_FAILED] provider=odoo code=${code}`
      )

      throw error
    }
  }

  async executeKeyword<T>(
    model: string,
    method: string,
    positionalArguments: unknown[],
    keywordArguments: Record<string, unknown> = {}
  ): Promise<T> {
    const auth = await this.authenticate()

    return this.request<T>(
      "object",
      "execute_kw",
      [
        this.dbName,
        auth.uid,
        this.options.password,
        model,
        method,
        positionalArguments,
        keywordArguments,
      ],
      "ERP_PRODUCT_FETCH_FAILED"
    )
  }

  async getProducts(input?: {
    sku?: string
    skuPrefix?: string
    limit?: number
  }): Promise<OdooProduct[]> {
    const domain: unknown[] = [
      ["active", "=", true],
    ]

    if (input?.sku) {
      domain.push([
        "default_code",
        "=",
        input.sku.trim(),
      ])
    } else if (input?.skuPrefix) {
      domain.push([
        "default_code",
        "=like",
        `${input.skuPrefix.trim()}%`,
      ])
    }

    try {
      const products =
        await this.executeKeyword<OdooProduct[]>(
          "product.product",
          "search_read",
          [domain],
          {
            fields: [
              "id",
              "name",
              "default_code",
              "list_price",
              "standard_price",
              "qty_available",
              "active",
            ],
            limit: input?.limit ?? 20,
            order: "id asc",
          }
        )

      if (!Array.isArray(products)) {
        throw new ErpError(
          "ERP_MALFORMED_RESPONSE",
          "Odoo product response was not a list"
        )
      }

      const normalizedProducts = products.map((product) => ({
        ...product,
        name: String(product.name || "").trim(),
        default_code:
          typeof product.default_code === "string"
            ? product.default_code.trim()
            : (false as const),
      }))

      console.info(
        `[ERP_PRODUCT_FETCH_SUCCESS] provider=odoo count=${normalizedProducts.length} sku=${input?.sku?.trim() || "all"} skuPrefix=${input?.skuPrefix?.trim() || "none"}`
      )

      return normalizedProducts
    } catch (error) {
      const code =
        error instanceof ErpError
          ? error.code
          : "ERP_PRODUCT_FETCH_FAILED"

      console.warn(
        `[ERP_PRODUCT_FETCH_FAILED] provider=odoo code=${code} sku=${input?.sku?.trim() || "all"} skuPrefix=${input?.skuPrefix?.trim() || "none"}`
      )

      throw error
    }
  }

  async getProductBySku(
    sku: string
  ): Promise<OdooProduct | null> {
    const products = await this.getProducts({
      sku,
      limit: 2,
    })

    return products[0] ?? null
  }

  async getProductInventoryCapability(
    productId: number
  ): Promise<OdooProductInventoryCapability> {
    const products = await this.executeKeyword<
      Array<{
        id: number
        name: string
        default_code: string | false
        type?: string
        is_storable?: boolean
        tracking?: string
        product_tmpl_id?: [number, string] | number
      }>
    >(
      "product.product",
      "search_read",
      [[["id", "=", productId]]],
      {
        fields: [
          "id",
          "name",
          "default_code",
          "type",
          "is_storable",
          "tracking",
          "product_tmpl_id",
        ],
        limit: 2,
      }
    )

    if (!products || products.length === 0) {
      throw new ErpError(
        "ERP_PRODUCT_NOT_FOUND",
        `No Odoo product was found for ID ${productId}`
      )
    }

    const product = products[0]
    const templateId =
      typeof product.product_tmpl_id === "number"
        ? product.product_tmpl_id
        : product.product_tmpl_id?.[0] ?? 0

    const productType = String(product.type || "").trim()
    const isStorable = Boolean(product.is_storable)
    const tracking = String(product.tracking || "none").trim()

    // Odoo 18: `is_storable` is the authoritative field that marks
    // a product as inventory-trackable (supports stock.quant).
    const inventoryTrackable = isStorable

    return {
      productId: product.id,
      templateId,
      sku:
        typeof product.default_code === "string"
          ? product.default_code.trim()
          : "",
      productType,
      templateType: productType,
      isStorable,
      tracking,
      inventoryTrackable,
    }
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
    const templates = await this.executeKeyword<
      Array<{
        id: number
        name: string
        default_code: string | false
        type?: string
        is_storable?: boolean
        tracking?: string
        active?: boolean
        list_price?: number
      }>
    >(
      "product.template",
      "search_read",
      [[["id", "=", templateId]]],
      {
        fields: [
          "id",
          "name",
          "default_code",
          "type",
          "is_storable",
          "tracking",
          "active",
          "list_price",
        ],
        limit: 2,
      }
    )

    return templates?.[0] ?? null
  }

  async getInventorySnapshot(
    sku: string,
    locationId: number
  ): Promise<OdooInventorySnapshot> {
    const products = await this.getProducts({
      sku,
      limit: 2,
    })

    if (!products.length) {
      throw new ErpError(
        "ERP_INVENTORY_SKU_NOT_FOUND",
        `No active Odoo product was found for SKU ${sku}`
      )
    }

    if (products.length > 1) {
      throw new ErpError(
        "ERP_INVENTORY_DUPLICATE_SKU",
        `Multiple active Odoo products use SKU ${sku}`
      )
    }

    const product = products[0]
    const locations = await this.executeKeyword<
      Array<{
        id: number
        name: string
        complete_name: string
        usage: string
      }>
    >(
      "stock.location",
      "search_read",
      [[["id", "=", locationId]]],
      {
        fields: [
          "id",
          "name",
          "complete_name",
          "usage",
        ],
        limit: 2,
      }
    )

    const location = locations[0]
    if (!location || location.usage !== "internal") {
      throw new ErpError(
        "ERP_INVENTORY_LOCATION_NOT_MAPPED",
        "The configured Odoo inventory location is missing or not internal"
      )
    }

    const quants = await this.executeKeyword<
      Array<{
        quantity?: number
        reserved_quantity?: number
        available_quantity?: number
      }>
    >(
      "stock.quant",
      "search_read",
      [[
        ["product_id", "=", product.id],
        ["location_id", "=", locationId],
      ]],
      {
        fields: [
          "quantity",
          "reserved_quantity",
          "available_quantity",
        ],
        limit: 100,
      }
    )

    const quantity = quants.reduce(
      (total, quant) => total + Number(quant.quantity),
      0
    )
    const reservedQuantity = quants.reduce(
      (total, quant) =>
        total + Number(quant.reserved_quantity),
      0
    )
    const availableQuantity = quants.reduce(
      (total, quant) =>
        total + Number(quant.available_quantity),
      0
    )

    if (
      !Number.isFinite(quantity) ||
      !Number.isFinite(reservedQuantity) ||
      !Number.isFinite(availableQuantity) ||
      quantity < 0 ||
      reservedQuantity < 0
    ) {
      throw new ErpError(
        "ERP_INVENTORY_INVALID_QUANTITY",
        "Odoo returned an invalid inventory quantity"
      )
    }

    return {
      sku,
      productId: product.id,
      globalQuantity: Number(product.qty_available),
      freeQuantity: quantity - reservedQuantity,
      locationId,
      locationName:
        location.complete_name || location.name,
      quantity,
      reservedQuantity,
      availableQuantity,
    }
  }

  async healthCheck(): Promise<OdooAuthenticationResult> {
    return this.authenticate()
  }
}
