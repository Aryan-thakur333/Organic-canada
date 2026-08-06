export function createBackendHealthMonitor({
  check,
  onStatus,
  healthyIntervalMs = 15_000,
  initialRetryMs = 2_000,
  maxRetryMs = 30_000,
  setTimer = window.setTimeout.bind(window),
  clearTimer = window.clearTimeout.bind(window),
}) {
  let stopped = false;
  let timer = null;
  let controller = null;
  let retryMs = initialRetryMs;
  let inFlight = false;

  const schedule = (delay) => {
    if (stopped) return;
    timer = setTimer(run, delay);
  };

  const run = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    controller = new AbortController();
    try {
      await check({ signal: controller.signal });
      if (stopped) return;
      retryMs = initialRetryMs;
      onStatus({ online: true });
      schedule(healthyIntervalMs);
    } catch (error) {
      if (stopped || error?.name === "AbortError" || error?.code === "ERR_CANCELED") return;
      onStatus({ online: false, errorCode: error?.code || "BACKEND_UNAVAILABLE" });
      schedule(retryMs);
      retryMs = Math.min(maxRetryMs, retryMs * 2);
    } finally {
      inFlight = false;
      controller = null;
    }
  };

  run();
  return {
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      controller?.abort();
      timer = null;
    },
  };
}
