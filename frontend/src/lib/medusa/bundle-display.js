/**
 * Bundle component line prices are internal allocation data. Aggregate them
 * for customer summaries while keeping the cart's total untouched.
 */
export function groupCheckoutSummaryItems(items = []) {
  const groups = new Map();
  const standalone = [];

  for (const item of items) {
    const metadata = item?.metadata || {};
    const groupId = metadata.bundle_group_id;
    if (metadata.commerce_type !== "FIXED_BUNDLE_COMPONENT" || !groupId) {
      standalone.push({ kind: "item", item });
      continue;
    }

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        kind: "bundle",
        id: groupId,
        title: metadata.bundle_title || "Fixed Bundle",
        quantity: Number(metadata.bundle_quantity || 1),
        total: 0,
        components: new Map(),
      });
    }
    const group = groups.get(groupId);
    const componentKey = item.variantId || item.variant_id || metadata.component_sku || item.title;
    const existing = group.components.get(componentKey);
    if (existing) existing.quantity += Number(item.quantity || 0);
    else group.components.set(componentKey, { title: item.title || "Component", quantity: Number(item.quantity || 0) });
    group.total += Number(item.price || 0) * Number(item.quantity || 0);
  }

  return [
    ...Array.from(groups.values()).map((group) => ({
      ...group,
      components: Array.from(group.components.values()),
    })),
    ...standalone,
  ];
}
