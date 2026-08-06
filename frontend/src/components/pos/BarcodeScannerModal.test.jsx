import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BarcodeScannerModal from "./BarcodeScannerModal";

const camera = vi.hoisted(() => ({ callback: null, constraints: null, decodeCalls: 0, formats: [], mode: "success", stop: vi.fn(), trackStop: vi.fn() }));

vi.mock("@zxing/browser", () => {
  class BrowserMultiFormatReader {
    static listVideoInputDevices = vi.fn(async () => [{ deviceId: "rear", label: "Rear" }, { deviceId: "front", label: "Front" }]);
    constructor(hints) {
      if (hints && typeof hints.get === "function") {
        camera.formats = hints.get(3) || []; // DecodeHintType.POSSIBLE_FORMATS
      }
    }
    set possibleFormats(value) { camera.formats = value; }
    async decodeFromVideoElement(video, callback) {
      camera.decodeCalls += 1;
      camera.callback = callback;
      return new Promise((resolve) => setTimeout(() => resolve({ stop: camera.stop }), 10));
    }
  }
  return { BrowserMultiFormatReader, BarcodeFormat: { CODE_128: 1, CODE_39: 2, EAN_13: 3, EAN_8: 4, UPC_A: 5, UPC_E: 6, ITF: 7, QR_CODE: 8 } };
});

vi.mock("@zxing/library", () => {
  return { DecodeHintType: { POSSIBLE_FORMATS: 3, TRY_HARDER: 4 } };
});

const register = { id: "reg_ca", name: "Canada POS", currency_code: "cad" };
const product = {
  product_id: "prod_1", product_title: "Organic Apples", thumbnail: "", variant_id: "variant_1", variant_title: "1 kg", sku: "APPLE-1", barcode: "0012345678905", upc: "012345678905", ean: "0012345678905",
  price: { amount_minor: 499, currency_code: "cad", formatted: "$4.99" },
  inventory: { location_id: "loc_ca", location_name: "Toronto Store", stocked_quantity: 10, reserved_quantity: 2, available_quantity: 8, status: "AVAILABLE" },
  register: { id: "reg_ca", name: "Canada POS", currency_code: "cad" }, available_for_sale: true, allow_backorder: false,
};

const renderModal = (props = {}) => render(<BarcodeScannerModal open onClose={vi.fn()} onDetected={vi.fn(async () => product)} onAdd={vi.fn(() => true)} register={register} {...props} />);

describe("BarcodeScannerModal", () => {
  beforeEach(() => {
    camera.callback = null;
    camera.constraints = null;
    camera.decodeCalls = 0;
    camera.formats = [];
    camera.mode = "success";
    camera.stop.mockClear();
    camera.trackStop.mockClear();
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(async (constraints) => {
          camera.constraints = constraints;
          if (camera.mode === "denied") throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
          if (camera.mode === "missing") throw Object.assign(new Error("missing"), { name: "NotFoundError" });
          return { getTracks: () => [{ stop: camera.trackStop }], getVideoTracks: () => [{ label: "Rear", getCapabilities: () => ({ focusMode: ["continuous"] }), applyConstraints: vi.fn() }] };
        }),
      },
      configurable: true,
    });
    // Bypass the 1000ms timeout in the component by mocking video dimensions
    Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { configurable: true, get: () => 4 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1920 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 1080 });
  });

  it("does not initialize a camera while closed", () => {
    render(<BarcodeScannerModal open={false} onClose={vi.fn()} onDetected={vi.fn()} onAdd={vi.fn()} register={register} />);
    expect(camera.decodeCalls).toBe(0);
  });

  it("initializes after opening and exposes camera switching", async () => {
    renderModal();
    await waitFor(() => expect(camera.decodeCalls).toBe(1));
    expect(camera.formats).toContain(1);
    expect(camera.constraints).toMatchObject({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    expect(await screen.findByRole("button", { name: /switch camera/i })).toBeVisible();
  });

  it.each(["NotFoundException", "ChecksumException", "FormatException"])("keeps decoding after an expected %s", async (name) => {
    const onDetected = vi.fn();
    renderModal({ onDetected });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback(null, Object.assign(new Error(name), { name })));
    expect(camera.stop).not.toHaveBeenCalled();
    expect(camera.trackStop).not.toHaveBeenCalled();
    expect(onDetected).not.toHaveBeenCalled();
    expect(screen.getByText(/Place only the black barcode bars inside the frame/i)).toBeVisible();
  });

  it("shows permission-denied and no-camera states", async () => {
    camera.mode = "denied";
    const first = renderModal();
    expect(await screen.findByText("Camera permission denied")).toBeVisible();
    first.unmount();
    camera.mode = "missing";
    renderModal();
    expect(await screen.findByText("Camera unavailable")).toBeVisible();
  });

  it("detects without losing leading zeroes and renders server price and location inventory", async () => {
    const onDetected = vi.fn(async (code) => ({ ...product, barcode: code }));
    renderModal({ onDetected });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback({ getText: () => "\u00020012345678905\r" }));
    expect(onDetected).toHaveBeenCalledWith("0012345678905", "CAMERA");
    expect(onDetected).toHaveBeenCalledOnce();
    expect(await screen.findByText("Organic Apples")).toBeVisible();
    expect(screen.getAllByText("$4.99")[0]).toBeVisible();
    expect(screen.getByText("Toronto Store")).toBeVisible();
    expect(screen.getByText(/Available: 8/)).toBeVisible();
    expect(camera.trackStop).toHaveBeenCalled();
  });

  it("adds the selected quantity and closes", async () => {
    const onAdd = vi.fn(() => true), onClose = vi.fn();
    renderModal({ onAdd, onClose });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback({ getText: () => product.barcode }));
    await screen.findByText("Organic Apples");
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /add to cart/i }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ variant_id: "variant_1" }), 2, product.barcode);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("allows add when lookup response supplies the authoritative register currency", async () => {
    const onAdd = vi.fn(() => true), onClose = vi.fn();
    const usaProduct = {
      ...product,
      price: { amount_minor: 1699, currency_code: "usd", formatted: "$16.99" },
      register: { id: "reg_us", name: "USA POS Register", currency_code: "usd" },
      inventory: { ...product.inventory, location_id: "loc_us", location_name: "USA POS Store", available_quantity: 20, stocked_quantity: 20, reserved_quantity: 0 },
    };
    renderModal({ register: undefined, onDetected: vi.fn(async () => usaProduct), onAdd, onClose, initialCode: "999999999" });
    expect(await screen.findByText("USA POS Register")).toBeVisible();
    const button = screen.getByRole("button", { name: /add to cart/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ variant_id: "variant_1" }), 1, "999999999");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("blocks an out-of-stock product", async () => {
    renderModal({ onDetected: vi.fn(async () => ({ ...product, available_for_sale: false, inventory: { ...product.inventory, available_quantity: 0, status: "OUT_OF_STOCK" } })) });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback({ getText: () => "OUT-1" }));
    expect(await screen.findByText("Product found, but it is out of stock at this POS location.")).toBeVisible();
    expect(screen.getByRole("button", { name: /add to cart/i })).toBeDisabled();
  });

  it("blocks missing prices and register currency mismatches", async () => {
    const first = renderModal({ onDetected: vi.fn(async () => ({ ...product, price: null })) });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback({ getText: () => "NO-PRICE" }));
    expect(await screen.findByText("Price unavailable for this register region")).toBeVisible();
    expect(screen.getByRole("button", { name: /add to cart/i })).toBeDisabled();
    first.unmount();
    camera.callback = null;
    renderModal({ onDetected: vi.fn(async () => ({ ...product, price: { amount_minor: 499, currency_code: "usd", formatted: "$4.99" } })) });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback({ getText: () => "WRONG-CURRENCY" }));
    expect(await screen.findByText("Currency does not match this register")).toBeVisible();
    expect(screen.getByRole("button", { name: /add to cart/i })).toBeDisabled();
  });

  it("shows unknown-code state and retry starts a fresh camera", async () => {
    renderModal({ onDetected: vi.fn(async () => { throw { response: { status: 404, data: { code: "POS_PRODUCT_NOT_FOUND", message: "No match" } } }; }) });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback({ getText: () => "UNKNOWN-1" }));
    expect((await screen.findAllByText("No matching product found."))[0]).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /scan again/i }));
    await waitFor(() => expect(camera.decodeCalls).toBe(2));
  });

  it("manual fallback uses same lookup function", async () => {
    const onDetected = vi.fn(async () => product);
    renderModal({ onDetected });
    const input = screen.getByLabelText("Manual barcode code");
    fireEvent.change(input, { target: { value: "MANUAL-SKU" } });
    fireEvent.click(screen.getByRole("button", { name: /Look up/i }));
    await waitFor(() => expect(onDetected).toHaveBeenCalledWith("MANUAL-SKU", "MANUAL"));
  });

  it("shows Inventory unavailable error title for POS_INVENTORY_UNKNOWN", async () => {
    renderModal({ onDetected: vi.fn(async () => { throw { response: { status: 422, data: { code: "POS_INVENTORY_UNKNOWN", message: "Inventory could not be verified" } } }; }) });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback({ getText: () => "INV-UNKNOWN-1" }));
    expect(await screen.findByText("Inventory unavailable")).toBeVisible();
    expect(screen.getByText("Inventory could not be verified for this location.")).toBeVisible();
  });

  it("shows Inventory unavailable error title for POS_VARIANT_NOT_IN_SALES_CHANNEL", async () => {
    renderModal({ onDetected: vi.fn(async () => { throw { response: { status: 422, data: { code: "POS_VARIANT_NOT_IN_SALES_CHANNEL", message: "Product is not available" } } }; }) });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback({ getText: () => "NOT-IN-CHANNEL-1" }));
    expect(await screen.findByText("Inventory unavailable")).toBeVisible();
    expect(screen.getByText("Product is not available in this POS location.")).toBeVisible();
  });

  it("shows safe error when register is missing and lookup fails", async () => {
    renderModal({ register: null, onDetected: vi.fn(async () => { throw { response: { status: 400, data: { code: "POS_REGISTER_ID_MISSING" } } }; }) });
    await waitFor(() => expect(camera.callback).toBeTypeOf("function"));
    await act(async () => camera.callback({ getText: () => "CODE" }));
    expect(await screen.findByText("Operator is not assigned to this register.")).toBeVisible();
  });

  it("stops the camera on close and unmount", async () => {
    const onClose = vi.fn();
    const view = renderModal({ onClose });
    await waitFor(() => expect(camera.decodeCalls).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: /close barcode scanner/i }));
    expect(camera.stop).toHaveBeenCalled();
    expect(camera.trackStop).toHaveBeenCalled();
    view.unmount();
    expect(camera.stop).toHaveBeenCalled();
  });
});
