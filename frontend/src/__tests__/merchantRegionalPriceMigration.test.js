import { describe, expect, it } from 'vitest';

import { getDisplayPrice } from '../utils/pricing';

describe('merchant-approved regional price outcomes', () => {
  it('renders an explicit approved USD calculated price as a major-unit amount', () => {
    const price = getDisplayPrice({
      variants: [{ calculated_price: { calculated_amount: 15, currency_code: 'usd' } }],
    });

    expect(price.amount).toBe(15);
    expect(price.currencyCode).toBe('USD');
    expect(price.formatted).toContain('15.00');
  });

  it('keeps a CAD-only variant unavailable in USA instead of using the CAD record', () => {
    const price = getDisplayPrice({
      variants: [{ prices: [{ amount: 2200, currency_code: 'cad' }] }],
    }, { currencyCode: 'usd' });

    expect(price.hasPrice).toBe(false);
    expect(price.amount).toBeNull();
    expect(price.formatted).toBe('Price unavailable in this region');
  });

  it('does not scale an explicit CAD calculated amount', () => {
    const price = getDisplayPrice({
      variants: [{ calculated_price: { calculated_amount: 2500, currency_code: 'cad' } }],
    });

    expect(price.amount).toBe(2500);
    expect(price.formatted.replace(/,/g, '')).toContain('2500.00');
  });
});
