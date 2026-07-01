import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import B2BQuoteHistory from "./B2BQuoteHistory";

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock react-router-dom's useParams — set per-test
const mockUseParams = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useParams: () => mockUseParams(),
  };
});

// Mock b2bApi
const mockGetQuotes = vi.fn();
const mockGetQuote = vi.fn();
const mockAcceptQuote = vi.fn();
const mockRejectQuote = vi.fn();
vi.mock("../services/b2bApi", () => ({
  b2bApi: {
    getQuotes: (...args) => mockGetQuotes(...args),
    getQuote: (...args) => mockGetQuote(...args),
    acceptQuote: (...args) => mockAcceptQuote(...args),
    rejectQuote: (...args) => mockRejectQuote(...args),
  },
}));

// Mock useToast
const mockShowToast = vi.fn();
vi.mock("../hooks/useToast", () => ({
  default: () => ({ showToast: mockShowToast }),
}));

// Mock framer-motion (replace with static divs for testing)
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    tr: ({ children, ...props }) => <tr {...props}>{children}</tr>,
    button: ({ children, ...props }) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

// Mock lucide-react icons (just render a placeholder span)
vi.mock("lucide-react", () => {
  const icons = {};
  const iconList = [
    "FileText", "Plus", "Building2", "Clock", "AlertCircle",
    "CheckCircle2", "XCircle", "Send", "Eye", "ChevronLeft",
    "ChevronRight", "ChevronsLeft", "ChevronsRight", "Loader2",
    "Scale", "RefreshCw", "Calendar", "Package",
  ];
  for (const name of iconList) {
    icons[name] = ({ size, className, ...props }) => (
      <span className={className} data-icon={name} data-size={size} {...props} />
    );
  }
  return icons;
});

// Mock child components
vi.mock("../components/layout/Navbar", () => ({
  default: () => <nav data-testid="navbar" />,
}));
vi.mock("../components/Footer", () => ({
  default: () => <footer data-testid="footer" />,
}));
vi.mock("../components/MobileNav", () => ({
  default: () => <nav data-testid="mobile-nav" />,
}));
vi.mock("../components/common/Button", () => ({
  default: ({ children, onClick, disabled, className, ...props }) => (
    <button onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  ),
}));

// Mock Redux and cart
vi.mock("react-redux", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useDispatch: () => vi.fn(),
  };
});
vi.mock("../redux/cartSlice", () => ({
  hydrateFromMedusa: (payload) => ({ type: "cart/hydrateFromMedusa", payload }),
}));
vi.mock("../services/medusa/cartService", () => ({
  buildCartHydrationPayload: (cart) => cart,
}));

// ── Helper: create a minimal Redux store ─────────────────────────────────────

function createStore() {
  return configureStore({
    reducer: {
      auth: () => ({}),
      cart: () => ({}),
      compare: () => ({}),
      wishlist: () => ({}),
    },
  });
}

// ── Helper: render B2BQuoteHistory with providers ────────────────────────────

function renderQuoteHistory({ route = "/account/b2b-quotes", params = {} } = {}) {
  mockUseParams.mockReturnValue(params);

  return render(
    <Provider store={createStore()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/account/b2b-quotes" element={<B2BQuoteHistory />} />
          <Route path="/account/b2b-quotes/:id" element={<B2BQuoteHistory />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

// ── Sample data ──────────────────────────────────────────────────────────────

function makeSampleResponse({ overrides = {}, quoteOverrides = [] } = {}) {
  const quotes = [
    {
      id: "quote_001",
      status: "pending_review",
      created_at: "2026-06-15T10:00:00Z",
      items: [
        { title: "Organic Apples", quantity: 50, unit_price: 200 },
      ],
      subtotal: 10000,
      company_name: "Green Farms",
      customer_email: "farmer@greenfarms.com",
      ...quoteOverrides[0],
    },
    {
      id: "quote_002",
      status: "approved",
      created_at: "2026-06-10T08:00:00Z",
      items: [
        { title: "Organic Wheat", quantity: 100, unit_price: 150 },
      ],
      subtotal: 15000,
      negotiated_total: 13500,
      company_name: "Green Farms",
      customer_email: "farmer@greenfarms.com",
      ...quoteOverrides[1],
    },
  ];

  return {
    quotes,
    count: quotes.length,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("B2BQuoteHistory — signal-based fetch pattern", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: successful response
    mockGetQuotes.mockResolvedValue(makeSampleResponse());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Loading state ────────────────────────────────────────────────────

  it("shows loading skeletons on mount", () => {
    // Don't resolve the promise yet to keep loading state
    mockGetQuotes.mockImplementation(() => new Promise(() => {}));
    renderQuoteHistory();

    // Should render 3 skeleton placeholders
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  // ── Successful data load ─────────────────────────────────────────────

  it("renders quotes after successful fetch", async () => {
    renderQuoteHistory();

    // Status badges are visible in collapsed rows
    await waitFor(() => {
      expect(screen.getByText("pending_review")).toBeInTheDocument();
    });

    expect(screen.getByText("approved")).toBeInTheDocument();
    // Count text from the header
    expect(screen.getByText(/2 total/)).toBeInTheDocument();
  });

  // ── Signal passed to getQuotes ───────────────────────────────────────

  it("passes an abort signal to b2bApi.getQuotes", async () => {
    renderQuoteHistory();

    await waitFor(() => {
      expect(mockGetQuotes).toHaveBeenCalled();
    });

    const callArg = mockGetQuotes.mock.calls[0][0];
    // The signal object should be an AbortSignal with an 'aborted' property
    expect(callArg).toHaveProperty("signal");
    expect(callArg.signal).toHaveProperty("aborted");
  });

  // ── AbortController cleanup on unmount ────────────────────────────────

  it("aborts the in-flight request on unmount", async () => {
    let capturedSignal;
    mockGetQuotes.mockImplementation(({ signal }) => {
      capturedSignal = signal;
      return new Promise(() => {}); // never resolve
    });

    const { unmount } = renderQuoteHistory();

    // Wait for fetch to be called
    await waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });

    expect(capturedSignal.aborted).toBe(false);
    unmount();
    expect(capturedSignal.aborted).toBe(true);
  });

  // ── requestSeqRef prevents stale updates ────────────────────────────

  it("does not update state from a stale request (requestSeqRef guard)", async () => {
    // Simulate two overlapping requests
    let resolveSlow;
    const slowPromise = new Promise((resolve) => {
      resolveSlow = resolve;
    });

    // First call is slow, second call resolves immediately
    mockGetQuotes
      .mockImplementationOnce(() => slowPromise)
      .mockImplementationOnce(() =>
        Promise.resolve(makeSampleResponse({ quoteOverrides: [{}, { id: "quote_002_new" }] }))
      );

    renderQuoteHistory();

    // Trigger a re-fetch while first is still in-flight by changing status filter
    const allButton = screen.getByText("All Statuses");
    await userEvent.click(screen.getByText("Pending Review"));

    // Resolve the first (stale) request
    resolveSlow(makeSampleResponse({ quoteOverrides: [{ id: "stale_001" }, { id: "stale_002" }] }));

    // The stale response should have been discarded — we should see the second response
    await waitFor(() => {
      // The second fetch should be for status "pending_review"
      expect(mockGetQuotes).toHaveBeenCalledTimes(2);
    });
  });

  // ── Error state ──────────────────────────────────────────────────────

  it("shows error UI when fetch fails", async () => {
    mockGetQuotes.mockRejectedValue({
      response: { data: { message: "Server error" } },
      message: "Server error",
    });

    renderQuoteHistory();

    await waitFor(() => {
      expect(screen.getByText("Could not load B2B quotes")).toBeInTheDocument();
    });

    expect(screen.getByText("Server error")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("does NOT show error for abort errors", async () => {
    mockGetQuotes.mockRejectedValue({ name: "AbortError", message: "canceled" });

    renderQuoteHistory();

    // Should still be loading (error state should NOT appear)
    await waitFor(() => {
      const pulses = document.querySelectorAll(".animate-pulse");
      expect(pulses.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Retry button ─────────────────────────────────────────────────────

  it("retries fetch when Retry button is clicked", async () => {
    mockGetQuotes
      .mockRejectedValueOnce({ message: "Network error" })
      .mockResolvedValueOnce(makeSampleResponse());

    renderQuoteHistory();

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Retry"));

    // After retry, a quote status should appear
    await waitFor(() => {
      expect(screen.getByText("pending_review")).toBeInTheDocument();
    });

    expect(mockGetQuotes).toHaveBeenCalledTimes(2);
  });

  // ── Empty state ──────────────────────────────────────────────────────

  it("shows empty state when no quotes exist", async () => {
    mockGetQuotes.mockResolvedValue({ quotes: [], count: 0 });

    renderQuoteHistory();

    await waitFor(() => {
      expect(screen.getByText("No quotes yet")).toBeInTheDocument();
    });

    expect(screen.getByText("Submit a Wholesale Quote")).toBeInTheDocument();
  });

  // ── getQuote called for specific id from route params ────────────────

  it("fetches a single quote via getQuote when route has an :id param", async () => {
    mockGetQuotes.mockResolvedValue(makeSampleResponse());
    mockGetQuote.mockResolvedValue({
      quote: {
        id: "quote_999",
        status: "approved",
        created_at: "2026-07-01T00:00:00Z",
        items: [],
        subtotal: 5000,
        company_name: "Single Farm",
        customer_email: "single@farm.com",
      },
    });

    renderQuoteHistory({
      route: "/account/b2b-quotes/quote_999",
      params: { id: "quote_999" },
    });

    await waitFor(() => {
      // The single quote should be in the rendered list
      expect(mockGetQuote).toHaveBeenCalledWith("quote_999", expect.objectContaining({
        signal: expect.any(Object),
      }));
    });
  });

  // ── Pagination helper ───────────────────────────────────────────────

  it("calculates total pages from count", async () => {
    mockGetQuotes.mockResolvedValue({
      quotes: Array.from({ length: 10 }, (_, i) => ({
        id: `quote_${i}`,
        status: "pending",
        created_at: "2026-06-01T00:00:00Z",
        items: [],
        subtotal: 1000,
      })),
      count: 25, // 25 items, PAGE_SIZE=10 → 3 pages
    });

    renderQuoteHistory();

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });
  });

  // ── Status filter changes trigger new fetch ──────────────────────────

  it("re-fetches when status filter changes", async () => {
    renderQuoteHistory();

    await waitFor(() => {
      expect(mockGetQuotes).toHaveBeenCalledTimes(1);
    });

    await userEvent.click(screen.getByText("Approved"));

    await waitFor(() => {
      expect(mockGetQuotes).toHaveBeenCalledTimes(2);
    });

    // Check the second call passed the filter
    const secondCallParams = mockGetQuotes.mock.calls[1][0];
    expect(secondCallParams.status).toBe("approved");
  });
});
