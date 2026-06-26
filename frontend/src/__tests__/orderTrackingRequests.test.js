import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const get = vi.fn();
  const request = vi.fn();
  return {
    get,
    request,
    client: {
      get,
      request,
      post: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  };
});

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mocks.client),
    get: vi.fn(),
  },
}));

globalThis.window = {
  dispatchEvent: vi.fn(),
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options?.detail;
  }
};
globalThis.localStorage = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};

import { fetchCustomerOrderById } from '../services/apiClient';

describe('order tracking request lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates concurrent StrictMode-style requests and caches the result', async () => {
    let resolveRequest;
    mocks.get.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = fetchCustomerOrderById('order_strict_mode');
    const second = fetchCustomerOrderById('order_strict_mode');
    expect(mocks.get).toHaveBeenCalledTimes(1);

    const response = { order: { id: 'order_strict_mode', status: 'pending' } };
    resolveRequest(response);
    await expect(Promise.all([first, second])).resolves.toEqual([response, response]);

    await expect(fetchCustomerOrderById('order_strict_mode')).resolves.toEqual(response);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('allows an unmounted consumer to abort without cancelling the shared request', async () => {
    let resolveRequest;
    mocks.get.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const controller = new AbortController();

    const unmountedConsumer = fetchCustomerOrderById('order_abort', {
      signal: controller.signal,
    });
    const mountedConsumer = fetchCustomerOrderById('order_abort');
    controller.abort();

    await expect(unmountedConsumer).rejects.toMatchObject({ name: 'AbortError' });
    const response = { order: { id: 'order_abort', status: 'pending' } };
    resolveRequest(response);
    await expect(mountedConsumer).resolves.toEqual(response);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});
