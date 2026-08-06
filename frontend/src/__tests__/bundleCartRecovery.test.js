import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

describe('bundle cart recovery contract', () => {
  it('rebuilds fixed bundles through the bundle endpoint instead of copying component lines', () => {
    const source = read('src', 'services', 'medusa', 'checkoutService.js');
    expect(source).toContain('commerce_type !== "FIXED_BUNDLE_COMPONENT"')
    expect(source).toContain('/bundled-line-items`')
    expect(source).toContain('bundle_id: group.bundleId')
  });

  it('shows rebuild rather than retry finalization for stale bundle carts', () => {
    const source = read('src', 'pages', 'Checkout.jsx');
    expect(source).toContain("code === 'BUNDLE_CART_REBUILD_REQUIRED'")
    expect(source).toContain('Rebuild Bundle Cart')
    expect(source).toContain('bundleRebuildRequired ? (')
  });
});
