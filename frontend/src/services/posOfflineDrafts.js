const STORAGE_KEY = "eatsie_pos_offline_drafts_v1";

const read = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
};

const write = (drafts) => localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));

export const listPosOfflineDrafts = () => read();

export function savePosOfflineDraft(input) {
  if (!input.client_uuid || !input.idempotency_key || !input.register_id || !input.session_id || !input.operator_id || !input.region_id || !input.currency_code) {
    throw new Error("Offline POS draft identity is incomplete");
  }
  const draft = {
    client_uuid: input.client_uuid,
    idempotency_key: input.idempotency_key,
    register_id: input.register_id,
    session_id: input.session_id,
    operator_id: input.operator_id,
    region_id: input.region_id,
    currency_code: input.currency_code,
    items: (input.items || []).map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      last_known_price_minor: item.last_known_price_minor ?? item.unit_price,
      last_known_inventory: item.last_known_inventory ?? item.inventory,
    })),
    created_at: input.created_at || new Date().toISOString(),
    sync_status: input.sync_status || "LOCAL_ONLY",
    server_draft_id: input.server_draft_id,
    price_changes: input.price_changes || [],
    inventory_changes: input.inventory_changes || [],
  };
  const drafts = read().filter((entry) => entry.client_uuid !== draft.client_uuid);
  drafts.push(draft);
  write(drafts);
  return draft;
}

export function removePosOfflineDraft(clientUuid) {
  write(read().filter((draft) => draft.client_uuid !== clientUuid));
}

export async function validateAndUploadPosOfflineDraft(draft, posApi) {
  if (typeof posApi.getSession === "function") {
    const sessionResponse = await posApi.getSession(draft.register_id);
    if (!sessionResponse?.session || sessionResponse.session.id !== draft.session_id) {
      throw new Error("Offline draft belongs to an expired register session");
    }
  }
  const productsResponse = await posApi.searchProducts("", draft.register_id, { limit: 100 });
  const currentProducts = productsResponse.products || [];
  const priceChanges = [];
  const inventoryChanges = [];
  const items = [];
  for (const item of draft.items) {
    const current = currentProducts.find((product) => product.variant_id === item.variant_id);
    if (!current) throw new Error(`Variant ${item.variant_id} is no longer available at this register`);
    const inventoryResponse = await posApi.inventory(item.variant_id, draft.register_id);
    if (!current.allow_backorder && Number(inventoryResponse.available_quantity) < Number(item.quantity)) {
      throw new Error(`Variant ${item.variant_id} no longer has sufficient register inventory`);
    }
    if (Number(current.price.amount_minor) !== Number(item.last_known_price_minor)) {
      priceChanges.push({ variant_id: item.variant_id, previous_price_minor: item.last_known_price_minor, current_price_minor: current.price.amount_minor });
    }
    if (Number(inventoryResponse.available_quantity) !== Number(item.last_known_inventory)) {
      inventoryChanges.push({ variant_id: item.variant_id, previous_available_quantity: item.last_known_inventory, current_available_quantity: inventoryResponse.available_quantity });
    }
    items.push({ variant_id: item.variant_id, quantity: item.quantity, last_known_price_minor: current.price.amount_minor, last_known_inventory: inventoryResponse.available_quantity });
  }
  const { cart, reused } = await posApi.createCart({ register_id: draft.register_id, client_uuid: draft.client_uuid, idempotency_key: draft.idempotency_key });
  if (reused && cart.status === "SYNCED") {
    const synced = { ...draft, server_draft_id: cart.id, sync_status: "SYNCED", price_changes: [], inventory_changes: [] };
    savePosOfflineDraft(synced);
    return synced;
  }
  await posApi.updateCart(cart.id, { items, fulfillment_type: "IMMEDIATE_CARRYOUT" });
  const requiresConfirmation = priceChanges.length > 0 || inventoryChanges.length > 0;
  const updated = { ...draft, server_draft_id: cart.id, sync_status: requiresConfirmation ? "AWAITING_OPERATOR_CONFIRMATION" : "VALIDATED_ONLINE", price_changes: priceChanges, inventory_changes: inventoryChanges };
  savePosOfflineDraft(updated);
  return updated;
}

export { STORAGE_KEY as POS_OFFLINE_STORAGE_KEY };
