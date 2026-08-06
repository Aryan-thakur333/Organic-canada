import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useBarcodeScanner from "./useBarcodeScanner";

const emit = (key, options = {}) => window.dispatchEvent(new KeyboardEvent("keydown", { key, ...options }));
const scan = (value) => { for (const key of value) emit(key); emit("Enter"); };

describe("useBarcodeScanner", () => {
  beforeEach(() => vi.useFakeTimers());
  it("accepts a rapid valid scan", () => { const onScan = vi.fn(); renderHook(() => useBarcodeScanner({ onScan })); act(() => scan("12345")); expect(onScan).toHaveBeenCalledWith("12345"); });
  it("forwards lookup failures to onUnknown", async () => { const error = new Error("unknown"); const onUnknown = vi.fn(); renderHook(() => useBarcodeScanner({ onScan: () => Promise.reject(error), onUnknown })); await act(async () => { scan("99999"); await Promise.resolve(); }); expect(onUnknown).toHaveBeenCalledWith("99999", error); });
  it("suppresses an immediate duplicate scan", () => { const onScan = vi.fn(); renderHook(() => useBarcodeScanner({ onScan })); act(() => { scan("12345"); scan("12345"); }); expect(onScan).toHaveBeenCalledTimes(1); });
  it("does nothing while disabled", () => { const onScan = vi.fn(); renderHook(() => useBarcodeScanner({ onScan, enabled: false })); act(() => scan("12345")); expect(onScan).not.toHaveBeenCalled(); });
  it("ignores slow typing", () => { const onScan = vi.fn(); renderHook(() => useBarcodeScanner({ onScan, scanTimeout: 50 })); act(() => { emit("1"); vi.advanceTimersByTime(60); emit("2"); vi.advanceTimersByTime(60); emit("3"); emit("Enter"); }); expect(onScan).not.toHaveBeenCalled(); });
  it("ignores repeated keyboard events", () => { const onScan = vi.fn(); renderHook(() => useBarcodeScanner({ onScan })); act(() => { emit("1", { repeat: true }); emit("2", { repeat: true }); emit("Enter"); }); expect(onScan).not.toHaveBeenCalled(); });
  it("ignores scanner-like keys while an operator types in another field", () => { const onScan = vi.fn(); renderHook(() => useBarcodeScanner({ onScan })); const input = document.createElement("input"); document.body.appendChild(input); act(() => { for (const key of "12345") input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }); expect(onScan).not.toHaveBeenCalled(); input.remove(); });
  it("allows the same code after the duplicate throttle expires", () => { const onScan = vi.fn(); renderHook(() => useBarcodeScanner({ onScan, duplicateTimeout: 500 })); act(() => { scan("12345"); vi.advanceTimersByTime(501); scan("12345"); }); expect(onScan).toHaveBeenCalledTimes(2); });
});
