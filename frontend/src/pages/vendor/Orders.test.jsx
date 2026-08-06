import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { BrowserRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Orders from "./Orders";
import { vendorApi } from "../../services/vendorApi";

vi.mock("./DashboardLayout", () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("../../services/vendorApi", () => ({
  vendorApi: {
    getOrders: vi.fn().mockResolvedValue({ orders: [] }),
    getOrder: vi.fn().mockResolvedValue({ order: null }),
    getStockLocations: vi.fn().mockResolvedValue({
      locations: [{ id: "sloc_test", name: "Test warehouse" }],
    }),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const renderOrders = (orders = []) => {
  vendorApi.getOrders.mockResolvedValue({ orders: orders || [] });
  const store = configureStore({
    reducer: {
      vendor: (state = { orders }, action) => {
        if (action.type === "vendor/setOrders") {
          return { ...state, orders: action.payload };
        }
        return state;
      },
    },
  });
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <Orders />
      </BrowserRouter>
    </Provider>
  );
};

describe("Vendor Orders Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Orders page renders with one order", async () => {
    renderOrders([
      {
        id: "ord_123",
        display_id: "123",
        created_at: new Date().toISOString(),
        items: [{ quantity: 1 }],
      },
    ]);
    expect(screen.getByText("#123")).toBeInTheDocument();
  });

  it("2. Missing money fields render CA$0.00", async () => {
    renderOrders([
      {
        id: "ord_2",
        display_id: "2",
        created_at: new Date().toISOString(),
        items: [{ quantity: 1 }],
      },
    ]);
    
    // Vendor net should be CA$0.00
    const moneyCells = screen.getAllByText("CA$0.00");
    expect(moneyCells.length).toBeGreaterThan(0);
  });

  it("3. 11000 minor CAD renders CA$110.00", async () => {
    renderOrders([
      {
        id: "ord_3",
        display_id: "3",
        created_at: new Date().toISOString(),
        vendor_net_total: 11000,
        items: [{ quantity: 1 }],
      },
    ]);
    expect(screen.getByText("CA$110.00")).toBeInTheDocument();
  });

  it("4. Gross/Commission/Vendor Net render", async () => {
    renderOrders([
      {
        id: "ord_4",
        display_id: "4",
        created_at: new Date().toISOString(),
        item_subtotal: 5000,
        commission_total: 500,
        vendor_net_total: 4500,
        items: [{ quantity: 1 }],
      },
    ]);

    // Open modal
    const viewButton = screen.getByTitle("View details");
    fireEvent.click(viewButton);

    expect(screen.getByText("Gross Sale")).toBeInTheDocument();
    expect(screen.getByText("CA$50.00")).toBeInTheDocument();
    expect(screen.getByText("Commission")).toBeInTheDocument();
    expect(screen.getByText("-CA$5.00")).toBeInTheDocument();
    expect(screen.getAllByText("Vendor Net").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CA$45.00").length).toBeGreaterThan(1);
  });

  it("5. Old response field names are supported", async () => {
    renderOrders([
      {
        id: "ord_5",
        display_id: "5",
        created_at: new Date().toISOString(),
        gross_amount: 10000,
        commission_amount: 1000,
        net_amount: 9000,
        items: [{ quantity: 1 }],
      },
    ]);
    
    expect(screen.getByText("CA$90.00")).toBeInTheDocument(); // Net
    
    // Open modal
    fireEvent.click(screen.getByTitle("View details"));
    expect(screen.getByText("CA$100.00")).toBeInTheDocument(); // Gross
    expect(screen.getByText("-CA$10.00")).toBeInTheDocument(); // Commission
  });

  it("6. Missing currency defaults to CAD", async () => {
    renderOrders([
      {
        id: "ord_6",
        display_id: "6",
        created_at: new Date().toISOString(),
        vendor_net_total: 500,
        currency_code: null, // missing
        items: [{ quantity: 1 }],
      },
    ]);
    expect(screen.getByText("CA$5.00")).toBeInTheDocument();
  });

  it("7. Undefined orders response does not crash", async () => {
    renderOrders(undefined);
    expect(await screen.findByText(/No Sales Yet/i)).toBeInTheDocument();
  });

  it("8. Clicking order row/modal does not crash", async () => {
    renderOrders([
      {
        id: "ord_8",
        display_id: "8",
        created_at: new Date().toISOString(),
        items: [],
      },
    ]);
    
    const viewButton = screen.getByTitle("View details");
    fireEvent.click(viewButton);
    
    // Details modal opens successfully
    expect(await screen.findByText(/Order Details/)).toBeInTheDocument();
  });

  it("9. Status processing renders Prepare / Pack Order button in details modal", async () => {
    const order = {
      id: "ord_9",
      display_id: "9",
      created_at: new Date().toISOString(),
      vendor_fulfillment_status: "processing",
      items: [],
    };
    
    const { vendorApi } = await import("../../services/vendorApi");
    vi.mocked(vendorApi.getOrder).mockResolvedValue({ order });

    renderOrders([order]);
    
    fireEvent.click(screen.getByTitle("View details"));
    expect(screen.getByText("Prepare / Pack Order")).toBeInTheDocument();
  });

  it("10. Status ready_to_ship renders Mark as Shipped button in details modal", async () => {
    const order = {
      id: "ord_10",
      display_id: "10",
      created_at: new Date().toISOString(),
      vendor_fulfillment_status: "ready_to_ship",
      items: [],
    };

    const { vendorApi } = await import("../../services/vendorApi");
    vi.mocked(vendorApi.getOrder).mockResolvedValue({ order });

    renderOrders([order]);
    fireEvent.click(screen.getByTitle("View details"));
    
    expect(screen.getByText("Mark as Shipped")).toBeInTheDocument();
  });

  it("11. Status shipped renders Mark as Delivered button in details modal", async () => {
    const order = {
      id: "ord_11",
      display_id: "11",
      created_at: new Date().toISOString(),
      vendor_fulfillment_status: "shipped",
      items: [],
    };

    const { vendorApi } = await import("../../services/vendorApi");
    vi.mocked(vendorApi.getOrder).mockResolvedValue({ order });

    renderOrders([order]);
    fireEvent.click(screen.getByTitle("View details"));
    
    expect(await screen.findByText("Mark as Delivered")).toBeInTheDocument();
  });

  it("12. Status delivered renders Completed text in details modal", async () => {
    const order = {
      id: "ord_12",
      display_id: "12",
      created_at: new Date().toISOString(),
      vendor_fulfillment_status: "delivered",
      items: [],
    };

    const { vendorApi } = await import("../../services/vendorApi");
    vi.mocked(vendorApi.getOrder).mockResolvedValue({ order });

    renderOrders([order]);
    fireEvent.click(screen.getByTitle("View details"));
    
    expect((await screen.findAllByText("Completed")).length).toBeGreaterThan(1);
  });

  it("13. Modal fetch replaces stale processing with ready_to_ship", async () => {
    const staleOrder = {
      id: "ord_13",
      display_id: "13",
      created_at: new Date().toISOString(),
      vendor_fulfillment_status: "processing",
      items: [],
    };

    const freshOrder = {
      id: "ord_13",
      display_id: "13",
      created_at: staleOrder.created_at,
      vendor_fulfillment_status: "ready_to_ship",
      items: [],
    };

    const { vendorApi } = await import("../../services/vendorApi");
    vi.mocked(vendorApi.getOrder).mockResolvedValue({ order: freshOrder });

    renderOrders([staleOrder]);
    
    expect(screen.getByText("processing")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("View details"));

    await waitFor(() => {
      expect(screen.getByText("Mark as Shipped")).toBeInTheDocument();
    });
  });

  describe("Inventory Validation & Error Handling", () => {
    it("14. Missing items array does not crash", () => {
      renderOrders([
        {
          id: "ord_no_items",
          display_id: "no_items",
          created_at: new Date().toISOString(),
          items: null, // Malformed API response
        },
      ]);
      expect(screen.getByText("#no_items")).toBeInTheDocument();
    });

    it("15. Inventory-level missing error is displayed and modal stays open", async () => {
      const order = {
        id: "ord_15",
        display_id: "15",
        created_at: new Date().toISOString(),
        vendor_fulfillment_status: "prepared",
        items: [{ id: "item_1", title: "Organic OIL", quantity: 5 }],
      };
      const { vendorApi } = await import("../../services/vendorApi");
      vi.mocked(vendorApi.getOrder).mockResolvedValue({ order });

      // Mock 422 error
      const errorResponse = {
        response: {
          status: 422,
          data: {
            code: "VENDOR_INVENTORY_LEVEL_MISSING",
            message: "Inventory is not configured for Organic OIL at organic canada Vendor Warehouse.",
          },
        },
      };
      vendorApi.fulfillOrder = vi.fn().mockRejectedValue(errorResponse);
      const toast = await import("react-hot-toast");

      renderOrders([order]);
      
      // Open modal
      fireEvent.click(screen.getByTitle("View details"));
      await waitFor(() => expect(screen.getByText("Create Fulfillment")).toBeInTheDocument());
      
      // Click fulfill
      fireEvent.click(screen.getByText("Create Fulfillment"));
      
      // Toast displayed
      await waitFor(() => {
        expect(toast.default.error).toHaveBeenCalledWith(
          "Inventory is not configured for Organic OIL at organic canada Vendor Warehouse.",
          expect.any(Object)
        );
      });
      
      // Modal still open (Create Fulfillment button still visible)
      expect(screen.getByText("Create Fulfillment")).toBeInTheDocument();
      expect(vendorApi.fulfillOrder).toHaveBeenCalledTimes(1);
    });

    it("16. Double-click sends one request (disabled state)", async () => {
      const order = {
        id: "ord_16",
        display_id: "16",
        created_at: new Date().toISOString(),
        vendor_fulfillment_status: "prepared",
        items: [{ id: "item_1", title: "Test", quantity: 5 }],
      };
      const { vendorApi } = await import("../../services/vendorApi");
      vi.mocked(vendorApi.getOrder).mockResolvedValue({ order });
      
      let fulfillPromiseResolve;
      const fulfillPromise = new Promise(resolve => fulfillPromiseResolve = resolve);
      vendorApi.fulfillOrder = vi.fn().mockImplementation(() => fulfillPromise);

      renderOrders([order]);
      fireEvent.click(screen.getByTitle("View details"));
      await waitFor(() => expect(screen.getByText("Create Fulfillment")).toBeInTheDocument());

      const fulfillBtn = screen.getByText("Create Fulfillment");
      
      // Click twice quickly
      fireEvent.click(fulfillBtn);
      fireEvent.click(fulfillBtn);
      
      // Check if disabled
      expect(fulfillBtn.closest('button')).toBeDisabled();
      
      // Only called once due to disabled state
      expect(vendorApi.fulfillOrder).toHaveBeenCalledTimes(1);
      
      fulfillPromiseResolve({ order: { ...order, vendor_fulfillment_status: "ready_to_ship" } });
    });
  });
});
