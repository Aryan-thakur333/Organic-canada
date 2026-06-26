import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('../services/apiClient', () => ({ default: apiClient }));

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

import { authService } from '../services/medusa/authService';

describe('Medusa customer token enforcement', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it('never posts a customer profile without a customer bearer token', async () => {
    await expect(authService.createCustomerProfile({ email: 'new@example.com' }))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('stores the registration token before creating the customer profile', async () => {
    apiClient.post.mockImplementation(async (url) => {
      if (url === '/auth/customer/emailpass/register') return { token: 'customer-jwt' };
      if (url === '/auth/customer/emailpass') return { token: 'customer-login-jwt' };
      if (url === '/store/customers') {
        expect(storage.get('medusa_customer_token')).toBe('customer-jwt');
        return { customer: { id: 'cus_new', email: 'new@example.com' } };
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    await expect(authService.register({
      email: 'new@example.com',
      password: 'firebase-uid',
      first_name: 'New',
      last_name: 'Customer',
    })).resolves.toMatchObject({
      token: 'customer-login-jwt',
      customer: { id: 'cus_new' },
    });
  });
});
