import { describe, expect, it, vi } from 'vitest';

const apiClient = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('../services/apiClient', () => ({ default: apiClient }));

import { cartService, buildCartHydrationPayload } from '../services/medusa/cartService';
import { getDisplayPrice } from '../utils/pricing';
import { createLatestRequestGuard } from '../lib/medusa/requestGuard';

const USA_REGION = 'reg_01KXT623CTGM9NJJYK2G4DQW7E';
const CANADA_REGION = 'reg_01KVJF9HSCYKAZC677GH1AC6C8';

describe('regional product pricing', () => {
  it('formats major-unit CAD and USD calculated prices without conversion', () => {
    const cad = getDisplayPrice({ variants: [{ calculated_price: { calculated_amount: 4.99, currency_code: 'cad' } }] });
    const usd = getDisplayPrice({ variants: [{ calculated_price: { calculated_amount: 19.99, currency_code: 'usd' } }] });
    expect(cad.formatted).toContain('4.99');
    expect(usd.formatted).toContain('19.99');
  });

  it('does not invent a regional price when calculated_price is absent', () => {
    const unavailable = getDisplayPrice({ variants: [{ prices: [{ amount: 4.99, currency_code: 'cad' }] }] }, { currencyCode: 'usd' });
    expect(unavailable.hasPrice).toBe(false);
    expect(unavailable.formatted).toBe('Price unavailable in this region');
  });

  it('rejects a calculated price whose currency conflicts with the selected storefront currency', () => {
    const cad = getDisplayPrice({ variants: [{ calculated_price: { calculated_amount: 22, currency_code: 'cad' } }] }, { currencyCode: 'usd' });
    expect(cad.hasPrice).toBe(false);
    expect(cad.formatted).toBe('Price unavailable in this region');
  });
});

describe('region-scoped Medusa carts', () => {
  it('stores USA and Canada cart IDs under distinct keys', () => {
    expect(cartService.getCartStorageKey('b2c', USA_REGION)).toBe(`cart_id:${USA_REGION}`);
    expect(cartService.getCartStorageKey('b2c', CANADA_REGION)).toBe(`cart_id:${CANADA_REGION}`);
    expect(cartService.getCartStorageKey('b2c', USA_REGION)).not.toBe(cartService.getCartStorageKey('b2c', CANADA_REGION));
  });

  it('hydrates cart currency from the Medusa cart, not a UI fallback', () => {
    const result = buildCartHydrationPayload({ id: 'cart_ca', region_id: CANADA_REGION, currency_code: 'cad', items: [] });
    expect(result.regionId).toBe(CANADA_REGION);
    expect(result.currencyCode).toBe('cad');
  });

  it('hydrates cart line totals from Medusa major units without rescaling', () => {
    // Catalog/cart/order amounts are stored and returned in MAJOR units per the
    // project pricing contract (e.g. 22 CAD is stored as 22, not 2200).
    const result = buildCartHydrationPayload({
      id: 'cart_us', region_id: USA_REGION, currency_code: 'usd',
      items: [{ id: 'line_1', variant_id: 'variant_1', unit_price: 19.99, quantity: 2 }],
      subtotal: 39.98, total: 39.98, tax_total: 0, shipping_total: 0, discount_total: 0,
    });
    expect(result.items[0].price).toBe(19.99);
    expect(result.serverTotals.subtotal).toBe(39.98);
    expect(result.serverTotals.total).toBe(39.98);
  });
});

describe('regional listing request ordering', () => {
  it('rejects a slow Canada response after a newer USA request starts', () => {
    const guard = createLatestRequestGuard();
    const canadaRequest = guard.begin();
    const usaRequest = guard.begin();
    expect(guard.isCurrent(canadaRequest)).toBe(false);
    expect(guard.isCurrent(usaRequest)).toBe(true);
  });

  it('rejects a slow USA response after a newer Canada request starts', () => {
    const guard = createLatestRequestGuard();
    const usaRequest = guard.begin();
    const canadaRequest = guard.begin();
    expect(guard.isCurrent(usaRequest)).toBe(false);
    expect(guard.isCurrent(canadaRequest)).toBe(true);
  });
});
