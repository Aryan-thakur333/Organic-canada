import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPosOfflineDrafts, POS_OFFLINE_STORAGE_KEY, savePosOfflineDraft, validateAndUploadPosOfflineDraft } from "./posOfflineDrafts";

const draftInput = () => ({
  client_uuid: "client-1", idempotency_key: "idem-1", register_id: "reg-1", session_id: "session-1",
  operator_id: "operator-1", region_id: "region-1", currency_code: "usd",
  items: [{ product_id: "prod-1", variant_id: "variant-1", quantity: 1, unit_price: 1899, inventory: 4 }],
});

describe("POS offline drafts", () => {
  beforeEach(() => localStorage.removeItem(POS_OFFLINE_STORAGE_KEY));

  it("stores only draft identity, products, last-known price/inventory, and no payment data", () => {
    savePosOfflineDraft({ ...draftInput(), payments: [{ method: "CASH", amount_tendered_minor: 2000 }] });
    const stored = listPosOfflineDrafts()[0];
    expect(stored.items[0]).toMatchObject({ last_known_price_minor: 1899, last_known_inventory: 4 });
    expect(JSON.stringify(stored)).not.toContain("amount_tendered");
    expect(stored.sync_status).toBe("LOCAL_ONLY");
  });

  it("creates and preserves a local-only cart while offline", () => {
    const stored = savePosOfflineDraft(draftInput());
    expect(stored.sync_status).toBe("LOCAL_ONLY");
    expect(listPosOfflineDrafts()).toHaveLength(1);
  });

  it("uses the client UUID/idempotency key and requires confirmation after a price change", async () => {
    const draft = savePosOfflineDraft(draftInput());
    const api = {
      getSession: vi.fn().mockResolvedValue({ session: { id: "session-1" } }),
      searchProducts: vi.fn().mockResolvedValue({ products: [{ variant_id: "variant-1", allow_backorder: false, price: { amount_minor: 2099 } }] }),
      inventory: vi.fn().mockResolvedValue({ available_quantity: 3 }),
      createCart: vi.fn().mockResolvedValue({ cart: { id: "server-draft-1" } }),
      updateCart: vi.fn().mockResolvedValue({}),
    };
    const result = await validateAndUploadPosOfflineDraft(draft, api);
    expect(api.createCart).toHaveBeenCalledWith(expect.objectContaining({ client_uuid: "client-1", idempotency_key: "idem-1" }));
    expect(result.sync_status).toBe("AWAITING_OPERATOR_CONFIRMATION");
    expect(result.price_changes).toHaveLength(1);
  });

  it("requires operator confirmation when inventory changed even if stock remains sufficient", async () => {
    const draft = savePosOfflineDraft(draftInput());
    const api = {
      getSession: vi.fn().mockResolvedValue({ session: { id: "session-1" } }),
      searchProducts: vi.fn().mockResolvedValue({ products: [{ variant_id: "variant-1", allow_backorder: false, price: { amount_minor: 1899 } }] }),
      inventory: vi.fn().mockResolvedValue({ available_quantity: 3 }),
      createCart: vi.fn().mockResolvedValue({ cart: { id: "server-draft-1", status: "LOCAL_DRAFT" }, reused: false }),
      updateCart: vi.fn().mockResolvedValue({}),
    };
    const result = await validateAndUploadPosOfflineDraft(draft, api);
    expect(result.sync_status).toBe("AWAITING_OPERATOR_CONFIRMATION");
    expect(result.inventory_changes).toEqual([{ variant_id: "variant-1", previous_available_quantity: 4, current_available_quantity: 3 }]);
  });

  it("rejects stale inventory before creating a server checkout", async () => {
    const draft = savePosOfflineDraft(draftInput());
    const api = {
      getSession: vi.fn().mockResolvedValue({ session: { id: "session-1" } }),
      searchProducts: vi.fn().mockResolvedValue({ products: [{ variant_id: "variant-1", allow_backorder: false, price: { amount_minor: 1899 } }] }),
      inventory: vi.fn().mockResolvedValue({ available_quantity: 0 }),
      createCart: vi.fn(), updateCart: vi.fn(),
    };
    await expect(validateAndUploadPosOfflineDraft(draft, api)).rejects.toThrow("sufficient register inventory");
    expect(api.createCart).not.toHaveBeenCalled();
  });

  it("rejects a draft from an expired register session before loading products", async () => {
    const draft = savePosOfflineDraft(draftInput());
    const api = { getSession: vi.fn().mockResolvedValue({ session: { id: "session-2" } }), searchProducts: vi.fn() };
    await expect(validateAndUploadPosOfflineDraft(draft, api)).rejects.toThrow("expired register session");
    expect(api.searchProducts).not.toHaveBeenCalled();
  });

  it("reuses the same client UUID and idempotency key after reconnect", async () => {
    const draft = savePosOfflineDraft({ ...draftInput(), sync_status: "UNKNOWN_RESPONSE" });
    const api = {
      getSession: vi.fn().mockResolvedValue({ session: { id: "session-1" } }),
      searchProducts: vi.fn().mockResolvedValue({ products: [{ variant_id: "variant-1", allow_backorder: false, price: { amount_minor: 1899 } }] }),
      inventory: vi.fn().mockResolvedValue({ available_quantity: 4 }),
      createCart: vi.fn().mockResolvedValue({ cart: { id: "server-draft-1", status: "LOCAL_DRAFT" }, reused: true }),
      updateCart: vi.fn().mockResolvedValue({}),
    };
    await validateAndUploadPosOfflineDraft(draft, api);
    expect(api.createCart).toHaveBeenCalledWith({ register_id: "reg-1", client_uuid: "client-1", idempotency_key: "idem-1" });
  });

  it("recognizes a successful server order after an unknown response without resubmitting", async () => {
    const draft = savePosOfflineDraft({ ...draftInput(), sync_status: "UNKNOWN_RESPONSE" });
    const api = {
      getSession: vi.fn().mockResolvedValue({ session: { id: "session-1" } }),
      searchProducts: vi.fn().mockResolvedValue({ products: [{ variant_id: "variant-1", allow_backorder: false, price: { amount_minor: 1899 } }] }),
      inventory: vi.fn().mockResolvedValue({ available_quantity: 4 }),
      createCart: vi.fn().mockResolvedValue({ cart: { id: "server-draft-1", status: "SYNCED" }, reused: true }),
      updateCart: vi.fn(),
    };
    const result = await validateAndUploadPosOfflineDraft(draft, api);
    expect(result.sync_status).toBe("SYNCED");
    expect(api.updateCart).not.toHaveBeenCalled();
  });

  it("retains a deterministic draft across a simulated backend restart", async () => {
    const draft = savePosOfflineDraft(draftInput());
    const api = {
      getSession: vi.fn().mockResolvedValue({ session: { id: "session-1" } }),
      searchProducts: vi.fn().mockResolvedValue({ products: [{ variant_id: "variant-1", allow_backorder: false, price: { amount_minor: 1899 } }] }),
      inventory: vi.fn().mockResolvedValue({ available_quantity: 4 }),
      createCart: vi.fn().mockResolvedValue({ cart: { id: "persisted-after-restart", status: "LOCAL_DRAFT" }, reused: true }),
      updateCart: vi.fn().mockResolvedValue({}),
    };
    const result = await validateAndUploadPosOfflineDraft(draft, api);
    expect(result.server_draft_id).toBe("persisted-after-restart");
    expect(result.sync_status).toBe("VALIDATED_ONLINE");
  });

  it("deduplicates repeated local saves by client UUID", () => {
    savePosOfflineDraft(draftInput());
    savePosOfflineDraft({ ...draftInput(), sync_status: "UNKNOWN_RESPONSE" });
    expect(listPosOfflineDrafts()).toHaveLength(1);
    expect(listPosOfflineDrafts()[0].sync_status).toBe("UNKNOWN_RESPONSE");
  });
});
