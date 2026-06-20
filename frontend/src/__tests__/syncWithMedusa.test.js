import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncWithMedusa } from '../services/firebaseAuthService';

/* -------------------------------------------------------------------------- */
/*                          MOCK DEPENDENCIES                                 */
/* -------------------------------------------------------------------------- */

vi.mock('../services/apiClient', () => ({
  checkBackendHealth: vi.fn(),
}));

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

/* -------------------------------------------------------------------------- */
/*                              FIXTURES                                      */
/* -------------------------------------------------------------------------- */

const mockFirebaseUser = {
  email: 'test@gmail.com',
  uid: 'firebase-uid-abc123',
  displayName: 'Jane Doe',
  phoneNumber: '+12025551234',
};

function networkError(message = 'Network Error') {
  const err = new Error(message);
  err.code = 'ERR_NETWORK';
  err.response = undefined;
  return err;
}

function httpError(status, message = 'Request failed') {
  return {
    message,
    response: { status, data: { message } },
  };
}

/* ========================================================================== */
/*  syncWithMedusa                                                             */
/* ========================================================================== */

describe('syncWithMedusa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use fake timers so withRetry's setTimeout delays are instantaneous
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ---------- Health check failures ---------- */

  it('throws "Backend server is offline" when health check fails and never calls login', async () => {
    vi.mocked(checkBackendHealth).mockRejectedValue(
      new Error('Backend server is offline. Please start Medusa.')
    );

    await expect(syncWithMedusa(mockFirebaseUser)).rejects.toThrow(
      'Backend server is offline. Please start Medusa.'
    );
    expect(authService.login).not.toHaveBeenCalled();
    expect(authService.register).not.toHaveBeenCalled();
  });

  /* ---------- Happy path ---------- */

  it('returns the customer when login succeeds on the first attempt', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    vi.mocked(authService.login).mockResolvedValue({ token: 'jwt-abc' });
    vi.mocked(authService.getCurrentCustomer).mockResolvedValue({
      customer: { id: 'cust-1', email: 'test@gmail.com', first_name: 'Jane', last_name: 'Doe' },
    });

    const customer = await syncWithMedusa(mockFirebaseUser);

    expect(customer).toMatchObject({ id: 'cust-1', email: 'test@gmail.com' });
    expect(authService.login).toHaveBeenCalledTimes(1);
    expect(authService.login).toHaveBeenCalledWith('test@gmail.com', 'firebase-uid-abc123');
    expect(authService.register).not.toHaveBeenCalled();
  });

  /* ---------- Login succeeds on retry ---------- */

  it('retries login on transient network errors and succeeds', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    // withRetry has 3 attempts — fail first 2, succeed on 3rd
    vi.mocked(authService.login)
      .mockRejectedValueOnce(networkError('First login failed'))
      .mockRejectedValueOnce(networkError('Second login failed'))
      .mockResolvedValueOnce({ token: 'jwt-def' });
    vi.mocked(authService.getCurrentCustomer).mockResolvedValue({
      customer: { id: 'cust-2', email: 'test@gmail.com' },
    });

    const promise = syncWithMedusa(mockFirebaseUser);
    await vi.runAllTimersAsync();

    const customer = await promise;
    expect(customer).toMatchObject({ id: 'cust-2' });
    expect(authService.login).toHaveBeenCalledTimes(3);
    expect(authService.register).not.toHaveBeenCalled();
  });

  /* ---------- Login fails → register flow ---------- */

  it('falls through to register when login fails with 401, registers, then logs in again', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    // Login: 3 attempts, all 401 (user not found), then login again after register resolves
    vi.mocked(authService.login)
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockResolvedValue({ token: 'jwt-ghi' });

    vi.mocked(authService.register).mockResolvedValue({ customer: { id: 'cust-3' } });
    vi.mocked(authService.getCurrentCustomer).mockResolvedValue({
      customer: { id: 'cust-3', email: 'test@gmail.com' },
    });

    const promise = syncWithMedusa(mockFirebaseUser);
    await vi.runAllTimersAsync();

    const customer = await promise;
    expect(customer).toMatchObject({ id: 'cust-3' });
    // Login: 3 retries (all 401) + 1 after register = 4 total
    expect(authService.login).toHaveBeenCalledTimes(4);
    expect(authService.register).toHaveBeenCalledTimes(1);
    expect(authService.register).toHaveBeenCalledWith({
      email: 'test@gmail.com',
      password: 'firebase-uid-abc123',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+12025551234',
    });
  });

  /* ---------- Register retries ---------- */

  it('retries register on network errors and succeeds', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    // Login: 3 attempts, all 401 (user not found)
    vi.mocked(authService.login)
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockResolvedValue({ token: 'jwt-jkl' });

    // Register: 2 network errors, then success
    vi.mocked(authService.register)
      .mockRejectedValueOnce(networkError('Register attempt 1 failed'))
      .mockRejectedValueOnce(networkError('Register attempt 2 failed'))
      .mockResolvedValueOnce({ customer: { id: 'cust-4' } });

    vi.mocked(authService.getCurrentCustomer).mockResolvedValue({
      customer: { id: 'cust-4', email: 'test@gmail.com' },
    });

    const promise = syncWithMedusa(mockFirebaseUser);
    await vi.runAllTimersAsync();

    const customer = await promise;
    expect(customer).toMatchObject({ id: 'cust-4' });
    expect(authService.register).toHaveBeenCalledTimes(3);
    // Login: 3 initial (all 401) + 1 after register = 4 total
    expect(authService.login).toHaveBeenCalledTimes(4);
  });

  /* ---------- Register fails with non-retryable error ---------- */

  it('throws the API error message when register fails with a non-retryable error', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    // Login: 3 attempts, all 401
    vi.mocked(authService.login)
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'));

    // Register fails with 400 (non-retryable — email already exists)
    vi.mocked(authService.register)
      .mockRejectedValue(httpError(400, 'Email already exists'));

    const promise = syncWithMedusa(mockFirebaseUser);
    const rejection = promise.catch(e => e);
    await vi.runAllTimersAsync();

    const error = await rejection;
    expect(error.message).toContain('Email already exists');
    // 400 is non-retryable → withRetry calls register only once
    expect(authService.register).toHaveBeenCalledTimes(1);
  });

  /* ---------- Login exhausts retries, register also fails ---------- */

  it('throws the last register error when login and register both fail with network errors', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    // Login fails persistently with network error (all calls)
    vi.mocked(authService.login)
      .mockRejectedValue(networkError('connect ECONNREFUSED 127.0.0.1:9000'));

    // Register also fails persistently
    vi.mocked(authService.register)
      .mockRejectedValue(networkError('Backend unreachable'));

    const promise = syncWithMedusa(mockFirebaseUser);
    const rejection = promise.catch(e => e);
    await vi.runAllTimersAsync();

    // Flow: login 3x fails → register 3x fails → register catch throws new Error('Backend unreachable')
    const error = await rejection;
    expect(error.message).toContain('Backend unreachable');
    expect(authService.login).toHaveBeenCalledTimes(3);
    expect(authService.register).toHaveBeenCalledTimes(3);
  });

  /* ---------- Network drop during entire flow ---------- */

  it('throws the register error when login finds no user (401) and register drops with network error', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    // Login: 3 attempts, all 401 (user not found)
    vi.mocked(authService.login)
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockResolvedValue({ token: 'jwt-mno' });

    // Register fails persistently with network error (all calls)
    vi.mocked(authService.register)
      .mockRejectedValue(networkError('Backend unreachable after Google auth'));

    const promise = syncWithMedusa(mockFirebaseUser);
    const rejection = promise.catch(e => e);
    await vi.runAllTimersAsync();

    // Flow: login 3x 401 → register 3x network error → register catch throws 'Backend unreachable after Google auth'
    const error = await rejection;
    expect(error.message).toContain('Backend unreachable after Google auth');
    expect(authService.login).toHaveBeenCalledTimes(3);
    expect(authService.register).toHaveBeenCalledTimes(3);
  });

  /* ---------- Correct credentials passed ---------- */

  it('passes the correct Firebase bridge credentials to login and register', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    // Login: 3 attempts, all 401, then resolves after register
    vi.mocked(authService.login)
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockResolvedValue({ token: 'jwt-mno' });

    vi.mocked(authService.register).mockResolvedValue({ customer: { id: 'cust-5' } });
    vi.mocked(authService.getCurrentCustomer).mockResolvedValue({
      customer: { id: 'cust-5', email: 'test@gmail.com' },
    });

    const promise = syncWithMedusa(mockFirebaseUser);
    await vi.runAllTimersAsync();
    await promise;

    // First 3 login calls use bridge credentials
    expect(authService.login).toHaveBeenNthCalledWith(1, 'test@gmail.com', 'firebase-uid-abc123');
    // Register uses bridge credentials
    expect(authService.register).toHaveBeenCalledWith({
      email: 'test@gmail.com',
      password: 'firebase-uid-abc123',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+12025551234',
    });
    // Login after register also uses bridge credentials
    expect(authService.login).toHaveBeenNthCalledWith(4, 'test@gmail.com', 'firebase-uid-abc123');
  });
});
