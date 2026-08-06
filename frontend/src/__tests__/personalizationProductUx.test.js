import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { normalizeProductList } from '../lib/medusa/normalize';
import { buildStorefrontListingPipeline } from '../utils/storefront-listing-pipeline';

const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');

describe('personalization product storefront UX', () => {
  it('fetches one product-detail template without requiring personalized product metadata', () => {
    const source = read('src', 'pages', 'ProductDetails.jsx');
    expect(source).toContain('/personalization`');
    expect(source).not.toContain("product?.metadata?.product_type === 'personalized'");
    expect(source).toContain('Boolean(personalizationTemplate)');
  });

  it('renders the dynamic form, server quote, optional normal purchase, and upload UX', () => {
    const source = read('src', 'pages', 'ProductDetails.jsx');
    expect(source).toContain('Personalize Your Product');
    expect(source).toContain("apiClient.post('/store/personalizations/quote'");
    expect(source).toContain('response?.quote || response?.data?.quote');
    expect(source).toContain('response?.upload_id || response?.data?.upload_id');
    expect(source).toContain('allow_normal_purchase');
    expect(source).toContain('onDragOver');
    expect(source).toContain('image/jpeg,image/png,image/webp');
    expect(source).toContain('uploadProgress');
    expect(source).toContain('Remove / replace');
  });

  it('shows labels and hides internal upload IDs in the cart', () => {
    const cart = read('src', 'pages', 'Cart.jsx');
    const cartHook = read('src', 'hooks', 'useMedusaCart.js');
    expect(cart).toContain('personalization_labels');
    expect(cart).toContain("startsWith('past_') ? 'Uploaded'");
    expect(cart).toContain('Base ');
    expect(cart).toContain('Final ');
    expect(cartHook).toContain('res?.cart || res?.data?.cart');
  });

  it('keeps a personalized physical product with a valid USA price in the normal listing pipeline', () => {
    const product = {
      id: 'prod_personalized',
      title: 'Cheddar Cheese',
      handle: 'cheddar-cheese',
      metadata: {},
      variants: [{
        id: 'variant_personalized',
        manage_inventory: true,
        inventory_quantity: 1000,
        calculated_price: { calculated_amount: 599, currency_code: 'usd' },
      }],
    };
    const result = buildStorefrontListingPipeline([product], {
      region: { id: 'reg_usa', currency_code: 'usd' },
      pageSize: 24,
    });
    expect(result.counts.rawApiCount).toBe(1);
    expect(result.counts.publicVisibilityCount).toBe(1);
    expect(result.counts.activeRegionPriceAvailableCount).toBe(1);
    expect(result.products.map((item) => item.id)).toEqual(['prod_personalized']);
  });

  it('preserves both production personalized products through normalization and USA visibility', () => {
    const rawProducts = [
      {
        id: 'prod_01KVSFB87RKDRSY8HR988M0Z9K',
        title: 'Cheddar Cheese',
        handle: 'cheddar-cheese',
        metadata: {},
        variants: [{ id: 'variant_01KVSFB88CG0FGKBQTG2KNBZE8', manage_inventory: true, inventory_quantity: 1000, calculated_price: { calculated_amount: 599, currency_code: 'usd' } }],
      },
      {
        id: 'prod_01KVSFB8GJWSH1JMXG0XPG2F6N',
        title: 'Croissant',
        handle: 'croissant',
        metadata: {},
        variants: [{ id: 'variant_01KVSFB8HDHXQHA4PKSS9PQ89A', manage_inventory: true, inventory_quantity: 1000, calculated_price: { calculated_amount: 299, currency_code: 'usd' } }],
      },
    ];
    const normalized = normalizeProductList(rawProducts, 'reg_usa');
    const result = buildStorefrontListingPipeline(normalized, {
      region: { id: 'reg_usa', currency_code: 'usd' },
      pageSize: 24,
    });

    expect(normalized.map((product) => product.id)).toEqual(rawProducts.map((product) => product.id));
    expect(result.products.map((product) => product.id)).toEqual(rawProducts.map((product) => product.id));
    expect(result.analyzed.every(({ state }) => state.priceAvailable)).toBe(true);
  });

  it('reloads personalization whenever the selected variant changes', () => {
    const source = read('src', 'pages', 'ProductDetails.jsx');
    expect(source).toContain('params: { variant_id: selectedVariantId || undefined }');
    expect(source).toContain('signal: controller.signal');
    expect(source).toContain('}, [product, selectedVariantId]);');
    expect(source).toContain('setPersonalizationTemplate(null)');
    expect(source).toContain('setPersonalizationQuote(null)');
    expect(source).toContain('setPriceAdjustment(0)');
    expect(source).toContain('if (personalizationLoading) return "Loading options...";');
  });

  it('blocks a silent normal-purchase fallback when template resolution is ambiguous', () => {
    const source = read('src', 'pages', 'ProductDetails.jsx');
    expect(source).toContain("code === 'PERSONALIZATION_TEMPLATE_AMBIGUOUS'");
    expect(source).toContain('Boolean(personalizationResolutionError)');
    expect(source).toContain('role="alert"');
    expect(source).toContain('Personalization unavailable');
  });

  it('renders every supported customer field shape consistently with Admin preview', () => {
    const source = read('src', 'pages', 'ProductDetails.jsx');
    expect(source).toContain('field.field_type === "radio"');
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('minLength={field.min_length ?? undefined}');
    expect(source).toContain('maxLength={field.max_length ?? undefined}');
    expect(source).toContain('min={field.min_value ?? undefined}');
    expect(source).toContain('max={field.max_value ?? undefined}');
  });
});
