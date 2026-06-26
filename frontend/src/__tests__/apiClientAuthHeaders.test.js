import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosMock = vi.hoisted(() => {
  const state = { requestHandler: null };
  const client = {
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn((success) => {
          state.requestHandler = success;
        }),
      },
      response: { use: vi.fn() },
    },
  };
  return { state, client, create: vi.fn(() => client), get: vi.fn() };
});

vi.mock('axios', () => ({
  default: {
    create: axiosMock.create,
    get: axiosMock.get,
  },
}));

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.window = { dispatchEvent: vi.fn() };
globalThis.CustomEvent = class CustomEvent {};

await import('../services/apiClient');

describe('API authentication header separation', () => {
  beforeEach(() => {
    storage.clear();
    storage.set('medusa_customer_token', 'customer-jwt');
    storage.set('vendor_token', 'vendor-jwt');
  });

  it('attaches the customer token to protected Store customer routes', () => {
    const config = axiosMock.state.requestHandler({
      url: '/store/customers',
      headers: { 'x-publishable-api-key': 'pk_test' },
    });
    expect(config.headers).toMatchObject({
      Authorization: 'Bearer customer-jwt',
      'x-publishable-api-key': 'pk_test',
    });
  });

  it('attaches only the vendor token to vendor routes', () => {
    const config = axiosMock.state.requestHandler({ url: '/vendor/me', headers: {} });
    expect(config.headers.Authorization).toBe('Bearer vendor-jwt');
  });

  it('does not attach a token to emailpass login or registration', () => {
    const config = axiosMock.state.requestHandler({
      url: '/auth/customer/emailpass/register',
      headers: {},
    });
    expect(config.headers.Authorization).toBeUndefined();
  });
});
