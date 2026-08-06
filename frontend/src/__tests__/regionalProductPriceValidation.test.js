import { describe, expect, it } from 'vitest';

import { getDisplayPrice } from '../utils/pricing';

function productWithCalculatedPrice(amount, currencyCode) {
  return {
    variants: [{
      calculated_price: {
        calculated_amount: amount,
        currency_code: currencyCode,
      },
    }],
  };
}

describe('regional product price validation', () => {
  it.each([
    [4.99, 'cad', '4.99'],
    [10, 'cad', '10.00'],
    [22, 'cad', '22.00'],
    [499, 'cad', '499.00'],
    [2200, 'cad', '2,200.00'],
    [3.99, 'usd', '3.99'],
    [15, 'usd', '15.00'],
    [19.99, 'usd', '19.99'],
    [2499, 'usd', '2,499.00'],
  ])('keeps %s %s as a literal major-unit storefront amount', (amount, currencyCode, display) => {
    const price = getDisplayPrice(productWithCalculatedPrice(amount, currencyCode));

    expect(price.hasPrice).toBe(true);
    expect(price.amount).toBe(amount);
    expect(price.currencyCode).toBe(currencyCode.toUpperCase());
    expect(price.formatted.replace(/,/g, '')).toContain(display.replace(/,/g, ''));
  });

  it.each(['cad', 'usd'])('treats zero %s as unavailable for purchasing', (currencyCode) => {
    const price = getDisplayPrice(productWithCalculatedPrice(0, currencyCode));
    expect(price.hasPrice).toBe(false);
    expect(price.amount).toBeNull();
  });

  it.each([null, undefined, NaN, Infinity, -1])(
    'renders an invalid calculated amount (%s) as unavailable',
    (amount) => {
      const price = getDisplayPrice(productWithCalculatedPrice(amount, 'usd'));

      expect(price.hasPrice).toBe(false);
      expect(price.amount).toBeNull();
      expect(price.formatted).toBe('Price unavailable in this region');
    }
  );

  it('does not use a raw CAD price as a USD fallback', () => {
    const price = getDisplayPrice({
      variants: [{ prices: [{ amount: 499, currency_code: 'cad' }] }],
    }, { currencyCode: 'usd' });

    expect(price.hasPrice).toBe(false);
    expect(price.formatted).toBe('Price unavailable in this region');
  });
});
