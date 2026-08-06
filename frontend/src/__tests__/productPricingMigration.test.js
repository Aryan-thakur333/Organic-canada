import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClient = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({
  default: apiClient,
  isRequestCanceled: (error) =>
    error?.name === 'AbortError' ||
    error?.name === 'CanceledError' ||
    error?.code === 'ERR_CANCELED' ||
    String(error?.message || '').toLowerCase().includes('aborted'),
}));

vi.mock('../lib/medusa/regions', () => ({
  resolveDefaultRegionId: vi.fn(async () => 'reg_ca'),
}));

vi.mock('../services/medusa/tokenStorage', () => ({
  getCustomerToken: () => null,
}));

vi.mock('../config/publicEnv', () => ({
  getMedusaPublishableKey: vi.fn(() => 'pk_test_env'),
}));

import { buildProductCacheKey, listStoreProducts } from '../services/medusa/productService';
import { getMedusaPublishableKey } from '../config/publicEnv';
import { getDisplayPrice } from '../utils/pricing';

function installLocalStorage() {
  const store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key) => store.get(key) || null),
    setItem: vi.fn((key, value) => store.set(key, String(value))),
    removeItem: vi.fn((key) => store.delete(key)),
    key: vi.fn((index) => Array.from(store.keys())[index] || null),
    get length() {
      return store.size;
    },
  });
}

describe('Medusa product list contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorage();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns a normalized successful response', async () => {
    apiClient.get.mockResolvedValue({
      products: [{ id: 'prod_1', variants: [] }],
      count: 1,
      offset: 0,
      limit: 25,
    });

    await expect(listStoreProducts({ limit: 25, region_id: 'reg_ca' })).resolves.toMatchObject({
      products: [{ id: 'prod_1' }],
      count: 1,
      offset: 0,
      limit: 25,
    });
  });

  it('keys catalog fallback cache by region and country context', () => {
    const usa = buildProductCacheKey({ region_id: 'reg_us', country_code: 'us' });
    const canada = buildProductCacheKey({ region_id: 'reg_ca', country_code: 'ca' });
    expect(usa).not.toBe(canada);
    expect(usa).toContain('reg_us');
    expect(usa).toContain('us');
  });

  it('throws a safe configuration error when the publishable key is missing', async () => {
    getMedusaPublishableKey.mockReturnValueOnce('');

    await expect(listStoreProducts({ region_id: 'reg_ca' })).rejects.toThrow(
      'Storefront configuration is incomplete: publishable API key is missing.'
    );
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('fetches more than one product page and deduplicates product IDs', async () => {
    apiClient.get
      .mockResolvedValueOnce({
        products: [{ id: 'prod_1', variants: [] }, { id: 'prod_2', variants: [] }],
        count: 3,
        offset: 0,
        limit: 2,
      })
      .mockResolvedValueOnce({
        products: [{ id: 'prod_2', variants: [] }, { id: 'prod_3', variants: [] }],
        count: 3,
        offset: 2,
        limit: 2,
      });

    await expect(listStoreProducts({
      fetch_all_pages: true,
      limit: 2,
      region_id: 'reg_ca',
      country_code: 'ca',
    })).resolves.toMatchObject({
      products: [{ id: 'prod_1' }, { id: 'prod_2' }, { id: 'prod_3' }],
      count: 3,
      offset: 0,
    });

    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(apiClient.get.mock.calls[0][1].params).toMatchObject({
      region_id: 'reg_ca',
      country_code: 'ca',
      limit: 100,
      offset: 0,
    });
    expect(apiClient.get.mock.calls[1][1].params).toMatchObject({
      limit: 100,
      offset: 2,
    });
  });

  it('stops paged product loading at the reported count', async () => {
    apiClient.get.mockResolvedValueOnce({
      products: [{ id: 'prod_1', variants: [] }, { id: 'prod_2', variants: [] }],
      count: 2,
      offset: 0,
      limit: 2,
    });

    await listStoreProducts({ fetch_all_pages: true, region_id: 'reg_ca' });

    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('stops paged product loading on an empty page', async () => {
    apiClient.get.mockResolvedValueOnce({
      products: [],
      count: 10,
      offset: 0,
      limit: 100,
    });

    await expect(listStoreProducts({ fetch_all_pages: true, region_id: 'reg_ca' })).resolves.toMatchObject({
      products: [],
      count: 10,
    });
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('accepts an empty products array', async () => {
    apiClient.get.mockResolvedValue({ products: [] });

    await expect(listStoreProducts({ limit: 25, region_id: 'reg_ca' })).resolves.toMatchObject({
      products: [],
      count: 0,
      offset: 0,
      limit: 25,
    });
  });

  it('throws a meaningful error for undefined responses', async () => {
    apiClient.get.mockResolvedValue(undefined);

    await expect(listStoreProducts({ region_id: 'reg_ca' })).rejects.toThrow(
      'Invalid Medusa product-list response'
    );
  });

  it('throws network errors instead of returning undefined', async () => {
    apiClient.get.mockRejectedValue(new Error('network failed'));

    await expect(listStoreProducts({ region_id: 'reg_ca', force_refresh: true })).rejects.toThrow('network failed');
  });

  it('rethrows aborts so Listing can ignore them deliberately', async () => {
    const abortError = Object.assign(new Error('Request aborted'), { name: 'AbortError' });
    apiClient.get.mockRejectedValue(abortError);

    await expect(listStoreProducts({ region_id: 'reg_ca' })).rejects.toBe(abortError);
  });
});

describe('Medusa v2 major-unit product display prices', () => {
  it('formats 22 CAD as 22.00, not 0.22', () => {
    const price = getDisplayPrice({
      variants: [{ calculated_price: { calculated_amount: 22, currency_code: 'cad' } }],
    });

    expect(price.formatted).toContain('22.00');
    expect(price.formatted).not.toContain('0.22');
  });

  it('formats 2200 CAD as 2,200.00 until the database is corrected', () => {
    const price = getDisplayPrice({
      variants: [{ calculated_price: { calculated_amount: 2200, currency_code: 'cad' } }],
    });

    expect(price.formatted).toMatch(/2,200\.00|2200\.00/);
  });

  it('uses the calculated price currency code', () => {
    const usd = getDisplayPrice({
      variants: [{ calculated_price: { calculated_amount: 15, currency_code: 'usd' } }],
    });
    const cad = getDisplayPrice({
      variants: [{ calculated_price: { calculated_amount: 10, currency_code: 'cad' } }],
    });

    expect(usd.currencyCode).toBe('USD');
    expect(cad.currencyCode).toBe('CAD');
  });

  it('returns an unavailable state when calculated_price is missing', () => {
    const price = getDisplayPrice({ variants: [{ id: 'variant_1' }] });

    expect(price.hasPrice).toBe(false);
    expect(price.formatted).toBe('Price unavailable in this region');
  });
});
