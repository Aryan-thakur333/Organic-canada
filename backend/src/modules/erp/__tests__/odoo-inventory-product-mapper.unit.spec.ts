import {
  buildOdooInventoryProductFields,
  buildOdooServiceProductFields,
  buildOdooConsumableProductFields,
  classifyOdooProduct,
  isOdooProductInventoryTrackable,
} from "../mappers/odoo-inventory-product.mapper"

import type { OdooProductCapabilities } from "../types"

const mockCapabilities: OdooProductCapabilities = {
  productProductFields: new Set([
    "type",
    "is_storable",
    "active",
    "list_price",
    "default_code",
    "name",
  ]),
  productTemplateFields: new Set([
    "type",
    "is_storable",
    "active",
    "list_price",
    "default_code",
    "name",
  ]),
}

describe("Odoo Inventory Product Mapper", () => {
  describe("classifyOdooProduct", () => {
    test("physical product -> physical", () => {
      expect(classifyOdooProduct({ isPhysical: true })).toBe("physical")
    })

    test("physical product with inventory managed -> physical", () => {
      expect(classifyOdooProduct({ isPhysical: true, isInventoryManaged: true })).toBe("physical")
    })

    test("service -> service", () => {
      expect(classifyOdooProduct({ isService: true })).toBe("service")
    })

    test("physical but not inventory managed -> consumable", () => {
      expect(classifyOdooProduct({ isPhysical: true, isInventoryManaged: false })).toBe("consumable")
    })

    test("no flags -> consumable", () => {
      expect(classifyOdooProduct({})).toBe("consumable")
    })
  })

  describe("buildOdooInventoryProductFields", () => {
    test("physical product -> is_storable=true, no type override", () => {
      const fields = buildOdooInventoryProductFields(mockCapabilities)
      expect(fields.is_storable).toBe(true)
      expect(fields.type).toBeUndefined()
    })

    test("does not emit unsupported fields", () => {
      const limitedCapabilities: OdooProductCapabilities = {
        productProductFields: new Set(["name", "active"]),
        productTemplateFields: new Set(["name", "active"]),
      }
      const fields = buildOdooInventoryProductFields(limitedCapabilities)
      expect(Object.keys(fields).length).toBe(0)
    })
  })

  describe("buildOdooServiceProductFields", () => {
    test("service -> type=service, is_storable=false", () => {
      const fields = buildOdooServiceProductFields(mockCapabilities)
      expect(fields.type).toBe("service")
      expect(fields.is_storable).toBe(false)
    })
  })

  describe("buildOdooConsumableProductFields", () => {
    test("consumable -> type=consu, is_storable=false", () => {
      const fields = buildOdooConsumableProductFields(mockCapabilities)
      expect(fields.type).toBe("consu")
      expect(fields.is_storable).toBe(false)
    })
  })

  describe("isOdooProductInventoryTrackable", () => {
    test("is_storable=true -> trackable", () => {
      expect(isOdooProductInventoryTrackable({ is_storable: true })).toBe(true)
    })

    test("is_storable=false -> not trackable", () => {
      expect(isOdooProductInventoryTrackable({ is_storable: false })).toBe(false)
    })

    test("is_storable undefined -> not trackable", () => {
      expect(isOdooProductInventoryTrackable({})).toBe(false)
    })
  })
})