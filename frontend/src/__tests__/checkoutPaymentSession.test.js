import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({ default: apiClient }));
vi.mock('../config/publicEnv', () => ({ getDefaultCountryCode: () => 'ca' }));

import {
  findReusablePaymentSession,
  initiatePaymentSessionForProvider,
} from '../services/medusa/checkoutService';

const stripeProviderId = 'pp_stripe_stripe';
const validStripeSession = {
  id: 'payses_valid',
  provider_id: stripeProviderId,
  status: 'pending',
  data: { client_secret: 'pi_secret_valid' },
};
const cart = {
  id: 'cart_payment_test',
  region_id: 'reg_ca',
  currency_code: 'cad',
  total: 2500,
  email: 'customer@example.com',
  shipping_address: { id: 'caaddr_1' },
  shipping_methods: [{ id: 'casm_1' }],
  payment_collection: {
    id: 'paycol_test',
    amount: 2500,
    currency_code: 'cad',
    payment_sessions: [],
  },
};

describe('Stripe payment-session lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reuses only a valid Stripe session containing a client secret', () => {
    expect(findReusablePaymentSession({ payment_sessions: [validStripeSession] }, stripeProviderId))
      .toEqual(validStripeSession);
    expect(findReusablePaymentSession({
      payment_sessions: [{ ...validStripeSession, data: {} }],
    }, stripeProviderId)).toBeNull();
  });

  it('deduplicates simultaneous session creation requests', async () => {
    let resolveRequest;
    apiClient.post.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = initiatePaymentSessionForProvider(cart, stripeProviderId);
    const second = initiatePaymentSessionForProvider(cart, stripeProviderId);
    expect(apiClient.post).toHaveBeenCalledTimes(1);

    const response = {
      payment_collection: {
        ...cart.payment_collection,
        payment_sessions: [validStripeSession],
      },
    };
    resolveRequest(response);
    await expect(Promise.all([first, second])).resolves.toEqual([response, response]);
  });

  it('recovers a valid session after a failed creation request', async () => {
    apiClient.post.mockRejectedValue(Object.assign(new Error('backend failed'), {
      response: { status: 500, data: { message: 'Stripe failure' } },
    }));
    apiClient.get.mockResolvedValue({
      cart: {
        ...cart,
        payment_collection: {
          ...cart.payment_collection,
          payment_sessions: [validStripeSession],
        },
      },
    });

    await expect(initiatePaymentSessionForProvider(cart, stripeProviderId)).resolves.toMatchObject({
      payment_collection: { payment_sessions: [validStripeSession] },
    });
  });

  it('preserves the backend error when recovery finds no valid session', async () => {
    const backendError = Object.assign(new Error('invalid Stripe key'), {
      response: { status: 500, data: { message: 'invalid Stripe key' } },
    });
    apiClient.post.mockRejectedValue(backendError);
    apiClient.get.mockResolvedValue({ cart });

    await expect(initiatePaymentSessionForProvider(cart, stripeProviderId)).rejects.toBe(backendError);
  });
});
