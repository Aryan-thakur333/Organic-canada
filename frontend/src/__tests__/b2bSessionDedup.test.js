import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Shared reference object for tracking API calls ───────────────────────────
// Using an object ref ensures closures capture the reference, not a let binding.
const apiTracker = { customerMeCalls: 0, companyCalls: 0 };

// ── Mock data (inline values, works in hoisted vi.mock factories) ────────────

const CUSTOMER_RESPONSE = {
  customer: {
    id: "cus_01ABCD",
    email: "buyer@company.com",
    first_name: "Jane",
    last_name: "Buyer",
    company: {
      id: "comp_01XYZ",
      company_name: "Acme Wholesale Inc.",
      status: "approved",
    },
  },
};

const COMPANY_RESPONSE = {
  company: {
    id: "comp_01XYZ",
    company_name: "Acme Wholesale Inc.",
    status: "approved",
    credit_limit: 500000,
    email: "buyer@company.com",
  },
};

// ── Mocks (only at the top level — hoisted by Vitest) ────────────────────────
// The mock factories create vi.fn() instances that close over the apiTracker ref.
// After vi.resetModules(), the factories run again, but apiTracker persists.

vi.mock("../services/apiClient", () => ({
  default: {
    get: vi.fn((url, config) => {
      if (url === "/store/customers/me") {
        apiTracker.customerMeCalls++;
        // Return UNWRAPPED data (matching apiClient response interceptor)
        return Promise.resolve(CUSTOMER_RESPONSE);
      }
      if (url === "/store/b2b/company") {
        apiTracker.companyCalls++;
        return Promise.resolve(COMPANY_RESPONSE);
      }
      return Promise.resolve({});
    }),
    post: vi.fn(() => Promise.resolve({})),
    patch: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
    interceptors: {
      request: { use: vi.fn(() => 0) },
      response: { use: vi.fn(() => 0) },
    },
  },
}));

vi.mock("../services/medusa/tokenStorage", () => ({
  getCustomerToken: vi.fn(() => "mock-customer-jwt-token"),
  setCustomerToken: vi.fn(),
  clearCustomerToken: vi.fn(),
  VENDOR_TOKEN_KEY: "vendor_token",
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("B2B session hydration + AuthSync dedup", () => {
  beforeEach(() => {
    // Reset module-level state (pendingCustomerRequest, b2bSessionCache, etc.)
    vi.resetModules();
    // Reset our tracking counters
    apiTracker.customerMeCalls = 0;
    apiTracker.companyCalls = 0;
  });

  afterEach(() => {
    // Clear spy call counts without affecting vi.mock factory registrations
    vi.clearAllMocks();
  });

  // ── Test 1: Concurrent calls share one HTTP request ─────────────────

  it("deduplicates /store/customers/me when AuthSync and hydrateB2BSession run concurrently", async () => {
    const { authService } = await import("../services/medusa/authService");
    const { b2bApi } = await import("../services/b2bApi");

    // Fire both concurrently — simulates AuthSync + B2B component mount
    const [customerResult, sessionResult] = await Promise.all([
      authService.getCurrentCustomer(),
      b2bApi.hydrateB2BSession({ forceRefresh: true }),
    ]);

    // Only 1 HTTP request to /store/customers/me should have been made
    // because authService.getCurrentCustomer() has in-flight dedup
    expect(apiTracker.customerMeCalls).toBe(1);
    expect(customerResult).toBeDefined();
    expect(sessionResult).toBeDefined();
    expect(sessionResult).toHaveProperty("customer");
  });

  // ── Test 2: Sequential calls within cache window ────────────────────

  it("serves the second call from authService's 30s cache", async () => {
    const { authService } = await import("../services/medusa/authService");

    // First call — makes HTTP request
    await authService.getCurrentCustomer();
    expect(apiTracker.customerMeCalls).toBe(1);

    // Second call — should hit the 30s cache
    await authService.getCurrentCustomer();
    expect(apiTracker.customerMeCalls).toBe(1);
  });

  // ── Test 3: hydrateB2BSession returns correct session shape ─────────

  it("returns a correctly shaped session from hydrateB2BSession", async () => {
    const { b2bApi } = await import("../services/b2bApi");

    const session = await b2bApi.hydrateB2BSession({ forceRefresh: true });

    expect(session).toHaveProperty("customer");
    expect(session).toHaveProperty("company");
    expect(session).toHaveProperty("hasCompany", true);
    expect(session).toHaveProperty("hasApprovedB2BAccess", true);
    expect(session).toHaveProperty("status", "approved");

    // Customer should be unwrapped (the normalized customer object)
    expect(session.customer).toHaveProperty("id", "cus_01ABCD");
    expect(session.customer).toHaveProperty("email", "buyer@company.com");

    // Company should be the merged company
    expect(session.company).toHaveProperty("id", "comp_01XYZ");
    expect(session.company).toHaveProperty("company_name", "Acme Wholesale Inc.");

    // Only 1 /store/customers/me call
    expect(apiTracker.customerMeCalls).toBe(1);
    expect(apiTracker.companyCalls).toBe(1);
  });

  // ── Test 4: hydrateB2BSession calls getCompany after customer ───────

  it("calls /store/b2b/company after getting the customer", async () => {
    const { default: apiClient } = await import("../services/apiClient");
    const { b2bApi } = await import("../services/b2bApi");

    await b2bApi.hydrateB2BSession({ forceRefresh: true });

    // Check the apiClient.get was called via the spy
    const getMock = vi.mocked(apiClient.get);
    const customerMeCalls = getMock.mock.calls.filter(
      ([url]) => url === "/store/customers/me"
    );
    const companyCalls = getMock.mock.calls.filter(
      ([url]) => url === "/store/b2b/company"
    );

    // b2bApi doesn't call /store/customers/me directly — it goes through
    // authService. But authService DOES call it internally. Since we track
    // via apiTracker, verify the tracker was incremented.
    expect(apiTracker.customerMeCalls).toBe(1);
    expect(apiTracker.companyCalls).toBe(1);

    // Verify the company call had __skipRetry
    expect(companyCalls[0][1]).toHaveProperty("__skipRetry", true);
  });

  // ── Test 5: Signal forwarding ──────────────────────────────────────

  it("forwards abort signal from hydrateB2BSession to authService.getCurrentCustomer and apiClient", async () => {
    const { default: apiClient } = await import("../services/apiClient");
    const { b2bApi } = await import("../services/b2bApi");

    // Create an AbortController to pass through
    const controller = new AbortController();

    // Fire hydrateB2BSession with the signal.
    // The IIFE inside hydrateB2BSession runs synchronously up to the first
    // await, so apiClient.get('/store/customers/me') is called immediately
    // (spy invoked) even before we await sessionPromise.
    const sessionPromise = b2bApi.hydrateB2BSession({
      forceRefresh: true,
      signal: controller.signal,
    });

    const getMock = vi.mocked(apiClient.get);

    // The /store/customers/me call happens synchronously within the IIFE
    const customerMeCall = getMock.mock.calls.find(
      ([url]) => url === "/store/customers/me"
    );
    expect(customerMeCall).toBeDefined();
    expect(customerMeCall[1]).toHaveProperty("signal");
    expect(customerMeCall[1].signal).toBe(controller.signal);

    // Await the session to let /store/b2b/company be called
    const session = await sessionPromise;
    expect(session).toBeDefined();

    // Now the company call should have been made
    const companyCall = getMock.mock.calls.find(
      ([url]) => url === "/store/b2b/company"
    );
    expect(companyCall).toBeDefined();
    expect(companyCall[1]).toHaveProperty("signal");
    expect(companyCall[1].signal).toBe(controller.signal);

    // Only 1 /store/customers/me call
    expect(apiTracker.customerMeCalls).toBe(1);
  });

  // ── Test 6: Abort cancels the session promise ───────────────────────

  it("aborts hydrateB2BSession when signal is aborted", async () => {
    const { b2bApi } = await import("../services/b2bApi");

    // Create an AbortController and immediately abort it
    const controller = new AbortController();
    controller.abort();

    // hydrateB2BSession should reject with an AbortError
    await expect(
      b2bApi.hydrateB2BSession({
        forceRefresh: true,
        signal: controller.signal,
      })
    ).rejects.toThrow(/aborted/i);

    // No API calls should have been made (signal was pre-aborted)
    expect(apiTracker.customerMeCalls).toBe(0);
    expect(apiTracker.companyCalls).toBe(0);
  });

  // ── Test 7: cache bypass on clearCompanyCache ───────────────────────

  it("increments company call count on clearCompanyCache + re-fetch", async () => {
    const { b2bApi } = await import("../services/b2bApi");
    const { default: apiClient } = await import("../services/apiClient");

    // Verify spy counts start clean
    const getMock = vi.mocked(apiClient.get);

    // First call — should make 1 company API call
    const session1 = await b2bApi.hydrateB2BSession({ forceRefresh: true });
    expect(session1).toBeDefined();

    const companyCalls1 = getMock.mock.calls.filter(
      ([url]) => url === "/store/b2b/company"
    );
    expect(companyCalls1.length).toBe(1);
    expect(apiTracker.customerMeCalls).toBe(1);

    // Clear B2B caches
    b2bApi.clearCompanyCache();

    // Second call — should make another company API call
    const session2 = await b2bApi.hydrateB2BSession({ forceRefresh: true });
    expect(session2).toBeDefined();

    // customer/me should still be 1 (authService's 30s cache)
    expect(apiTracker.customerMeCalls).toBe(1);

    // /store/b2b/company should have been called exactly twice total
    const companyCalls2 = getMock.mock.calls.filter(
      ([url]) => url === "/store/b2b/company"
    );
    expect(companyCalls2.length).toBe(2);

    // apiTracker agrees
    expect(apiTracker.companyCalls).toBe(2);
  });
});
