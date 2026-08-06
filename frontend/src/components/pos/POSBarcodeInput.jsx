import { useEffect, useRef, useState } from "react";
import { Camera, ScanBarcode } from "lucide-react";
import useBarcodeScanner from "../../hooks/useBarcodeScanner";
import { normalizeBarcode } from "../../lib/pos/barcode";

export default function POSBarcodeInput({ onScan, onOpenCamera, loading, focusSignal = 0, scanMode = "BOTH" }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusSignal]);

  useBarcodeScanner({ onScan: (code) => onScan(code, "HARDWARE_SCANNER"), enabled: !loading && scanMode !== "CAMERA" });

  const submit = (event) => {
    event.preventDefault();
    let code;
    // Read the live control value at submit time. Hardware scanners and browser
    // automation can update the native input before React flushes onChange.
    try { code = normalizeBarcode(inputRef.current?.value ?? value); }
    catch { return; }
    Promise.resolve(onScan(code, "MANUAL_TOP_INPUT")).finally(() => inputRef.current?.focus());
    setValue("");
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2">
      <div className="relative flex-1">
        <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
        <input
          ref={inputRef}
          data-pos-barcode-input="true"
          aria-label="Barcode, SKU, EAN, or UPC"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Scan barcode, SKU, EAN, or UPC"
          className="h-14 w-full rounded border border-zinc-300 bg-white pl-11 pr-3 text-base font-semibold outline-none focus:border-emerald-700"
        />
      </div>
      <button type="button" onClick={submit} disabled={loading} className="h-14 rounded bg-zinc-950 px-5 font-bold text-white disabled:opacity-50">
        Enter
      </button>
      {scanMode !== "HARDWARE" && (
        <button type="button" aria-label="Scan Barcode with camera" disabled={loading} onClick={onOpenCamera} className="flex h-14 items-center gap-2 rounded bg-emerald-700 px-5 font-bold text-white disabled:opacity-50">
          <Camera size={19} /> Scan Barcode
        </button>
      )}
    </form>
  );
}
