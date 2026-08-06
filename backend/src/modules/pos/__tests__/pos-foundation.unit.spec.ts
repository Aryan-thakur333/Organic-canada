import fs from "fs"
import path from "path"
import { validatePayments } from "../../../utils/pos/payments"
import { integerMinor } from "../../../utils/pos/contracts"

const root = process.cwd()
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8")

describe("Phase 4 POS foundation", () => {
  it("accepts exact cash and calculates change", () => expect(validatePayments(500, [{ method: "CASH", amount_minor: 500, amount_tendered_minor: 700 }])[0].change_due_minor).toBe(200))
  it("rejects insufficient cash", () => expect(() => validatePayments(500, [{ method: "CASH", amount_minor: 500, amount_tendered_minor: 499 }])).toThrow("insufficient"))
  it("requires manual terminal references", () => expect(() => validatePayments(500, [{ method: "CARD_MANUAL", amount_minor: 500 }])).toThrow("terminal and authorization"))
  it("accepts confirmed manual card payment", () => expect(validatePayments(500, [{ method: "CARD_MANUAL", amount_minor: 500, terminal_reference: "T1", authorization_reference: "A1" }])).toHaveLength(1))
  it("accepts exact split payments", () => expect(validatePayments(500, [{ method: "CASH", amount_minor: 200, amount_tendered_minor: 200 }, { method: "CARD_MANUAL", amount_minor: 300, terminal_reference: "T1", authorization_reference: "A1" }])).toHaveLength(2))
  it("rejects split underpayment and overcapture", () => { expect(() => validatePayments(500, [{ method: "CASH", amount_minor: 499 }])).toThrow("must equal"); expect(() => validatePayments(500, [{ method: "CASH", amount_minor: 501 }])).toThrow("must equal") })
  it("does not claim Stripe Terminal is configured", () => expect(() => validatePayments(500, [{ method: "STRIPE_TERMINAL", amount_minor: 500 }])).toThrow("not configured"))
  it("enforces integer minor units", () => { expect(integerMinor(499, "amount")).toBe(499); expect(() => integerMinor(4.99, "amount")).toThrow("integer") })
  it("has unique open-session and checkout idempotency constraints", () => { const migration = read("src", "modules", "pos", "migrations", "Migration20260728010001.ts"); expect(migration).toContain("IDX_pos_one_open_session"); expect(migration).toContain("IDX_pos_transaction_idempotency") })
  it("makes the POS audit log append-only", () => { const migration = read("src", "modules", "pos", "migrations", "Migration20260728010001.ts"); expect(migration).toContain("POS audit events are append-only"); expect(migration).toContain("before update or delete") })
  it("protects all POS routes with Medusa user authentication", () => { const middleware = read("src", "api", "middlewares.ts"); expect(middleware).toContain('matcher: "/pos/*"'); expect(middleware).toContain('authenticate("user", ["session", "bearer"])') })
  it("removes insecure legacy store writes", () => { for (const route of ["quick-checkout", "orders", "payments/cash", "inventory-sync"]) expect(read("src", "api", "store", "pos", ...route.split("/"), "route.ts")).toContain("410") })
  it("uses exact register-scoped prices and inventory", () => { const catalog = read("src", "utils", "pos", "catalog.ts"); expect(catalog).toContain("entry.currency_code?.toLowerCase() === currency"); expect(catalog).toContain("level.location_id === register.stock_location_id"); expect(catalog).not.toContain("amount_minor: 0") })
  it("uses native Medusa cart, payment-provider, completion, capture, and fulfillment workflows", () => { const checkout = read("src", "api", "pos", "carts", "[id]", "checkout", "route.ts"); for (const workflow of ["createPaymentCollectionForCartWorkflow", "createPaymentSessionsWorkflow", "completeCartWorkflow", "capturePaymentWorkflow", "createOrderFulfillmentWorkflow"]) expect(checkout).toContain(workflow); const nativeCart = read("src", "utils", "pos", "native-cart.ts"); for (const workflow of ["createCartWorkflow", "updateCartPromotionsWorkflow", "refreshCartItemsWorkflow"]) expect(nativeCart).toContain(workflow) })
  it("ingests completed sales into OMS with POS metadata", () => { const checkout = read("src", "api", "pos", "carts", "[id]", "checkout", "route.ts"); expect(checkout).toContain("POS_ORDER_RECEIVED"); expect(checkout).toContain("pos_register_id"); expect(checkout).toContain("stock_location_id") })
  it("never uses compiler suppression in POS code", () => { const files = fs.readdirSync(path.join(root, "src", "utils", "pos")); for (const file of files) if (file.endsWith(".ts")) expect(read("src", "utils", "pos", file)).not.toMatch(/@ts-(ignore|nocheck)/) })
})
