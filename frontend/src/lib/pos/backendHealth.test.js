import { describe, expect, it, vi } from "vitest";
import { createBackendHealthMonitor } from "./backendHealth";

describe("POS backend health monitor", () => {
  it("reports success and schedules one controlled poll", async () => {
    const timers = [], statuses = [];
    const monitor = createBackendHealthMonitor({ check: vi.fn().mockResolvedValue(true), onStatus: (value) => statuses.push(value), setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimer: vi.fn() });
    await Promise.resolve(); await Promise.resolve();
    expect(statuses).toEqual([{ online: true }]);
    expect(timers).toHaveLength(1);
    expect(timers[0].delay).toBe(15_000);
    monitor.stop();
  });

  it("backs off after refusal and recovers without a request storm", async () => {
    const timers = [], statuses = [];
    const check = vi.fn().mockRejectedValueOnce(Object.assign(new Error("refused"), { code: "ERR_NETWORK" })).mockResolvedValue(true);
    const monitor = createBackendHealthMonitor({ check, onStatus: (value) => statuses.push(value), setTimer: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimer: vi.fn() });
    await Promise.resolve(); await Promise.resolve();
    expect(statuses[0]).toMatchObject({ online: false, errorCode: "ERR_NETWORK" });
    expect(timers).toHaveLength(1);
    await timers[0].callback();
    expect(statuses.at(-1)).toEqual({ online: true });
    expect(check).toHaveBeenCalledTimes(2);
    expect(timers).toHaveLength(2);
    monitor.stop();
  });

  it("aborts and stops polling on unmount", async () => {
    let capturedSignal;
    const clearTimer = vi.fn();
    const monitor = createBackendHealthMonitor({ check: vi.fn(({ signal }) => { capturedSignal = signal; return new Promise(() => {}); }), onStatus: vi.fn(), setTimer: vi.fn(), clearTimer });
    expect(capturedSignal.aborted).toBe(false);
    monitor.stop();
    expect(capturedSignal.aborted).toBe(true);
  });
});
