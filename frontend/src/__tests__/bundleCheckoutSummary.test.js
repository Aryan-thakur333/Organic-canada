import { describe, expect, it } from 'vitest';
import { groupCheckoutSummaryItems } from '../lib/medusa/bundle-display';

describe('bundle checkout summary', () => {
  it('shows one bundle total and aggregates internal component allocation rows', () => {
    const summary = groupCheckoutSummaryItems([
      { id: 'a', variantId: 'apple', title: 'Organic Apples', quantity: 1, price: 0, metadata: { commerce_type: 'FIXED_BUNDLE_COMPONENT', bundle_group_id: 'group_1', bundle_title: 'Organic Starter Bundle', bundle_quantity: 1 } },
      { id: 'b', variantId: 'apple', title: 'Organic Apples', quantity: 1, price: 7.33, metadata: { commerce_type: 'FIXED_BUNDLE_COMPONENT', bundle_group_id: 'group_1', bundle_title: 'Organic Starter Bundle', bundle_quantity: 1 } },
      { id: 'c', variantId: 'honey', title: 'Organic Honey', quantity: 1, price: 7.33, metadata: { commerce_type: 'FIXED_BUNDLE_COMPONENT', bundle_group_id: 'group_1', bundle_title: 'Organic Starter Bundle', bundle_quantity: 1 } },
      { id: 'd', variantId: 'berries', title: 'Red Strawberries', quantity: 2, price: 3.665, metadata: { commerce_type: 'FIXED_BUNDLE_COMPONENT', bundle_group_id: 'group_1', bundle_title: 'Organic Starter Bundle', bundle_quantity: 1 } },
    ]);

    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ kind: 'bundle', title: 'Organic Starter Bundle' });
    expect(summary[0].total).toBeCloseTo(21.99, 2);
    expect(summary[0].components).toEqual([
      { title: 'Organic Apples', quantity: 2 },
      { title: 'Organic Honey', quantity: 1 },
      { title: 'Red Strawberries', quantity: 2 },
    ]);
  });
});
