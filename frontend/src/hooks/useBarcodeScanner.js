import { useEffect, useRef } from "react";

export default function useBarcodeScanner({ onScan, onUnknown, minimumCodeLength = 3, scanTimeout = 80, duplicateTimeout = 750, suffixKey = "Enter", enabled = true } = {}) {
  const buffer = useRef("");
  const lastKeyAt = useRef(0);
  const lastScan = useRef({ code: "", at: 0 });
  const callback = useRef(onScan);
  const unknown = useRef(onUnknown);
  useEffect(() => {
    callback.current = onScan;
    unknown.current = onUnknown;
  }, [onScan, onUnknown]);

  useEffect(() => {
    if (!enabled) { buffer.current = ""; return undefined; }
    const keydown = (event) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      const isEditable = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (isEditable) {
        buffer.current = "";
        lastKeyAt.current = 0;
        return;
      }
      const now = Date.now();
      if (event.key === suffixKey) {
        const code = buffer.current;
        buffer.current = "";
        lastKeyAt.current = 0;
        if (code.length < minimumCodeLength) return;
        if (lastScan.current.code === code && now - lastScan.current.at < duplicateTimeout) return;
        lastScan.current = { code, at: now };
        Promise.resolve(callback.current?.(code)).catch((error) => unknown.current?.(code, error));
        return;
      }
      if (event.key.length !== 1) return;
      if (lastKeyAt.current && now - lastKeyAt.current > scanTimeout) buffer.current = "";
      buffer.current += event.key;
      lastKeyAt.current = now;
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [duplicateTimeout, enabled, minimumCodeLength, scanTimeout, suffixKey]);
}
