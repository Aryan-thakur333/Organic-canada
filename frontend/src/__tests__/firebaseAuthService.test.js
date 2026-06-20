import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../services/firebaseAuthService';

/* -------------------------------------------------------------------------- */
/*                              FIXTURES                                      */
/* -------------------------------------------------------------------------- */

/**
 * Create an axios-like network error object (no server response).
 */
function networkError(message = 'Network Error') {
  const err = new Error(message);
  err.code = 'ERR_NETWORK';
  err.response = undefined;
  return err;
}

/**
 * Create an axios-like HTTP error with a given status.
 */
function httpError(status, message = 'Request failed') {
  return {
    message,
    response: { status, data: { message } },
  };
}

/* ========================================================================== */
/*  withRetry                                                                  */
/* ========================================================================== */

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result on the first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelay: 100, maxDelay: 500 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to maxAttempts on persistent network errors', async () => {
    const fn = vi.fn().mockRejectedValue(networkError());

    // Attach .catch() immediately to prevent unhandled rejection detection
    const promise = withRetry(fn, { maxAttempts: 3, baseDelay: 100, maxDelay: 500 });
    const rejection = promise.catch(e => e);
    await vi.advanceTimersByTimeAsync(5000);

    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Network Error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('succeeds on the second attempt after a transient network error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError('First attempt failed'))
      .mockResolvedValueOnce('recovered');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelay: 100, maxDelay: 500 });
    await vi.advanceTimersByTimeAsync(5000);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a non-retryable 500 error', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(500, 'Internal Server Error'));

    const promise = withRetry(fn, { maxAttempts: 3, baseDelay: 100, maxDelay: 500 });
    const rejection = promise.catch(e => e);
    await vi.advanceTimersByTimeAsync(1000);

    const error = await rejection;
    expect(error.message).toBe('Internal Server Error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry on a non-retryable 400 error', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(400, 'Bad Request'));

    const promise = withRetry(fn, { maxAttempts: 3, baseDelay: 100, maxDelay: 500 });
    const rejection = promise.catch(e => e);
    await vi.advanceTimersByTimeAsync(1000);

    const error = await rejection;
    expect(error.message).toBe('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 401 (retryable)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockRejectedValueOnce(httpError(401, 'Unauthorized'))
      .mockResolvedValueOnce('authenticated');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelay: 100, maxDelay: 500 });
    await vi.advanceTimersByTimeAsync(5000);

    const result = await promise;
    expect(result).toBe('authenticated');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on error with no response object (connection refused)', async () => {
    const err = new Error('connect ECONNREFUSED ::1:9000');
    err.code = undefined;
    err.response = undefined;

    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('connected');

    const promise = withRetry(fn, { maxAttempts: 3, baseDelay: 100, maxDelay: 500 });
    await vi.advanceTimersByTimeAsync(5000);

    const result = await promise;
    expect(result).toBe('connected');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
