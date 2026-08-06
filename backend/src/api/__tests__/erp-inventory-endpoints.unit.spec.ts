import { POST as inventorySyncPOST } from "../admin/erp/inventory/sync/route"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const mockMedusaVariant = {
  id: "var_shirt_black",
  sku: "ERP-SHIRT-S-BLACK",
  manage_inventory: true,
  inventory_items: [
    {
      inventory_item_id: "ii_shirt_black",
      inventory: {
        location_levels: [
          {
            id: "lvl_canada",
            location_id: "sloc_01KVJF9HWWJ38MPAFDGH5YB0W1",
            stocked_quantity: 100,
            reserved_quantity: 20
          }
        ]
      }
    }
  ]
}

const mockOdooProduct = {
  id: 51,
  default_code: "ERP-SHIRT-S-BLACK"
}

const mockOdooLocation = {
  id: 8,
  complete_name: "WH/Stock",
  usage: "internal"
}

const mockOdooQuant = {
  id: 99,
  quantity: 0,
  reserved_quantity: 0
}

const mockOdooClient = {
  executeKeyword: jest.fn()
}

const mockInventoryCapability = {
  productId: 51,
  templateId: 40,
  sku: "ERP-SHIRT-S-BLACK",
  productType: "product",
  templateType: "product",
  isStorable: true,
  tracking: "none",
  inventoryTrackable: true
}

const mockErpService = {
  getClient: () => mockOdooClient,
  getOptions: jest.fn(),
  assertOdooProductInventoryTrackable: jest.fn().mockResolvedValue(mockInventoryCapability)
}

const mockQuery = {
  graph: jest.fn()
}

const mockReqWithParams = (body: any = {}, queryParams: any = {}) => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return {
    body,
    query: queryParams,
    scope: {
      resolve: (token: string) => {
        if (token === "erp") return mockErpService
        if (token === ContainerRegistrationKeys.QUERY) return mockQuery
        if (token === ContainerRegistrationKeys.LOGGER) return logger
      }
    }
  } as unknown as MedusaRequest
}

type MockResponse = MedusaResponse & { body: any }

function mockRes(): MockResponse {
  let statusCode = 200
  let body: any = null
  const res = {
    status: jest.fn((code: number) => {
      statusCode = code
      return res
    }),
    json: jest.fn((data: any) => { body = data }),
    setHeader: jest.fn(),
    get statusCode() { return statusCode },
    get body() { return body },
  }
  return res as unknown as MockResponse
}

describe("ERP Inventory Sync Medusa -> Odoo Export & Alignment Tests", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.ERP_INVENTORY_SYNC_ENABLED = "false"
    process.env.ERP_INVENTORY_DRY_RUN = "true"
    process.env.ERP_MEDUSA_STOCK_LOCATION_ID = "sloc_01KVJF9HWWJ38MPAFDGH5YB0W1"
    process.env.ERP_ODOO_LOCATION_ID = "8"
    mockErpService.getOptions.mockReturnValue({
      inventorySyncEnabled: false,
      inventoryDryRun: true
    })
    mockErpService.assertOdooProductInventoryTrackable.mockResolvedValue(mockInventoryCapability)
    mockOdooClient.executeKeyword.mockResolvedValue([])
  })

  // --- API Contract & Validation Tests ---

  test("API Validation 1: body { sku: 'ERP-SHIRT-S-BLACK' } -> passes exact-SKU validation", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct])
      .mockResolvedValueOnce([])

    await inventorySyncPOST(req, res)

    expect(res.status).not.toHaveBeenCalledWith(400)
    expect(res.body.success).toBe(true)
    expect(res.body.items[0].sku).toBe("ERP-SHIRT-S-BLACK")
  })

  test("API Validation 2: body { sku: ' ERP-SHIRT-S-BLACK ' } -> trims and passes", async () => {
    const req = mockReqWithParams({ sku: " ERP-SHIRT-S-BLACK " })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct])
      .mockResolvedValueOnce([])

    await inventorySyncPOST(req, res)

    expect(res.status).not.toHaveBeenCalledWith(400)
    expect(res.body.success).toBe(true)
    expect(res.body.items[0].sku).toBe("ERP-SHIRT-S-BLACK")
  })

  test("API Validation 3: body {} -> ERP_INVENTORY_EXACT_SKU_REQUIRED", async () => {
    const req = mockReqWithParams({})
    const res = mockRes()

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.body.error.code).toBe("ERP_INVENTORY_EXACT_SKU_REQUIRED")
  })

  test("API Validation 4: body { sku: '' } -> ERP_INVENTORY_EXACT_SKU_REQUIRED", async () => {
    const req = mockReqWithParams({ sku: "" })
    const res = mockRes()

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.body.error.code).toBe("ERP_INVENTORY_EXACT_SKU_REQUIRED")
  })

  test("API Validation 5: body { sku: ['ERP-A'] } -> ERP_INVENTORY_EXACT_SKU_REQUIRED", async () => {
    const req = mockReqWithParams({ sku: ["ERP-A"] })
    const res = mockRes()

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.body.error.code).toBe("ERP_INVENTORY_EXACT_SKU_REQUIRED")
  })

  test("API Validation 6: body { sku: 'SHIRT-S-BLACK' } -> prefix-specific validation error", async () => {
    const req = mockReqWithParams({ sku: "SHIRT-S-BLACK" })
    const res = mockRes()

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(422)
    expect(res.body.error.code).toBe("ERP_PRODUCT_FILTER_INVALID")
  })

  // --- Core Business Logic & Seeding Tests ---

  test("Business Logic: Medusa SKU missing", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct])
    mockQuery.graph.mockResolvedValueOnce({ data: [] })

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.body.error.code).toBe("ERP_INVENTORY_SKU_NOT_FOUND")
  })

  test("Business Logic: Odoo SKU missing", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([])

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.body.error.code).toBe("ERP_ODOO_PRODUCT_NOT_FOUND")
  })

  test("Business Logic: Odoo duplicate SKU", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct, { ...mockOdooProduct, id: 52 }])

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.body.error.code).toBe("ERP_ODOO_SKU_AMBIGUOUS")
  })

  test("Business Logic: invalid Odoo location", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword.mockResolvedValueOnce([{ ...mockOdooLocation, usage: "view" }])

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.body.error.code).toBe("ERP_ODOO_LOCATION_INVALID")
  })

  test("Business Logic: Medusa 100 / Odoo 0 -> UPDATE", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct])
      .mockResolvedValueOnce([])

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.body.items[0]).toEqual(expect.objectContaining({
      action: "UPDATE",
      medusaStockedQuantity: 100,
      odooQuantity: 0,
      targetQuantity: 100,
      delta: 100
    }))
  })

  test("Business Logic: Medusa 100 / Odoo 100 -> SKIP", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct])
      .mockResolvedValueOnce([{ ...mockOdooQuant, quantity: 100 }])

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.body.items[0]).toEqual(expect.objectContaining({
      action: "SKIP",
      medusaStockedQuantity: 100,
      odooQuantity: 100,
      targetQuantity: 100,
      delta: 0
    }))
  })

  test("Business Logic: dry-run -> zero Odoo writes", async () => {
    const req = mockReqWithParams({ confirmInventoryWrite: true, sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct])
      .mockResolvedValueOnce([])

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const calls = mockOdooClient.executeKeyword.mock.calls
    const writeCalls = calls.filter((c: any) => ["create", "write", "action_apply_inventory"].includes(c[1]))
    expect(writeCalls.length).toBe(0)
  })

  test("Business Logic: only configured Medusa location used", async () => {
    process.env.ERP_MEDUSA_STOCK_LOCATION_ID = "sloc_wrong"
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct])
    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.body.error.code).toBe("ERP_INVENTORY_LOCATION_NOT_MAPPED")
  })

  test("Business Logic: only configured Odoo location used", async () => {
    process.env.ERP_ODOO_LOCATION_ID = "88"
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword.mockResolvedValueOnce([])

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.body.error.code).toBe("ERP_ODOO_LOCATION_INVALID")
    expect(mockOdooClient.executeKeyword).toHaveBeenCalledWith(
      "stock.location",
      "read",
      [[88]],
      expect.any(Object)
    )
  })

  test("Business Logic: reserved Medusa stock behavior explicitly tested", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct])
      .mockResolvedValueOnce([])

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.body.items[0].medusaReservedQuantity).toBe(20)
    expect(res.body.items[0].medusaStockedQuantity).toBe(100)
  })

  test("Business Logic: second sync idempotent", async () => {
    process.env.ERP_INVENTORY_DRY_RUN = "false"
    process.env.ERP_INVENTORY_SYNC_ENABLED = "true"
    mockErpService.getOptions.mockReturnValue({
      inventorySyncEnabled: true,
      inventoryDryRun: false
    })

    const req = mockReqWithParams({ confirmInventoryWrite: true, sku: "ERP-SHIRT-S-BLACK" })
    const res = mockRes()

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] })
    mockOdooClient.executeKeyword
      .mockResolvedValueOnce([mockOdooLocation])
      .mockResolvedValueOnce([mockOdooProduct])
      .mockResolvedValueOnce([{ ...mockOdooQuant, quantity: 100 }])

    await inventorySyncPOST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.body.items[0].action).toBe("SKIP")
    expect(res.body.items[0].reason).toBe("NO_CHANGES")
  })
})
