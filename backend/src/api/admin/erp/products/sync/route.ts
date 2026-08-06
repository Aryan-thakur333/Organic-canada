import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils"
import { ErpError } from "../../../../../modules/erp/types"
import { buildOdooInventoryProductFields } from "../../../../../modules/erp/mappers/odoo-inventory-product.mapper"
import {
  createProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows"

import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

type ErpMedusaVariant = {
  id: string
  sku?: string | null
  barcode?: string | null
  prices?: Array<{
    amount?: number | null
    currency_code?: string | null
  }> | null
  product?: {
    id: string
    title: string
    status: string
    metadata?: Record<string, unknown> | null
  } | null
  inventory_items?: Array<{
    inventory_item_id?: string | null
  }> | null
}

type QueryGraph = {
  graph(input: Record<string, unknown>): Promise<{
    data: Array<any>
  }>
}

type OdooProduct = {
  id: number
  name: string
  default_code: string | false
  list_price: number
  qty_available: number
  active: boolean
}

type ErpService = {
  getExactProductForSync(sku: string): Promise<OdooProduct>
  dryRunProductSync(input: {
    limit?: number
    sku?: string
    findMedusaVariantsBySku(
      skus: string[]
    ): Promise<ErpMedusaVariant[]>
  }): Promise<Record<string, unknown>>
}

function toErpMetadata(product: OdooProduct) {
  return {
    erp_provider: "odoo",
    odoo_product_id: product.id,
    erp_sku: product.default_code,
    erp_list_price: Number(product.list_price),
    erp_qty_available: Number(product.qty_available),
  }
}

function toErpHandle(sku: string): string {
  const normalized = sku
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  return `erp-${normalized}`
}

function getErrorCode(error: unknown, fallback: string) {
  return error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : fallback
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
) {
  try {
    const dryRun =
      process.env.ERP_PRODUCT_SYNC_DRY_RUN !== "false"

    type ProductSyncBody = {
      sku?: unknown
      confirmWrite?: unknown
      direction?: unknown
    }
    const body = req.body as ProductSyncBody | undefined
    const querySku =
      typeof req.query.sku === "string"
        ? req.query.sku.trim()
        : undefined
    const bodySku =
      typeof body?.sku === "string"
        ? body.sku.trim()
        : undefined

    if (querySku && bodySku && querySku !== bodySku) {
      return res.status(400).json({
        success: false,
        dryRun: true,
        error: {
          code: "ERP_PRODUCT_FILTER_INVALID",
          message:
            "Provide the same SKU in the query or request body, not conflicting values.",
        },
      })
    }

    const sku = querySku || bodySku

    const requestedLimit =
      typeof req.query.limit === "string"
        ? Number(req.query.limit)
        : Number(
            process.env.ERP_PRODUCT_SYNC_LIMIT || 20
          )

    const limit =
      Number.isInteger(requestedLimit) &&
      requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 20

    const erpService = req.scope.resolve<any>("erp")
    const query = req.scope.resolve<QueryGraph>(
      ContainerRegistrationKeys.QUERY
    )

    const direction = String(body?.direction || req.query.direction || "").trim().toLowerCase()

    const findMedusaVariantsBySku = async (
      skus: string[]
    ): Promise<ErpMedusaVariant[]> => {
      if (!skus.length) {
        return []
      }

      const { data } = await query.graph({
        entity: "variant",
        fields: [
          "id",
          "sku",
          "barcode",
          "product.id",
          "product.title",
          "product.status",
          "product.metadata",
          "prices.amount",
          "prices.currency_code",
          "inventory_items.inventory_item_id",
        ],
        filters: {
          sku: skus,
        },
        pagination: {
          take: 100,
        },
      })

      return data as ErpMedusaVariant[]
    }

    console.info(`[ERP_SYNC_RUNTIME_VERSION] ${JSON.stringify({ marker: "erp-sync-medusa-export-v2" })}`)

    const medusaVariants: ErpMedusaVariant[] = sku ? await findMedusaVariantsBySku([sku]) : []

    let existsInOdoo = false
    let odooProduct: any = null
    if (sku) {
      try {
        const skuPrefix = erpService.getSkuPrefix()
        if (sku.startsWith(skuPrefix)) {
          const products = await erpService.getProducts({ sku, limit: 2 })
          const activeProducts = products.filter((p: any) => p.active && String(p.default_code).trim() === sku)
          if (activeProducts.length > 0) {
            existsInOdoo = true
            odooProduct = activeProducts[0]
          }
        }
      } catch (err) {
        existsInOdoo = false
      }
    }

    const isExport = direction === "medusa_to_odoo" || direction === "export" || (sku && medusaVariants.length > 0 && !existsInOdoo)

    if (isExport) {
      if (!sku) {
        return res.status(400).json({
          success: false,
          dryRun,
          error: {
            code: "ERP_EXACT_SKU_REQUIRED",
            message: "Real ERP product sync requires one exact SKU.",
          },
        })
      }

      const skuPrefix = erpService.getSkuPrefix()
      if (!sku.startsWith(skuPrefix)) {
        return res.status(422).json({
          success: false,
          dryRun,
          error: {
            code: "ERP_PRODUCT_FILTER_INVALID",
            message: `Requested SKU must start with the configured ERP prefix (${skuPrefix})`,
          },
        })
      }

      if (medusaVariants.length === 0) {
        return res.status(404).json({
          success: false,
          dryRun,
          error: {
            code: "ERP_MEDUSA_VARIANT_NOT_FOUND",
            message: `No Medusa variant found for SKU ${sku}`,
          },
        })
      }

      if (medusaVariants.length > 1) {
        return res.status(409).json({
          success: false,
          dryRun,
          error: {
            code: "ERP_MEDUSA_SKU_AMBIGUOUS",
            message: `Multiple Medusa variants use SKU ${sku}.`,
          },
        })
      }

      const variant = medusaVariants[0]
      const product = variant.product

      if (!product) {
        return res.status(404).json({
          success: false,
          dryRun,
          error: {
            code: "ERP_MEDUSA_VARIANT_NOT_FOUND",
            message: `The matching Medusa variant ${sku} is missing its product relation.`,
          },
        })
      }

      const cadPriceRecord = variant.prices?.find((p: any) => String(p.currency_code).toLowerCase() === "cad")
      
      if (!cadPriceRecord || typeof cadPriceRecord.amount !== "number" || cadPriceRecord.amount <= 0) {
        return res.status(422).json({
          success: false,
          dryRun,
          error: {
            code: "ERP_PRICE_INVALID_AMOUNT",
            message: `Medusa variant ${sku} is missing a valid CAD price.`,
          },
        })
      }

      const priceAmount = Number(cadPriceRecord.amount)

      // Check duplicate Odoo SKU
      const odooProducts = await erpService.getProducts({ sku, limit: 10 })
      const activeOdooProducts = odooProducts.filter((p: any) => p.active && String(p.default_code).trim() === sku)

      if (activeOdooProducts.length > 1) {
        return res.status(409).json({
          success: false,
          dryRun,
          error: {
            code: "ERP_ODOO_SKU_AMBIGUOUS",
            message: `Multiple active Odoo products use SKU ${sku}`,
          },
        })
      }

      const odooMatch = activeOdooProducts[0] || null
      const odooProductId = odooMatch ? odooMatch.id : null

      let action: "CREATE" | "UPDATE" | "SKIP" = "CREATE"
      let reason = "ODOO_SKU_NOT_FOUND"

      if (odooMatch) {
        const titleChanged = product?.title !== odooMatch.name
        const priceChanged = Math.abs(priceAmount - Number(odooMatch.list_price)) > 0.001
        const activeChanged = (product?.status === ProductStatus.PUBLISHED) !== odooMatch.active

        if (titleChanged || priceChanged || activeChanged) {
          action = "UPDATE"
          reason = "MATCHED_BY_SKU"
        } else {
          action = "SKIP"
          reason = "NO_CHANGES"
        }
      }

      const summary = {
        medusaVariantsRead: 1,
        odooMatches: odooMatch ? 1 : 0,
        wouldCreate: action === "CREATE" ? 1 : 0,
        wouldUpdate: action === "UPDATE" ? 1 : 0,
        skipped: action === "SKIP" ? 1 : 0,
        errors: 0,
      }

      const capabilities = await erpService.getOdooProductCapabilities()
      const payload: Record<string, any> = {}

      if (action === "CREATE") {
        payload.name = product?.title || "Unnamed Product"
        payload.default_code = sku
        payload.list_price = priceAmount
        payload.active = true

        // Physical Medusa products intended for inventory sync must be
        // created as inventory-trackable storable goods, not consumables.
        const inventoryFields = buildOdooInventoryProductFields(capabilities)
        Object.assign(payload, inventoryFields)
      } else if (action === "UPDATE") {
        payload.name = product?.title || odooMatch?.name || "Unnamed Product"
        payload.list_price = priceAmount
        payload.active = product?.status === ProductStatus.PUBLISHED
      }

      if (action !== "SKIP") {
        // Validate payload keys against Odoo capability schema
        for (const key of Object.keys(payload)) {
          if (!capabilities.productProductFields.has(key)) {
            throw new ErpError(
              "ERP_ODOO_SCHEMA_INCOMPATIBLE",
              `Field '${key}' is not supported on Odoo model 'product.product'.`
            )
          }
        }
      }

      const item = {
        sku,
        medusaProductId: product?.id || null,
        medusaVariantId: variant.id,
        odooProductId,
        name: product?.title || "",
        listPrice: priceAmount,
        action,
        reason,
      }

      if (dryRun) {
        return res.status(200).json({
          success: true,
          dryRun: true,
          summary,
          items: [item],
        })
      }

      if (body?.confirmWrite !== true) {
        return res.status(400).json({
          success: false,
          dryRun: false,
          error: {
            code: "ERP_WRITE_CONFIRMATION_REQUIRED",
            message: "Set confirmWrite to true to perform the exact SKU write.",
          },
        })
      }

      if (action === "CREATE") {
        const newOdooId = await erpService.createOdooProduct(payload)
        item.odooProductId = Number(newOdooId)
      } else if (action === "UPDATE" && odooProductId) {
        await erpService.writeOdooProduct(odooProductId, payload)
      }

      return res.status(200).json({
        success: true,
        dryRun: false,
        summary: {
          created: action === "CREATE" ? 1 : 0,
          updated: action === "UPDATE" ? 1 : 0,
          unchanged: action === "SKIP" ? 1 : 0,
          errors: 0,
        },
        items: [item],
      })
    }

    // Fail closed on Medusa-side data problems before delegating to the
    // comparison/import flow: a SKU that exists nowhere must never silently
    // become an empty comparison, and ambiguous Medusa SKUs must never be
    // compared as if they were one variant.
    if (sku) {
      if (medusaVariants.length === 0) {
        return res.status(404).json({
          success: false,
          dryRun,
          error: {
            code: "ERP_MEDUSA_VARIANT_NOT_FOUND",
            message: `No Medusa variant found for SKU ${sku}`,
          },
        })
      }

      if (medusaVariants.length > 1) {
        return res.status(409).json({
          success: false,
          dryRun,
          error: {
            code: "ERP_MEDUSA_SKU_AMBIGUOUS",
            message: `Multiple Medusa variants use SKU ${sku}.`,
          },
        })
      }
    }

    if (dryRun) {
      const result = await erpService.dryRunProductSync({
        limit,
        sku,
        findMedusaVariantsBySku,
      })

      return res.status(200).json(result)
    }

    if (!sku) {
      return res.status(400).json({
        success: false,
        dryRun: false,
        error: {
          code: "ERP_EXACT_SKU_REQUIRED",
          message:
            "Real ERP product sync requires one exact SKU.",
        },
      })
    }

    if (body?.confirmWrite !== true) {
      return res.status(400).json({
        success: false,
        dryRun: false,
        error: {
          code: "ERP_WRITE_CONFIRMATION_REQUIRED",
          message:
            "Set confirmWrite to true to perform the exact SKU write.",
        },
      })
    }

    console.info(
      `[ERP_PRODUCT_WRITE_START] provider=odoo sku=${sku}`
    )

    const erpProduct =
      await erpService.getExactProductForSync(sku)
    const variants = await findMedusaVariantsBySku([sku])

    if (variants.length > 1) {
      console.warn(
        `[ERP_DUPLICATE_SKU] provider=medusa sku=${sku}`
      )
      return res.status(409).json({
        success: false,
        dryRun: false,
        error: {
          code: "ERP_DUPLICATE_MEDUSA_SKU",
          message:
            `Multiple Medusa variants use SKU ${sku}.`,
        },
      })
    }

    const erpMetadata = toErpMetadata(erpProduct)

    if (!variants.length) {
      try {
        const { result } =
          await createProductsWorkflow(req.scope).run({
            input: {
              products: [
                {
                  title: erpProduct.name,
                  handle: toErpHandle(sku),
                  status: ProductStatus.DRAFT,
                  metadata: erpMetadata,
                  options: [
                    {
                      title: "Default",
                      values: ["Default"],
                    },
                  ],
                  variants: [
                    {
                      title: "Default",
                      sku,
                      options: {
                        Default: "Default",
                      },
                      manage_inventory: false,
                      allow_backorder: false,
                    },
                  ],
                },
              ],
            },
          })

        const createdProduct = result[0]
        const createdVariant =
          createdProduct?.variants?.find(
            (variant) => variant.sku === sku
          ) || createdProduct?.variants?.[0]

        console.info(
          `[ERP_PRODUCT_CREATE_SUCCESS] provider=odoo sku=${sku} productId=${createdProduct?.id} variantId=${createdVariant?.id}`
        )

        return res.status(200).json({
          success: true,
          dryRun: false,
          summary: {
            created: 1,
            updated: 0,
            unchanged: 0,
            errors: 0,
          },
          items: [
            {
              sku,
              odooProductId: erpProduct.id,
              name: erpProduct.name,
              action: "CREATE",
              medusaProductId: createdProduct?.id,
              medusaVariantId: createdVariant?.id,
              erpListPrice: erpProduct.list_price,
              erpQtyAvailable: erpProduct.qty_available,
            },
          ],
        })
      } catch (error) {
        console.error(
          `[ERP_PRODUCT_WRITE_FAILED] provider=odoo sku=${sku} code=ERP_PRODUCT_CREATE_FAILED`
        )
        return res.status(502).json({
          success: false,
          dryRun: false,
          error: {
            code: "ERP_PRODUCT_CREATE_FAILED",
            message: "Could not create the Medusa ERP product.",
          },
        })
      }
    }

    const existingVariant = variants[0]
    const existingProduct = existingVariant.product
    if (!existingProduct?.id) {
      return res.status(502).json({
        success: false,
        dryRun: false,
        error: {
          code: "ERP_PRODUCT_UPDATE_FAILED",
          message:
            "The matching Medusa variant is missing its product relation.",
        },
      })
    }

    const currentMetadata =
      existingProduct.metadata || {}
    const metadataChanged = Object.entries(
      erpMetadata
    ).some(
      ([key, value]) =>
        currentMetadata[key] !== value
    )
    const titleChanged =
      existingProduct.title !== erpProduct.name

    if (!metadataChanged && !titleChanged) {
      console.info(
        `[ERP_PRODUCT_UNCHANGED] provider=odoo sku=${sku} productId=${existingProduct.id} variantId=${existingVariant.id}`
      )
      return res.status(200).json({
        success: true,
        dryRun: false,
        summary: {
          created: 0,
          updated: 0,
          unchanged: 1,
          errors: 0,
        },
        items: [
          {
            sku,
            odooProductId: erpProduct.id,
            name: erpProduct.name,
            action: "UNCHANGED",
            medusaProductId: existingProduct.id,
            medusaVariantId: existingVariant.id,
            erpListPrice: erpProduct.list_price,
            erpQtyAvailable: erpProduct.qty_available,
          },
        ],
      })
    }

    try {
      await updateProductsWorkflow(req.scope).run({
        input: {
          products: [
            {
              id: existingProduct.id,
              ...(titleChanged
                ? { title: erpProduct.name }
                : {}),
              ...(metadataChanged
                ? {
                    metadata: {
                      ...currentMetadata,
                      ...erpMetadata,
                    },
                  }
                : {}),
            },
          ],
        },
      })

      console.info(
        `[ERP_PRODUCT_UPDATE_SUCCESS] provider=odoo sku=${sku} productId=${existingProduct.id} variantId=${existingVariant.id}`
      )

      return res.status(200).json({
        success: true,
        dryRun: false,
        summary: {
          created: 0,
          updated: 1,
          unchanged: 0,
          errors: 0,
        },
        items: [
          {
            sku,
            odooProductId: erpProduct.id,
            name: erpProduct.name,
            action: "UPDATE",
            medusaProductId: existingProduct.id,
            medusaVariantId: existingVariant.id,
            erpListPrice: erpProduct.list_price,
            erpQtyAvailable: erpProduct.qty_available,
          },
        ],
      })
    } catch (error) {
      console.error(
        `[ERP_PRODUCT_WRITE_FAILED] provider=odoo sku=${sku} code=ERP_PRODUCT_UPDATE_FAILED`
      )
      return res.status(502).json({
        success: false,
        dryRun: false,
        error: {
          code: "ERP_PRODUCT_UPDATE_FAILED",
          message: "Could not update the Medusa ERP product.",
        },
      })
    }
  } catch (error) {
    const code = getErrorCode(
      error,
      "ERP_PRODUCT_SYNC_FAILED"
    )

    return res.status(502).json({
      success: false,
      dryRun: true,
      error: {
        code,
        message:
          error instanceof Error
            ? error.message
            : "Unknown ERP product sync error",
      },
    })
  }
}
