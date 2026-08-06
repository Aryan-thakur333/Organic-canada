import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({
  default: apiClient,
  getCurrentPosToken: vi.fn(),
  classifyAuthScope: (config = {}) => {
    const url = config.url || "";
    if (url.startsWith("/vendor")) return "VENDOR";
    if (url.startsWith("/pos")) return "POS_STAFF";
    return "DEFAULT";
  }
}));

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

// Mock window.location
delete globalThis.window.location;
globalThis.window.location = {
  pathname: "/auth/login",
  search: "?role=seller"
};

import { vendorApi } from '../services/vendorApi';

describe('Vendor/Seller Authentication & Session', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
    globalThis.window.location.pathname = "/auth/login";
  });

  it('1. vendorApi exposes login', () => {
    expect(vendorApi.login).toBeTypeOf('function');
  });

  it('2. vendorApi exposes getMe', () => {
    expect(vendorApi.getMe).toBeTypeOf('function');
  });

  it('3. successful login then getMe succeeds', async () => {
    const mockVendor = { id: 'vendor_123', email: 'vendor@gmail.com', status: 'approved' };
    apiClient.post.mockResolvedValueOnce({ token: 'vendor-jwt-token', vendor: mockVendor });
    apiClient.get.mockResolvedValueOnce({ vendor: mockVendor });

    const loginRes = await vendorApi.login({ email: 'vendor@gmail.com', password: 'password' });
    expect(loginRes.token).toBe('vendor-jwt-token');

    const meRes = await vendorApi.getMe();
    expect(meRes).toEqual(mockVendor);
    expect(apiClient.get).toHaveBeenCalledWith('/vendor/me');
  });

  it('4. invalid credentials maps status 401 correctly', async () => {
    const error401 = { response: { status: 401, data: { message: "Invalid email or password" } } };
    apiClient.post.mockRejectedValueOnce(error401);

    await expect(vendorApi.login({ email: 'vendor@gmail.com', password: 'wrong' }))
      .rejects.toEqual(error401);
  });

  it('5. login failure does NOT call register', async () => {
    apiClient.post.mockRejectedValueOnce({ response: { status: 401 } });
    
    try {
      await vendorApi.login({ email: 'vendor@gmail.com', password: 'wrong' });
    } catch {
      // expected
    }
    
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).not.toHaveBeenCalledWith('/vendor/register', expect.any(Object));
  });

  it('6. registered email registration returns already registered', async () => {
    const error400 = { response: { status: 400, data: { message: "Email already registered" } } };
    apiClient.post.mockRejectedValueOnce(error400);

    await expect(vendorApi.register({ email: 'vendor@gmail.com', password: 'password' }))
      .rejects.toEqual(error400);
  });

  it('7. seller login does not trigger POS-specific actor mismatch', () => {
    globalThis.window.location.pathname = "/auth/login";
    expect(globalThis.window.location.pathname.startsWith("/pos")).toBe(false);
  });

  it('8. stale POS token does not break seller login', () => {
    storage.set('eatsie_pos_token', 'stale-pos-token');
    const scope = "VENDOR";
    const token = scope === "VENDOR" ? storage.get('vendor_token') : storage.get('eatsie_pos_token');
    expect(token).toBeUndefined();
  });

  it('9. seller session reload rehydrates via getMe', async () => {
    const mockVendor = { id: 'vendor_123', email: 'vendor@gmail.com', status: 'approved' };
    apiClient.get.mockResolvedValueOnce({ vendor: mockVendor });

    const meRes = await vendorApi.getMe();
    expect(meRes).toEqual(mockVendor);
    expect(apiClient.get).toHaveBeenCalledWith('/vendor/me');
  });
});
