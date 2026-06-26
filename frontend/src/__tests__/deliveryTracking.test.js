import { describe, expect, it } from 'vitest';
import {
  fulfillmentProvider,
  fulfillmentTrackingUrl,
  fulfillmentTrackingNumbers,
  fulfillmentWarehouse,
  fulfillmentWarehouseAddress,
  orderTrackingSummary,
  getFulfillmentProgress,
} from '../utils/deliveryTracking';

describe('Medusa fulfillment tracking mapping', () => {
  it.each([
    ['not_fulfilled', 0, 'Order Confirmed'],
    ['partially_fulfilled', 1, 'Preparing Order'],
    ['shipped', 3, 'Shipped'],
    ['delivered', 5, 'Delivered'],
  ])('maps %s to the correct progress step', (fulfillmentStatus, step, label) => {
    expect(getFulfillmentProgress({ fulfillment_status: fulfillmentStatus })).toMatchObject({
      step,
      label,
      isDelivered: fulfillmentStatus === 'delivered',
    });
  });

  it('reads delivered fulfillment details directly from the Medusa payload', () => {
    const fulfillment = {
      provider_id: 'manual_manual',
      location: { name: 'Toronto Warehouse' },
      shipped_at: '2026-06-22T10:00:00.000Z',
      delivered_at: '2026-06-22T12:00:00.000Z',
      metadata: { tracking_number: 'CA-TRACK-100' },
    };

    expect(getFulfillmentProgress({ fulfillment_status: 'delivered' })).toMatchObject({
      step: 5,
      label: 'Delivered',
      isDelivered: true,
    });
    expect(fulfillmentWarehouse(fulfillment)).toBe('Toronto Warehouse');
    expect(fulfillmentProvider(fulfillment)).toBe('Organic Canada Delivery');
    expect(fulfillmentTrackingNumbers(fulfillment)).toEqual(['CA-TRACK-100']);
    expect(fulfillment.delivered_at).toBeTruthy();
  });

  it('does not expose raw stock location or provider ids to customers', () => {
    const fulfillment = {
      provider_id: 'manual_manual',
      location_id: 'sloc_01KVJF9HWWJ38MPAFDGH5YB0W1',
      tracking_url: 'https://carrier-link',
    };

    expect(fulfillmentWarehouse(fulfillment)).toBe('Canadian Warehouse');
    expect(fulfillmentWarehouseAddress(fulfillment)).toBe('Toronto, Ontario, Canada');
    expect(fulfillmentProvider(fulfillment)).toBe('Organic Canada Delivery');
    expect(fulfillmentTrackingUrl(fulfillment)).toBe('https://carrier-link');
  });

  it('builds a customer-safe tracking summary with pending tracking fallback', () => {
    const order = {
      fulfillments: [{
        provider_id: 'canada_post',
        location_id: 'sloc_123',
      }],
    };

    expect(orderTrackingSummary(order)).toMatchObject({
      warehouse: 'Canadian Warehouse',
      warehouseAddress: 'Toronto, Ontario, Canada',
      provider: 'Canada Post',
      trackingNumber: 'Tracking pending',
    });
  });
});
