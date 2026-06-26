import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncWithMedusa } from '../services/firebaseAuthService';

vi.mock('../services/apiClient', () => ({ checkBackendHealth: vi.fn() }));
vi.mock('../services/medusa/authService', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    getCurrentCustomer: vi.fn(),
    logout: vi.fn(),
  },
}));

import { checkBackendHealth } from '../services/apiClient';
import { authService } from '../services/medusa/authService';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

const user = {
  email: 'test@example.com',
  uid: 'firebase-uid',
  displayName: 'Jane Doe',
  phoneNumber: null,
  getIdToken: vi.fn().mockResolvedValue('verified-firebase-id-token'),
};

describe('syncWithMedusa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.clear();
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    vi.mocked(authService.login).mockImplementation(async () => {
      storage.set('medusa_customer_token', 'medusa-jwt');
      return { token: 'medusa-jwt' };
    });
    vi.mocked(authService.getCurrentCustomer).mockResolvedValue({ customer: { id: 'cus_1' } });
  });

  it('fails fast when the backend is offline', async () => {
    vi.mocked(checkBackendHealth).mockRejectedValue(new Error('offline'));
    await expect(syncWithMedusa(user)).rejects.toThrow('Backend server is offline');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('exchanges a Firebase ID token and returns an existing customer', async () => {
    await expect(syncWithMedusa(user)).resolves.toEqual({ id: 'cus_1' });
    expect(authService.login).toHaveBeenCalledWith('test@example.com', 'firebase-uid');
    expect(storage.get('medusa_customer_token')).toBe('medusa-jwt');
  });

  it('creates the Medusa customer profile only for a new Firebase identity', async () => {
    vi.mocked(authService.login).mockRejectedValue({ response: { status: 401 } });
    vi.mocked(authService.register).mockImplementation(async () => {
      storage.set('medusa_customer_token', 'registered-token');
      return { token: 'registered-token', customer: { id: 'cus_new' } };
    });
    vi.mocked(authService.getCurrentCustomer).mockResolvedValue({ customer: { id: 'cus_new' } });
    await expect(syncWithMedusa(user)).resolves.toEqual({ id: 'cus_new' });
    expect(authService.register).toHaveBeenCalledWith(expect.objectContaining({
      email: 'test@example.com', password: 'firebase-uid', first_name: 'Jane', last_name: 'Doe',
    }));
  });

  it('coalesces duplicate Firebase sync requests', async () => {
    let release;
    vi.mocked(authService.getCurrentCustomer).mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const first = syncWithMedusa(user);
    const second = syncWithMedusa(user);
    release({ customer: { id: 'cus_1' } });
    await expect(Promise.all([first, second])).resolves.toEqual([{ id: 'cus_1' }, { id: 'cus_1' }]);
    expect(authService.login).toHaveBeenCalledTimes(1);
  });

  it('clears a rejected customer session and does not retry profile lookup', async () => {
    vi.mocked(authService.getCurrentCustomer).mockRejectedValue({ response: { status: 401 } });
    await expect(syncWithMedusa(user)).rejects.toThrow('Medusa customer session was rejected');
    expect(authService.getCurrentCustomer).toHaveBeenCalledTimes(1);
    expect(storage.get('medusa_customer_token')).toBeUndefined();
  });
});
