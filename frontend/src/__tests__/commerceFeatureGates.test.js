import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const read = (...segments) => fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');

describe('commerce feature rollout gates', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults every feature to disabled', async () => {
    // The gates must be OFF whenever the VITE_FEATURE_* variables are not
    // explicitly "true". A static import would read the developer's ambient
    // .env (which may enable features during rollout), so stub the environment
    // to guarantee the default-off contract regardless of the local .env.
    vi.stubEnv('VITE_FEATURE_SUBSCRIPTIONS', '');
    vi.stubEnv('VITE_FEATURE_PERSONALIZED_PRODUCTS', '');
    vi.stubEnv('VITE_FEATURE_BUNDLED_PRODUCTS', '');
    vi.resetModules();
    const { commerceFeatures } = await import('../config/commerceFeatures');
    expect(commerceFeatures).toEqual({ subscriptions: false, personalizedProducts: false, bundledProducts: false });
  });

  it('hides subscription and personalization product options behind flags', () => {
    const source = read('src', 'pages', 'ProductDetails.jsx');
    expect(source).toContain('commerceFeatures.subscriptions');
    expect(source).toContain('commerceFeatures.personalizedProducts');
    expect(source).toContain('/subscription-options');
  });

  it('uses explicit server eligibility instead of product-title inference', () => {
    const source = read('src', 'pages', 'ProductDetails.jsx');
    expect(source).toContain('subscriptionConfig?.enabled === true');
    expect(source).not.toContain('title.includes("subscription")');
  });

  it('rejects mixed recurring and one-time carts before provider checkout', () => {
    const source = read('src', 'pages', 'Checkout.jsx');
    expect(source).toContain('hasMixedSubscriptionCart');
    expect(source).toContain('Subscription checkout cannot be mixed with one-time items.');
  });

  it('reuses a cart-scoped subscription idempotency key', () => {
    const source = read('src', 'pages', 'Checkout.jsx');
    expect(source).toContain('subscription_idempotency_${medusaCartId}');
    expect(source).toContain('idempotency_key: idempotencyKey');
  });

  it('does not complete the Medusa one-time cart after starting Stripe Billing checkout', () => {
    const source = read('src', 'pages', 'Checkout.jsx');
    const start = source.indexOf('if (isSubscriptionCart)');
    const end = source.indexOf("if (paymentMethod === 'stripe')", start);
    const recurringBranch = source.slice(start, end);
    expect(recurringBranch).toContain('window.location.assign');
    expect(recurringBranch).not.toContain('completeCart(');
  });
});

