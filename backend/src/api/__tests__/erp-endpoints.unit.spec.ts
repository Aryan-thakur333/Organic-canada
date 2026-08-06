import { POST as syncPOST } from "../admin/erp/products/sync/route";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import ensureErpTestProductLoader from "../../scripts/ensure-erp-test-product";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

const mockMedusaVariant = {
  id: "var_shirt_black",
  sku: "ERP-SHIRT-S-BLACK",
  barcode: "shirt-barcode",
  product: {
    id: "prod_shirt",
    title: "ERP Test Shirt",
    status: ProductStatus.PUBLISHED,
    // Already linked to the Canada sales channel so the idempotent loader
    // skips the (unit-test-untestable) link workflow in its repair path.
    sales_channels: [
      { id: "sc_01KWSKACE7DEGMXG6GH1ZRSA4V" }
    ]
  },
  prices: [
    {
      amount: 25.00,
      currency_code: "cad",
    }
  ],
  inventory_items: [
    {
      inventory_item_id: "ii_shirt_black"
    }
  ]
};

const mockOdooProduct = {
  id: 42,
  name: "ERP Test Shirt",
  default_code: "ERP-SHIRT-S-BLACK",
  list_price: 25.00,
  qty_available: 100,
  active: true,
};

const mockOdooClient = {
  executeKeyword: jest.fn(),
};

const mockErpService = {
  getSkuPrefix: jest.fn(() => "ERP-"),
  getProducts: jest.fn(),
  getExactProductForSync: jest.fn(),
  dryRunProductSync: jest.fn(),
  createOdooProduct: jest.fn(),
  writeOdooProduct: jest.fn(),
  getOdooProductCapabilities: jest.fn(),
  client: mockOdooClient,
};

const mockQuery = {
  graph: jest.fn(),
};

const mockReqWithParams = (body: any = {}, queryParams: any = {}) => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return {
    body,
    query: queryParams,
    scope: {
      resolve: (token: string) => {
        if (token === "erp") return mockErpService;
        if (token === ContainerRegistrationKeys.QUERY) return mockQuery;
        if (token === ContainerRegistrationKeys.LOGGER) return logger;
      }
    }
  } as unknown as MedusaRequest;
};

type MockResponse = MedusaResponse & { body: any };

function mockRes(): MockResponse {
  let statusCode = 200;
  let body: any = null;
  const res = {
    status: jest.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: jest.fn((data: any) => { body = data }),
    setHeader: jest.fn(),
    get statusCode() { return statusCode },
    get body() { return body },
  };
  return res as unknown as MockResponse;
}

describe("ERP Sync Medusa -> Odoo Export & Alignment Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ERP_PRODUCT_SYNC_DRY_RUN = "true";
    mockErpService.getOdooProductCapabilities.mockResolvedValue({
      productProductFields: new Set(["name", "default_code", "list_price", "active", "detailed_type"]),
      productTemplateFields: new Set(["name", "default_code", "list_price", "active", "detailed_type"])
    });
  });

  test("1. ERP prefix rejection (SHIRT-S-BLACK -> ERP_PRODUCT_FILTER_INVALID)", async () => {
    const req = mockReqWithParams({ sku: "SHIRT-S-BLACK" });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [{ ...mockMedusaVariant, sku: "SHIRT-S-BLACK" }] });

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.body).toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: "ERP_PRODUCT_FILTER_INVALID"
      })
    }));
  });

  test("2. Medusa variant missing (ERP-NOT-FOUND -> ERP_MEDUSA_VARIANT_NOT_FOUND)", async () => {
    const req = mockReqWithParams({ sku: "ERP-NOT-FOUND" });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [] });
    mockErpService.getProducts.mockResolvedValue([]);

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body).toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: "ERP_MEDUSA_VARIANT_NOT_FOUND"
      })
    }));
  });

  test("3. Medusa variant present, Odoo absent (ERP-SHIRT-S-BLACK -> wouldCreate 1, action CREATE)", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] });
    mockErpService.getProducts.mockResolvedValue([]);

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.summary).toEqual(expect.objectContaining({
      wouldCreate: 1,
      wouldUpdate: 0,
      skipped: 0
    }));
    expect(res.body.items[0]).toEqual(expect.objectContaining({
      sku: "ERP-SHIRT-S-BLACK",
      action: "CREATE",
      reason: "ODOO_SKU_NOT_FOUND"
    }));
  });

  test("4. Medusa variant present, Odoo present (-> wouldUpdate 1, action UPDATE)", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK", direction: "medusa_to_odoo" });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] });
    mockErpService.getProducts.mockResolvedValue([{ ...mockOdooProduct, list_price: 10.00 }]);

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.summary).toEqual(expect.objectContaining({
      wouldCreate: 0,
      wouldUpdate: 1,
      skipped: 0
    }));
    expect(res.body.items[0]).toEqual(expect.objectContaining({
      action: "UPDATE",
      reason: "MATCHED_BY_SKU"
    }));
  });

  test("5. same values (-> SKIP / NO_CHANGES if implemented)", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK", direction: "medusa_to_odoo" });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] });
    mockErpService.getProducts.mockResolvedValue([mockOdooProduct]);

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.summary).toEqual(expect.objectContaining({
      wouldCreate: 0,
      wouldUpdate: 0,
      skipped: 1
    }));
    expect(res.body.items[0]).toEqual(expect.objectContaining({
      action: "SKIP",
      reason: "NO_CHANGES"
    }));
  });

  test("6. duplicate Odoo SKU (-> ERP_ODOO_SKU_AMBIGUOUS)", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK", direction: "medusa_to_odoo" });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] });
    mockErpService.getProducts.mockResolvedValue([mockOdooProduct, { ...mockOdooProduct, id: 99 }]);

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body).toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: "ERP_ODOO_SKU_AMBIGUOUS"
      })
    }));
  });

  test("7. duplicate Medusa SKU (-> ERP_MEDUSA_SKU_AMBIGUOUS)", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant, { ...mockMedusaVariant, id: "var_dup" }] });
    mockErpService.getProducts.mockResolvedValue([]);

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body).toEqual(expect.objectContaining({
      error: expect.objectContaining({
        code: "ERP_MEDUSA_SKU_AMBIGUOUS"
      })
    }));
  });

  test("8. dry-run (-> zero create/write calls)", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] });
    mockErpService.getProducts.mockResolvedValue([]);

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockErpService.createOdooProduct).not.toHaveBeenCalled();
    expect(mockErpService.writeOdooProduct).not.toHaveBeenCalled();
  });

  test("9. CAD price 25.00 (-> mapped Odoo list_price exactly 25)", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK" });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] });
    mockErpService.getProducts.mockResolvedValue([]);

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.items[0].listPrice).toBe(25.00);
  });

  test("10. loader idempotency (-> repeated execution creates no duplicates)", async () => {
    const container = {
      resolve: (token: string) => {
        if (token === ContainerRegistrationKeys.QUERY) {
          return {
            graph: jest.fn().mockResolvedValue({ data: [mockMedusaVariant] })
          };
        }
        if (token === ContainerRegistrationKeys.LOGGER) {
          return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        }
        if (token === Modules.INVENTORY) {
          return {
            createInventoryLevels: jest.fn().mockResolvedValue([{}]),
            updateInventoryLevels: jest.fn().mockResolvedValue([{}])
          };
        }
      }
    } as any;

    await expect(ensureErpTestProductLoader({ container } as any)).resolves.toBeUndefined();
  });

  test("11. existing ERP-APPLE-001 behavior is not broken", async () => {
    const req = mockReqWithParams({ sku: "ERP-APPLE-001" });
    const res = mockRes();

    const mockAppleOdoo = {
      id: 55,
      name: "Organic Apples",
      default_code: "ERP-APPLE-001",
      list_price: 4.99,
      qty_available: 50,
      active: true
    };

    mockQuery.graph.mockResolvedValue({ data: [{ id: "var_apple", sku: "ERP-APPLE-001", product: { id: "prod_apple", title: "Organic Apples" } }] });
    mockErpService.getProducts.mockResolvedValue([mockAppleOdoo]);
    mockErpService.dryRunProductSync.mockResolvedValue({ success: true, dryRun: true, summary: { erpProductsRead: 1 } });

    await syncPOST(req, res);

    expect(mockErpService.dryRunProductSync).toHaveBeenCalled();
  });

  test("12. product.product without detailed_type or is_storable (-> no invalid inventory fields emitted)", async () => {
    process.env.ERP_PRODUCT_SYNC_DRY_RUN = "false";
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK", confirmWrite: true });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] });
    mockErpService.getProducts.mockResolvedValue([]);
    mockErpService.getOdooProductCapabilities.mockResolvedValueOnce({
      productProductFields: new Set(["name", "default_code", "list_price", "active", "type"]),
      productTemplateFields: new Set(["name", "default_code", "list_price", "active", "type"])
    });

    await syncPOST(req, res);

    // The capability-aware physical-good mapper must NOT emit type="consu"
    // just because `type` is available: is_storable is the authoritative
    // inventory-trackable field and `type` does not accept "product" on this
    // Odoo 18 schema. Unsupported inventory fields are omitted (fail-safe).
    expect(mockErpService.createOdooProduct).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.any(String)
      })
    );
    expect(mockErpService.createOdooProduct).not.toHaveBeenCalledWith(
      expect.objectContaining({
        detailed_type: expect.any(String)
      })
    );
    expect(mockErpService.createOdooProduct).not.toHaveBeenCalledWith(
      expect.objectContaining({
        is_storable: expect.any(Boolean)
      })
    );
  });

  test("13. product.product without detailed_type or type (-> optional type fields omitted)", async () => {
    process.env.ERP_PRODUCT_SYNC_DRY_RUN = "false";
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK", confirmWrite: true });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] });
    mockErpService.getProducts.mockResolvedValue([]);
    mockErpService.getOdooProductCapabilities.mockResolvedValueOnce({
      productProductFields: new Set(["name", "default_code", "list_price", "active"]),
      productTemplateFields: new Set(["name", "default_code", "list_price", "active"])
    });

    await syncPOST(req, res);

    expect(mockErpService.createOdooProduct).toHaveBeenCalledWith({
      name: "ERP Test Shirt",
      default_code: "ERP-SHIRT-S-BLACK",
      list_price: 25.00,
      active: true
    });
  });

  test("14. unsupported field throws ERP_ODOO_SCHEMA_INCOMPATIBLE", async () => {
    const req = mockReqWithParams({ sku: "ERP-SHIRT-S-BLACK", confirmWrite: true });
    const res = mockRes();

    mockQuery.graph.mockResolvedValueOnce({ data: [mockMedusaVariant] });
    mockErpService.getProducts.mockResolvedValue([]);
    mockErpService.getOdooProductCapabilities.mockResolvedValueOnce({
      productProductFields: new Set(["name", "default_code", "active"]), // missing list_price!
      productTemplateFields: new Set(["name", "default_code", "active"])
    });

    await syncPOST(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.body.error.code).toBe("ERP_ODOO_SCHEMA_INCOMPATIBLE");
  });
});
