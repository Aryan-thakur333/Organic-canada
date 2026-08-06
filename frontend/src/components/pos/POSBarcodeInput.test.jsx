import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import POSBarcodeInput from "./POSBarcodeInput";

describe("POSBarcodeInput", () => {
  it("renders the camera button without requesting a camera and opens it on click", () => {
    const onOpenCamera = vi.fn();
    render(<POSBarcodeInput onScan={vi.fn()} onOpenCamera={onOpenCamera} loading={false} />);
    const button = screen.getByRole("button", { name: /scan barcode with camera/i });
    expect(button).toBeVisible();
    expect(onOpenCamera).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onOpenCamera).toHaveBeenCalledOnce();
  });

  it("preserves manual barcode entry", () => {
    const onScan = vi.fn();
    render(<POSBarcodeInput onScan={onScan} onOpenCamera={vi.fn()} loading={false} />);
    fireEvent.change(screen.getByLabelText(/barcode, sku/i), { target: { value: "0012345678905" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter" }));
    expect(onScan).toHaveBeenCalledWith("0012345678905", "MANUAL_TOP_INPUT");
  });
});
