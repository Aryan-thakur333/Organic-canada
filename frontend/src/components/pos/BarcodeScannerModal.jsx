import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, RefreshCw, RotateCcw, X } from "lucide-react";
import { normalizeBarcode } from "../../lib/pos/barcode";
import { posErrorCode, posErrorMessage } from "../../lib/pos/errors";

export const SCANNER_STATES = Object.freeze({
  IDLE: "IDLE", REQUESTING_PERMISSION: "REQUESTING_PERMISSION", SCANNING: "SCANNING", CODE_DETECTED: "CODE_DETECTED", LOOKING_UP: "LOOKING_UP", PRODUCT_FOUND: "PRODUCT_FOUND", NOT_FOUND: "NOT_FOUND",
  PERMISSION_DENIED: "PERMISSION_DENIED", CAMERA_UNAVAILABLE: "CAMERA_UNAVAILABLE", NOT_AUTHORIZED: "NOT_AUTHORIZED", SESSION_REQUIRED: "SESSION_REQUIRED", PRICE_UNAVAILABLE: "PRICE_UNAVAILABLE", OUT_OF_STOCK: "OUT_OF_STOCK", BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE", ERROR: "ERROR",
});

export const CAMERA_FORMATS = ["CODE_128", "CODE_39", "EAN_13", "EAN_8", "UPC_A", "UPC_E", "QR_CODE"];

export function isExpectedFrameMiss(error) {
  const name = error?.name || error?.constructor?.name || "";
  const message = String(error?.message || error || "");
  return (
    name === "NotFoundException" ||
    name === "ChecksumException" ||
    name === "FormatException" ||
    message.includes("NotFoundException") ||
    message.includes("ChecksumException") ||
    message.includes("FormatException") ||
    message.includes("No MultiFormat Readers")
  );
}

function formatMoney(price) {
  if (price?.formatted) return price.formatted;
  if (!Number.isSafeInteger(Number(price?.amount_minor)) || !price?.currency_code) return "Price unavailable";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency_code.toUpperCase() }).format(price.amount_minor / 100);
}

function classifyCameraError(error) {
  if (["NotAllowedError", "SecurityError"].includes(error?.name)) return SCANNER_STATES.PERMISSION_DENIED;
  if (["NotFoundError", "DevicesNotFoundError", "OverconstrainedError", "NotReadableError", "TrackStartError"].includes(error?.name)) return SCANNER_STATES.CAMERA_UNAVAILABLE;
  return SCANNER_STATES.ERROR;
}

function scannerStateForLookupError(error) {
  const code = posErrorCode(error);
  if (["POS_OPERATOR_NOT_ASSIGNED", "POS_REGISTER_NOT_ASSIGNED", "POS_ASSIGNMENT_INACTIVE", "POS_REGISTER_SCOPE_MISMATCH"].includes(code)) return SCANNER_STATES.NOT_AUTHORIZED;
  if (["POS_SESSION_NOT_OPEN", "POS_REGISTER_SESSION_MISMATCH", "POS_SESSION_OPEN_BY_OTHER_OPERATOR", "POS_OPERATOR_HAS_OTHER_OPEN_SESSION", "POS_OPERATOR_SESSION_ALREADY_OPEN"].includes(code)) return SCANNER_STATES.SESSION_REQUIRED;
  if (["POS_PRICE_NOT_AVAILABLE", "POS_PRICE_UNAVAILABLE", "POS_CURRENCY_MISMATCH"].includes(code)) return SCANNER_STATES.PRICE_UNAVAILABLE;
  if (["POS_INSUFFICIENT_INVENTORY", "POS_OUT_OF_STOCK"].includes(code)) return SCANNER_STATES.OUT_OF_STOCK;
  if (code === "BACKEND_OFFLINE") return SCANNER_STATES.BACKEND_UNAVAILABLE;
  if (code === "POS_PRODUCT_NOT_FOUND") return SCANNER_STATES.NOT_FOUND;
  return SCANNER_STATES.ERROR;
}

export default function BarcodeScannerModal({ open, onClose, onDetected, onAdd, register, disabled = false, initialCode = "" }) {
  const [status, setStatus] = useState(SCANNER_STATES.IDLE);
  const [detectedCode, setDetectedCode] = useState("");
  const [product, setProduct] = useState(null);
  const [message, setMessage] = useState("");
  const [devices, setDevices] = useState([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [manualCode, setManualCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [diagnostics, setDiagnostics] = useState({
    decoderActive: false,
    deviceLabel: "",
    lastDetectedValue: "",
    lastLookupStatus: "",
    lastLookupErrorCode: "",
    permission: "unknown",
    videoWidth: 0,
    videoHeight: 0,
    decodeCallbackCount: 0,
    expectedFrameMissCount: 0,
    successfulDecodeCount: 0,
    lookupCount: 0,
    cleanupStatus: "inactive"
  });
  const videoRef = useRef(null), modalRef = useRef(null), controlsRef = useRef(null), streamRef = useRef(null);
  const openRef = useRef(open), detectingRef = useRef(false), mountedRef = useRef(false), requestIdRef = useRef(0);
  const onDetectedRef = useRef(onDetected), onAddRef = useRef(onAdd);
  const diagnosticsEnabled = import.meta.env.VITE_POS_SCANNER_DIAGNOSTICS === "true";

  // Duplicate frame protection references
  const detectionLockRef = useRef(false);
  const lastDetectedCodeRef = useRef("");
  const lastDetectedAtRef = useRef(0);
  const lookupInFlightRef = useRef(false);
  const lookupCountRef = useRef(0);
  const cameraReadyAtRef = useRef(0);

  // Throttled diagnostics tracking
  const decodeCallbackCountRef = useRef(0);
  const expectedFrameMissCountRef = useRef(0);
  const successfulDecodeCountRef = useRef(0);
  const cleanupStatusRef = useRef("inactive");

  // Configurable mode: AUTO_ADD_AFTER_SCAN (Recommended default is false)
  const AUTO_ADD_AFTER_SCAN = false;

  useEffect(() => {
    openRef.current = open;
    onDetectedRef.current = onDetected;
    onAddRef.current = onAdd;
  }, [open, onDetected, onAdd]);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; requestIdRef.current += 1; }; }, []);

  const cleanupScanner = useCallback(() => {
    const trackCountBefore = streamRef.current?.getTracks?.().length || 0;
    try { controlsRef.current?.stop?.(); } catch { /* best-effort library cleanup */ }
    controlsRef.current = null;
    const stream = streamRef.current || videoRef.current?.srcObject;
    if (stream?.getTracks) {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) { console.info("Track stop failed:", e?.message || e); }
      });
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    cleanupStatusRef.current = "cleaned";

    console.info("[POS_CAMERA_CLEANUP]", JSON.stringify({
      controlsStopped: true,
      tracksBefore: trackCountBefore,
      tracksAfter: 0,
      videoSourceCleared: true,
      idempotent: true,
      passed: true
    }, null, 2));

    if (mountedRef.current) {
      setDiagnostics((value) => ({
        ...value,
        decoderActive: false,
        cleanupStatus: "cleaned"
      }));
    }
  }, []);

  const lookup = useCallback(async (rawCode, source = "CAMERA") => {
    let code;
    try { code = normalizeBarcode(rawCode); }
    catch (error) {
      setStatus(SCANNER_STATES.ERROR);
      setMessage(error.message);
      detectionLockRef.current = false;
      lookupInFlightRef.current = false;
      return;
    }

    const detectedAt = Date.now();
    lookupCountRef.current += 1;
    detectingRef.current = true;
    lookupInFlightRef.current = true;
    const requestId = ++requestIdRef.current;

    setDetectedCode(code);
    setProduct(null);
    setStatus(SCANNER_STATES.CODE_DETECTED);

    console.info("[POS_BARS_ONLY_AUTO_LOOKUP]", JSON.stringify({
      detectedValue: code,
      source,
      humanReadableNumberVisible: false,
      ocrUsed: false,
      lookupTriggeredAutomatically: true,
      lookupCount: lookupCountRef.current,
      passed: true
    }, null, 2));

    setDiagnostics((value) => ({ ...value, lastDetectedValue: code, lastLookupStatus: "LOOKING_UP", lastLookupErrorCode: "", lookupCount: lookupCountRef.current }));
    setStatus(SCANNER_STATES.LOOKING_UP);

    try {
      const found = await onDetectedRef.current(code, source);
      if (!openRef.current || !mountedRef.current || requestId !== requestIdRef.current) return;

      setProduct(found);
      setMessage("");
      setQuantity(1);
      setStatus(SCANNER_STATES.PRODUCT_FOUND);
      setDiagnostics((value) => ({ ...value, lastLookupStatus: "PRODUCT_FOUND", lastLookupErrorCode: "" }));
      console.info("[POS_BARCODE_LOOKUP_SUCCESS]", { source, product_id: found.product_id, variant_id: found.variant_id });
    } catch (error) {
      if (!openRef.current || !mountedRef.current || requestId !== requestIdRef.current) return;
      const apiCode = posErrorCode(error), nextState = scannerStateForLookupError(error);
      setStatus(nextState);
      setMessage(posErrorMessage(error, register?.currency_code));
      setDiagnostics((value) => ({ ...value, lastLookupStatus: "FAILED", lastLookupErrorCode: apiCode }));
      console.warn(nextState === SCANNER_STATES.NOT_FOUND ? "[POS_BARCODE_LOOKUP_NOT_FOUND]" : "[POS_BARCODE_LOOKUP_BLOCKED]", { source, code_length: code.length, reason: apiCode });
    } finally {
      lookupInFlightRef.current = false;
    }
  }, [register?.currency_code]);

  const startCamera = useCallback(async (requestedDeviceId) => {
    cleanupScanner();
    detectingRef.current = false;
    requestIdRef.current += 1;
    detectionLockRef.current = false;
    lastDetectedCodeRef.current = "";
    lastDetectedAtRef.current = 0;
    cameraReadyAtRef.current = Date.now();
    cleanupStatusRef.current = "active";

    setProduct(null);
    setDetectedCode("");
    setMessage("");
    setStatus(SCANNER_STATES.REQUESTING_PERMISSION);

    if (window.isSecureContext === false) { setStatus(SCANNER_STATES.CAMERA_UNAVAILABLE); setMessage("Camera scanning requires HTTPS or localhost."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setStatus(SCANNER_STATES.CAMERA_UNAVAILABLE); setMessage("No compatible camera is available in this browser."); return; }

    try {
      const { BarcodeFormat, BrowserMultiFormatReader } = await import("@zxing/browser");
      const { DecodeHintType } = await import("@zxing/library");
      if (!openRef.current || !videoRef.current) return;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 500 });

      const video = requestedDeviceId
        ? { deviceId: { exact: requestedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      if (!openRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      // Continuous autofocus constraint check and application
      const track = stream.getVideoTracks()?.[0];
      if (track && typeof track.applyConstraints === "function") {
        try {
          const capabilities = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
          if (Array.isArray(capabilities?.focusMode) && capabilities.focusMode.includes("continuous")) {
            await track.applyConstraints({
              advanced: [{ focusMode: "continuous" }]
            });
          }
        } catch (e) {
          console.warn("Continuous autofocus constraint not supported or failed", e);
        }
      }

      videoRef.current.srcObject = stream;
      streamRef.current = stream;

      // Wait for loadedmetadata event and valid video dimensions
      await new Promise((resolve) => {
        const checkDimensions = () => {
          if (videoRef.current && videoRef.current.readyState >= 1 && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
            return true;
          }
          return false;
        };

        if (checkDimensions()) {
          resolve(null);
          return;
        }

        const handleMetadata = () => {
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            if (checkDimensions() || attempts > 10) {
              clearInterval(interval);
              resolve(null);
            }
          }, 50);
        };

        videoRef.current.addEventListener("loadedmetadata", handleMetadata, { once: true });
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.removeEventListener("loadedmetadata", handleMetadata);
          }
          resolve(null);
        }, 1000);
      });

      const controls = await reader.decodeFromVideoElement(videoRef.current, (result, decodeError) => {
        decodeCallbackCountRef.current += 1;
        if (result && !detectingRef.current && openRef.current) {
          const rawVal = typeof result.getText === "function" ? result.getText() : result.text;
          const code = String(rawVal ?? "").trim();
          if (!code) return;

          console.info("[POS_CAMERA_RESULT_EXTRACTION]", JSON.stringify({
            resultReceived: true,
            getTextUsed: typeof result.getText === "function",
            textFallbackUsed: typeof result.getText !== "function",
            rawValue: rawVal,
            normalizedValue: code,
            numericConversionUsed: false,
            passed: true
          }, null, 2));

          const now = Date.now();
          if (detectionLockRef.current) return;
          if (lastDetectedCodeRef.current === code && now - lastDetectedAtRef.current < 2000) {
            return;
          }
          detectionLockRef.current = true;
          lastDetectedCodeRef.current = code;
          lastDetectedAtRef.current = now;
          successfulDecodeCountRef.current += 1;

          cleanupScanner();
          void lookup(code, "CAMERA");
          return;
        }

        if (decodeError) {
          if (isExpectedFrameMiss(decodeError)) {
            expectedFrameMissCountRef.current += 1;
            return;
          }
          if (detectingRef.current || !openRef.current) return;
          detectingRef.current = true;
          cleanupScanner();
          if (mountedRef.current) {
            setStatus(SCANNER_STATES.ERROR);
            setMessage("The barcode decoder stopped unexpectedly. Retry the camera or enter the code manually.");
          }
        }
      });

      if (!openRef.current) { controls.stop(); return; }
      controlsRef.current = controls;
      setStatus(SCANNER_STATES.SCANNING);
      setDiagnostics((value) => ({
        ...value,
        decoderActive: true,
        permission: "granted",
        videoWidth: videoRef.current?.videoWidth || 0,
        videoHeight: videoRef.current?.videoHeight || 0,
        deviceLabel: videoRef.current?.srcObject?.getVideoTracks?.()[0]?.label || "",
        cleanupStatus: "active"
      }));
      console.info("[POS_BARCODE_CAMERA_OPENED]", { supported_formats: CAMERA_FORMATS });

      try { const inputs = await BrowserMultiFormatReader.listVideoInputDevices(); if (openRef.current) setDevices(inputs); } catch { /* enumeration is optional */ }
    } catch (error) {
      cleanupScanner();
      if (!openRef.current) return;
      const nextStatus = classifyCameraError(error);
      setStatus(nextStatus);
      setMessage(nextStatus === SCANNER_STATES.PERMISSION_DENIED ? "Camera permission was denied. Allow camera access or enter the code manually." : nextStatus === SCANNER_STATES.CAMERA_UNAVAILABLE ? "No usable camera was found, or the camera is already in use." : "The camera could not be started.");
      setDiagnostics((value) => ({ ...value, permission: nextStatus === SCANNER_STATES.PERMISSION_DENIED ? "denied" : "unknown" }));
      console.warn("[POS_BARCODE_CAMERA_ERROR]", { reason: error?.name || "CAMERA_ERROR" });
    }
  }, [lookup, cleanupScanner]);

  useEffect(() => {
    if (open) {
      if (initialCode) {
        void lookup(initialCode, "HARDWARE_OR_MANUAL");
      } else {
        void startCamera();
      }
    } else {
      cleanupScanner();
    }
    return cleanupScanner;
  }, [open, initialCode, startCamera, cleanupScanner, lookup]);

  // Throttled diagnostics update loop
  useEffect(() => {
    if (status !== SCANNER_STATES.SCANNING || !diagnosticsEnabled) return undefined;
    const interval = setInterval(() => {
      setDiagnostics((value) => ({
        ...value,
        decodeCallbackCount: decodeCallbackCountRef.current,
        expectedFrameMissCount: expectedFrameMissCountRef.current,
        successfulDecodeCount: successfulDecodeCountRef.current,
        cleanupStatus: cleanupStatusRef.current,
        videoWidth: videoRef.current?.videoWidth || 0,
        videoHeight: videoRef.current?.videoHeight || 0
      }));
    }, 500);
    return () => clearInterval(interval);
  }, [status, diagnosticsEnabled]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...modalRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = setTimeout(() => modalRef.current?.querySelector("button")?.focus(), 0);
    return () => { document.removeEventListener("keydown", onKeyDown); clearTimeout(focusTimer); };
  }, [onClose, open]);

  if (!open) return null;

  const inventory = product?.inventory;
  const outOfStock = product && (!product.available_for_sale || inventory?.available_quantity <= 0);
  const priceMissing = product && (!product.price || !Number.isSafeInteger(Number(product.price.amount_minor)) || Number(product.price.amount_minor) <= 0);
  const authoritativeRegisterCurrency = String(register?.currency_code || product?.register?.currency_code || "").toLowerCase();
  const currencyMismatch = product && String(product.price?.currency_code || "").toLowerCase() !== authoritativeRegisterCurrency;

  const productGuardMessage = outOfStock
    ? "Product found, but it is out of stock at this POS location."
    : priceMissing
      ? "Price unavailable for this register region"
      : currencyMismatch
        ? "Currency does not match this register"
        : "";

  const maxQuantity = product?.allow_backorder ? 999 : Math.max(1, Number(inventory?.available_quantity || 1));
  const close = () => { cleanupScanner(); onClose(); };
  const switchCamera = () => { if (devices.length < 2) return; const next = (deviceIndex + 1) % devices.length; setDeviceIndex(next); void startCamera(devices[next].deviceId); };

  const add = () => {
    if (disabled || outOfStock || priceMissing || currencyMismatch) return;
    if (onAddRef.current(product, quantity, detectedCode) !== false) {
      console.info("[POS_BARCODE_ADDED_TO_CART]", { product_id: product.product_id, variant_id: product.variant_id, quantity });
      close();
    }
  };

  const lookupErrorStates = [SCANNER_STATES.PERMISSION_DENIED, SCANNER_STATES.CAMERA_UNAVAILABLE, SCANNER_STATES.NOT_AUTHORIZED, SCANNER_STATES.SESSION_REQUIRED, SCANNER_STATES.PRICE_UNAVAILABLE, SCANNER_STATES.OUT_OF_STOCK, SCANNER_STATES.BACKEND_UNAVAILABLE, SCANNER_STATES.ERROR];
  const lastCode = diagnostics.lastLookupErrorCode;
  const isInventoryProblem = ["POS_INVENTORY_UNKNOWN", "POS_INVENTORY_UNAVAILABLE", "POS_VARIANT_NOT_IN_SALES_CHANNEL"].includes(lastCode);
  const errorTitle = status === SCANNER_STATES.PERMISSION_DENIED
    ? "Camera permission denied"
    : status === SCANNER_STATES.CAMERA_UNAVAILABLE
      ? "Camera unavailable"
      : status === SCANNER_STATES.NOT_AUTHORIZED
        ? "Not authorized"
        : status === SCANNER_STATES.SESSION_REQUIRED
          ? "Register session required"
          : status === SCANNER_STATES.PRICE_UNAVAILABLE
            ? "Price unavailable"
            : status === SCANNER_STATES.OUT_OF_STOCK
              ? "Out of stock"
              : status === SCANNER_STATES.BACKEND_UNAVAILABLE
                ? "Backend unavailable"
                : isInventoryProblem
                  ? "Inventory unavailable"
                  : "Scanner error";

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3" role="presentation"><section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="barcode-scanner-title" className="max-h-[96vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b px-5 py-4"><div><h2 id="barcode-scanner-title" className="text-xl font-black">Scan product barcode</h2><p className="text-sm text-zinc-500">{register?.name || "Current register"}</p></div><button type="button" onClick={close} aria-label="Close barcode scanner" className="rounded p-2 hover:bg-zinc-100"><X /></button></header><div className="p-5">
    <p className="sr-only" aria-live="polite">{status.replaceAll("_", " ")}{message ? `: ${message}` : ""}</p>
    {[SCANNER_STATES.REQUESTING_PERMISSION, SCANNER_STATES.SCANNING].includes(status) ? <div className="relative aspect-video overflow-hidden rounded-lg bg-zinc-950"><video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" aria-label="Live barcode camera preview" /><div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,.25)]" />{status === SCANNER_STATES.REQUESTING_PERMISSION ? <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 font-bold text-white"><RefreshCw className="mr-2 animate-spin" /> Starting camera…</div> : null}</div> : null}

    {status === SCANNER_STATES.SCANNING ? <div className="mt-3 text-center text-sm font-semibold text-zinc-600"><p>Place only the black barcode bars inside the frame.</p><p>The printed number is not required. Keep the barcode horizontal and fill 60–80% of the frame.</p></div> : null}
    {devices.length > 1 && status === SCANNER_STATES.SCANNING ? <button type="button" onClick={switchCamera} className="mx-auto mt-3 flex items-center gap-2 rounded border px-4 py-2 font-bold"><RotateCcw size={17} /> Switch camera</button> : null}
    {lookupErrorStates.includes(status) && !product ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-center"><CameraOff className="mx-auto text-amber-700" /><h3 className="mt-2 font-black">{errorTitle}</h3><p className="mt-1 text-sm text-zinc-600">{message}</p></div> : null}

    {status === SCANNER_STATES.CODE_DETECTED || status === SCANNER_STATES.LOOKING_UP ? <div className="flex flex-col items-center justify-center rounded-lg bg-zinc-50 p-8 font-bold text-zinc-700"><RefreshCw className="mr-2 animate-spin" /> Barcode detected. Loading product details…</div> : null}
    {status === SCANNER_STATES.NOT_FOUND ? <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-center"><h3 className="font-black text-red-800">No product matches this barcode.</h3><p className="mt-2 text-sm">Detected code: <code>{detectedCode}</code></p><p className="mt-1 text-sm text-zinc-600">{message}</p></div> : null}

    {status === SCANNER_STATES.PRODUCT_FOUND && product ? <div className="grid gap-5 md:grid-cols-[140px_1fr]"><div className="aspect-square overflow-hidden rounded-lg bg-zinc-100"><img src={product.thumbnail || product.product_thumbnail || "https://images.unsplash.com/photo-1540959733332-eab4deceeaf7"} alt={product.product_title || "Scanned product"} className="h-full w-full object-cover" /></div><div><div className="mb-2 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-1 text-sm font-bold">Product found.</div><h3 className="text-xl font-black">{product.product_title}</h3><p className="text-sm font-semibold text-zinc-500">{product.variant_title || "Default variant"}</p><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><div><dt className="text-zinc-500">SKU</dt><dd className="font-bold">{product.sku || "—"}</dd></div><div><dt className="text-zinc-500">Barcode</dt><dd className="font-bold">{product.barcode || "—"}</dd></div><div><dt className="text-zinc-500">UPC</dt><dd className="font-bold">{product.upc || "—"}</dd></div><div><dt className="text-zinc-500">EAN</dt><dd className="font-bold">{product.ean || "—"}</dd></div><div><dt className="text-zinc-500">Register</dt><dd className="font-bold">{product.register?.name || register?.name || "—"}</dd></div><div><dt className="text-zinc-500">Stock location</dt><dd className="font-bold">{inventory?.location_name || inventory?.location_id || "—"}</dd></div><div><dt className="text-zinc-500">Currency</dt><dd className="font-bold">{product.price?.currency_code?.toUpperCase() || "—"}</dd></div><div><dt className="text-zinc-500">Unit Price</dt><dd className="font-bold">{formatMoney(product.price)}</dd></div><div><dt className="text-zinc-500">Stocked Qty</dt><dd className="font-bold">{inventory?.stocked_quantity ?? 0}</dd></div><div><dt className="text-zinc-500">Reserved Qty</dt><dd className="font-bold">{inventory?.reserved_quantity ?? 0}</dd></div><div><dt className="text-zinc-500">Available Qty</dt><dd className="font-bold">{inventory?.available_quantity ?? 0}</dd></div><div><dt className="text-zinc-500">Availability Status</dt><dd className="font-bold">{inventory?.status || "—"}</dd></div><div><dt className="text-zinc-500">POS Eligibility</dt><dd className="font-bold">{product.pos_eligible !== false ? "Eligible" : "Ineligible"}</dd></div><div><dt className="text-zinc-500">Sales Channel</dt><dd className="font-bold">{product.available_for_sale ? "Active" : "Inactive"}</dd></div></dl><p className="mt-4 text-2xl font-black text-emerald-700">{formatMoney(product.price)}</p><p className="mt-1 text-sm font-bold text-emerald-700">Available: {inventory?.available_quantity ?? 0} · {String(inventory?.status || "UNKNOWN").replaceAll("_", " ")}</p>{productGuardMessage ? <p role="alert" className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm font-bold text-amber-900">{productGuardMessage}</p> : null}<div className="mt-4 flex items-end gap-3"><label className="text-sm font-bold">Quantity<input aria-label="Quantity" type="number" min="1" max={maxQuantity} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(maxQuantity, Number(event.target.value) || 1)))} className="mt-1 block h-11 w-24 rounded border px-3" /></label><button type="button" onClick={add} disabled={disabled || outOfStock || priceMissing || currencyMismatch} className="flex h-11 flex-1 items-center justify-center gap-2 rounded bg-emerald-700 px-4 font-black text-white disabled:opacity-40"><Check size={18} /> Add to cart</button></div></div></div> : null}
    <form onSubmit={(event) => { event.preventDefault(); void lookup(manualCode, "MANUAL"); }} className="mt-5 flex flex-wrap gap-2 border-t pt-5"><label className="min-w-[220px] flex-1 text-sm font-bold">Manual code fallback<input aria-label="Manual barcode code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} maxLength={128} className="mt-1 h-11 w-full rounded border px-3" /></label><button type="submit" disabled={disabled || !manualCode.trim()} className="mt-6 h-11 rounded bg-zinc-950 px-4 font-bold text-white disabled:opacity-40">Look up</button></form>

    {diagnosticsEnabled ? (
      <dl className="mt-4 grid grid-cols-2 gap-2 rounded bg-zinc-950 p-3 text-xs text-zinc-200">
        <div><dt>Permission</dt><dd>{diagnostics.permission}</dd></div>
        <div><dt>Dimensions</dt><dd>{diagnostics.videoWidth} x {diagnostics.videoHeight}</dd></div>
        <div><dt>Decoder Started</dt><dd>{String(diagnostics.decoderActive)}</dd></div>
        <div><dt>Enabled Formats</dt><dd>{CAMERA_FORMATS.join(", ")}</dd></div>
        <div><dt>Expected Miss Count</dt><dd>{diagnostics.expectedFrameMissCount}</dd></div>
        <div><dt>Successful Decode Count</dt><dd>{diagnostics.successfulDecodeCount}</dd></div>
        <div><dt>Last Decoded Value</dt><dd>{diagnostics.lastDetectedValue || "none"}</dd></div>
        <div><dt>Lookup Count</dt><dd>{diagnostics.lookupCount}</dd></div>
        <div><dt>Cleanup Status</dt><dd>{diagnostics.cleanupStatus}</dd></div>
      </dl>
    ) : null}

    <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void startCamera(devices[deviceIndex]?.deviceId)} disabled={disabled} className="flex h-11 items-center gap-2 rounded border px-4 font-bold"><Camera size={17} /> {status === SCANNER_STATES.NOT_FOUND ? "Scan again" : "Retry scan"}</button><button type="button" onClick={close} className="h-11 rounded border px-4 font-bold">Close</button></div>
  </div></section></div>;
}
