/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Medusa Store API base (e.g. https://api.example.com). In dev, leave unset to use same-origin + Vite proxy. */
  readonly VITE_MEDUSA_BACKEND_URL?: string;
  /** @deprecated Use VITE_MEDUSA_BACKEND_URL */
  readonly VITE_API_BASE_URL?: string;
  /** Medusa publishable API key (safe in browser). Required for catalog/cart/checkout. */
  readonly VITE_MEDUSA_PUBLISHABLE_KEY?: string;
  /** @deprecated Alias for VITE_MEDUSA_PUBLISHABLE_KEY */
  readonly VITE_PUBLISHABLE_KEY?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  /** Default Medusa region id for prices (optional if only one region exists). */
  readonly VITE_MEDUSA_REGION_ID?: string;
  readonly VITE_CHECKOUT_API_BASE?: string;
  /** Public Medusa URL for resolving `/static/...` image paths when not using same-origin proxy. */
  readonly VITE_MEDUSA_PUBLIC_URL?: string;
  /** Same value as payment-server `ADMIN_API_KEY` (dev only). */
  readonly VITE_ADMIN_API_KEY?: string;
  /** ISO country code for guest checkout when the address form does not collect country (default dk). */
  readonly VITE_STORE_DEFAULT_COUNTRY_CODE?: string;
  /** Optional: Medusa admin JWT for `/admin/*` calls — do not ship real secrets in public bundles. */
  readonly VITE_MEDUSA_ADMIN_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
