const enabled = (value) => String(value || '').trim().toLowerCase() === 'true';

export const commerceFeatures = Object.freeze({
  subscriptions: enabled(import.meta.env.VITE_FEATURE_SUBSCRIPTIONS),
  personalizedProducts: enabled(import.meta.env.VITE_FEATURE_PERSONALIZED_PRODUCTS),
  bundledProducts: enabled(import.meta.env.VITE_FEATURE_BUNDLED_PRODUCTS),
});

