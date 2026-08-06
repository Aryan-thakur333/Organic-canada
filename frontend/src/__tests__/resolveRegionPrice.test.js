import { describe, expect, it } from 'vitest';
import { resolveRegionPrice } from '../utils/resolve-region-price';
import { REGION_SLUG_CONFIG } from '../lib/medusa/regionSlugs';

describe('resolveRegionPrice', () => {
  it('uses the configured regional identifiers', () => {
    expect(REGION_SLUG_CONFIG.canada.expectedRegionId).toBe('reg_01KVJF9HSCYKAZC677GH1AC6C8');
    expect(REGION_SLUG_CONFIG.usa.expectedRegionId).toBe('reg_01KXT623CTGM9NJJYK2G4DQW7E');
  });

  it('keeps decimal calculated USD values in major units', () => {
    expect(resolveRegionPrice({ calculated_price: { calculated_amount: 16.99, currency_code: 'usd' } }, { currencyCode: 'usd' }))
      .toMatchObject({ available: true, amount: 16.99, currencyCode: 'usd', source: 'calculated_price' });
  });

  it('rejects a calculated CAD value for USA instead of falling back', () => {
    expect(resolveRegionPrice({ calculated_price: { calculated_amount: 22, currency_code: 'cad' } }, { currencyCode: 'usd' }))
      .toMatchObject({ available: false, reason: 'currency_mismatch' });
  });

  it('selects only an explicit matching variant price', () => {
    const variant = { prices: [{ amount: 22, currency_code: 'cad' }, { amount: 16.99, currency_code: 'usd' }] };
    expect(resolveRegionPrice(variant, { currencyCode: 'usd' })).toMatchObject({ available: true, amount: 16.99, source: 'variant_price' });
    expect(resolveRegionPrice(variant, { currencyCode: 'cad' })).toMatchObject({ available: true, amount: 22, source: 'variant_price' });
  });

  it('reports a missing USD price as unavailable', () => {
    expect(resolveRegionPrice({ prices: [{ amount: 22, currency_code: 'cad' }] }, { currencyCode: 'usd' }))
      .toMatchObject({ available: false, reason: 'missing_usd_price' });
  });

  it('rejects malformed and conflicting matching prices', () => {
    expect(resolveRegionPrice({ prices: [{ amount: 3, currency_code: 'usd' }, { amount: 4, currency_code: 'usd' }] }, { currencyCode: 'usd' }))
      .toMatchObject({ available: false, reason: 'malformed_price' });
  });
});
