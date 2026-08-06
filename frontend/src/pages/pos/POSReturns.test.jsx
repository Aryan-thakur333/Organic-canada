import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import POSReturns from "./POSReturns";

const mocks = vi.hoisted(() => ({
  previewReturn: vi.fn(),
  createReturn: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../../components/pos/POSShell", () => ({ default: ({ children }) => <>{children}</> }));
vi.mock("../../components/pos/POSReceipt", () => ({ default: () => null }));
vi.mock("../../services/posApi", () => ({ posApi: { previewReturn: mocks.previewReturn, createReturn: mocks.createReturn } }));
vi.mock("react-hot-toast", () => ({ default: { error: mocks.toastError, success: vi.fn() } }));

describe("POS return preview isolation", () => {
  beforeEach(() => {
    mocks.previewReturn.mockReset();
    mocks.createReturn.mockReset();
    mocks.toastError.mockReset();
  });

  it("does not request a preview until a complete order and item are explicitly submitted", async () => {
    mocks.previewReturn.mockResolvedValue({ preview: { refund_amount_minor: 499 } });
    render(<POSReturns />);
    const previewButton = screen.getByRole("button", { name: /preview refund/i });
    expect(previewButton).toBeDisabled();
    expect(mocks.previewReturn).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Native order ID"), { target: { value: "order_1" } });
    fireEvent.change(screen.getByLabelText("Order line item ID"), { target: { value: "item_1" } });
    expect(previewButton).toBeEnabled();
    fireEvent.click(previewButton);

    await waitFor(() => expect(mocks.previewReturn).toHaveBeenCalledWith("order_1", [{ item_id: "item_1", quantity: 1 }]));
    expect(await screen.findByText("Refund: 499 minor units")).toBeVisible();
  });

  it("handles a preview 404 without crashing or enabling return completion", async () => {
    mocks.previewReturn.mockRejectedValue({ response: { status: 404, data: { message: "Order not found" } } });
    render(<POSReturns />);
    fireEvent.change(screen.getByLabelText("Native order ID"), { target: { value: "missing_order" } });
    fireEvent.change(screen.getByLabelText("Order line item ID"), { target: { value: "item_1" } });
    fireEvent.click(screen.getByRole("button", { name: /preview refund/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Order not found"));
    expect(screen.getByRole("button", { name: /approve and complete return/i })).toBeDisabled();
    expect(screen.getByRole("heading", { name: /return and refund/i })).toBeVisible();
  });
});
