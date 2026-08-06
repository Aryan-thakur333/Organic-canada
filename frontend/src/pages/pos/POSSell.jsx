import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import POSShell from "../../components/pos/POSShell";
import POSBarcodeInput from "../../components/pos/POSBarcodeInput";
import POSProductSearch from "../../components/pos/POSProductSearch";
import POSCart from "../../components/pos/POSCart";
import POSCustomerSelector from "../../components/pos/POSCustomerSelector";
import POSPaymentPanel from "../../components/pos/POSPaymentPanel";
import POSReceipt from "../../components/pos/POSReceipt";
import BarcodeScannerModal from "../../components/pos/BarcodeScannerModal";
import { posApi } from "../../services/posApi";
import { normalizeBarcode } from "../../lib/pos/barcode";
import { posErrorCode, posErrorMessage } from "../../lib/pos/errors";
import { listPosOfflineDrafts, savePosOfflineDraft, validateAndUploadPosOfflineDraft } from "../../services/posOfflineDrafts";
import { addPosItem, clearPosCart, removePosItem, selectPosSubtotal, setDiscountCode, setLastPosOrder, setPaymentMethod, setPosCustomer, setPosNote, setPosRegister, setPosSession, updatePosQty } from "../../redux/posSlice";
import { usePOS } from "../../contexts/usePOS";

const normalizeItem = (item) => ({ ...item, title: item.product_title, unit_price: item.price.amount_minor, currency_code: item.price.currency_code, inventory_detail: item.inventory, inventory: item.inventory.available_quantity });
const majorToMinor = (value, currency) => {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{0,2})?$/.test(text)) throw new Error(`${currency} tendered amount must use up to two decimal places.`);
  return Math.round(Number(text) * 100);
};

export default function POSSell() {
  const [scanLoading, setScanLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [initialScanCode, setInitialScanCode] = useState("");
  const [scanMode, setScanMode] = useState(() => localStorage.getItem("pos_scan_mode") || "BOTH");
  const [barcodeFocusSignal, setBarcodeFocusSignal] = useState(0);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [tendered, setTendered] = useState("");
  const [terminalReference, setTerminalReference] = useState("");
  const [authorizationReference, setAuthorizationReference] = useState("");
  const [authoritativeTotal, setAuthoritativeTotal] = useState(null);
  const [sessionMismatchMessage, setSessionMismatchMessage] = useState("");
  const lookupRef = useRef(null);
  const mountedRef = useRef(true);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const changeScanMode = (mode) => {
    setScanMode(mode);
    localStorage.setItem("pos_scan_mode", mode);
  };

  // CHECKPOINT 2: Route param is the SOLE authoritative register ID.
  // Never fall back to pos.register?.id — that would re-introduce the stale-Canada bug.
  const { registerId } = useParams();
  const posRuntime = usePOS();

  const pos = useSelector((state) => state.pos);
  const subtotal = useSelector(selectPosSubtotal);
  const activeSessionRegisterId = posRuntime.session?.register_id || "";
  const routeMatchesActiveSession = Boolean(registerId && activeSessionRegisterId && registerId === activeSessionRegisterId);

  // Session is authoritative. The URL must match the active session before selling.
  const sessionReady = Boolean(
    routeMatchesActiveSession &&
    posRuntime.status === "READY_SESSION" &&
    posRuntime.session?.id &&
    posRuntime.session.operator_id === posRuntime.operator?.id &&
    activeSessionRegisterId
  );

  useEffect(() => () => {
    mountedRef.current = false;
    lookupRef.current?.controller?.abort();
  }, []);

  // If route has no registerId (shouldn't happen with router config), redirect.
  useEffect(() => { if (!registerId) navigate("/pos/register-select", { replace: true }); }, [navigate, registerId]);

  useEffect(() => {
    if (["READY_NO_SESSION", "EMPTY_ASSIGNMENTS"].includes(posRuntime.status)) {
      navigate("/pos/register-select", { replace: true, state: { message: "Open a register session before selling." } });
      return;
    }
    if (posRuntime.status === "READY_SESSION" && posRuntime.session?.register_id && registerId !== posRuntime.session.register_id) {
      setSessionMismatchMessage("Your active POS session belongs to another register.");
      navigate(`/pos/register/${posRuntime.session.register_id}`, { replace: true });
    }
  }, [navigate, posRuntime.session?.register_id, posRuntime.status, registerId]);

  useEffect(() => {
    const reconnect = async () => {
      if (!navigator.onLine || !activeSessionRegisterId) return;
      for (const draft of listPosOfflineDrafts().filter((entry) => entry.register_id === activeSessionRegisterId && ["LOCAL_ONLY", "UNKNOWN_RESPONSE"].includes(entry.sync_status))) {
        try {
          const synced = await validateAndUploadPosOfflineDraft(draft, posApi);
          toast(synced.price_changes.length ? "Offline draft revalidated; review changed prices before payment" : "Offline draft is validated online and ready for operator review");
        } catch { /* retain the local draft for authenticated retry */ }
      }
    };
    window.addEventListener("online", reconnect);
    reconnect();
    return () => window.removeEventListener("online", reconnect);
  }, [activeSessionRegisterId]);

  const addItem = useCallback((raw, quantity = 1) => {
    if (!raw?.price || !Number.isSafeInteger(Number(raw.price.amount_minor)) || Number(raw.price.amount_minor) <= 0) {
      toast.error("Price unavailable for this register region");
      console.warn("[POS_BARCODE_LOOKUP_BLOCKED]", { reason: "PRICE_UNAVAILABLE", variant_id: raw?.variant_id });
      return false;
    }
    const registerCurrency = String(pos.register?.currency_code || "").toLowerCase();
    if (String(raw.price.currency_code || "").toLowerCase() !== registerCurrency) {
      toast.error("Product currency does not match this register");
      console.warn("[POS_BARCODE_LOOKUP_BLOCKED]", { reason: "CURRENCY_MISMATCH", variant_id: raw.variant_id });
      return false;
    }
    const item = normalizeItem(raw);
    const requested = Math.max(1, Number(quantity || 1));
    const existing = pos.items.find((line) => line.variant_id === item.variant_id);
    const resultingQuantity = Number(existing?.quantity || 0) + requested;
    if (!item.allow_backorder && resultingQuantity > Number(item.inventory || 0)) {
      toast.error(item.inventory <= 0 ? "Item is out of stock at this register" : `Only ${item.inventory} available at this register`);
      return false;
    }
    dispatch(addPosItem({ ...item, quantity: requested }));
    toast.success("Added to cart");
    return true;
  }, [dispatch, pos.items, pos.register?.currency_code]);

  // lookupAndHandleBarcode always uses the authoritative active session register ID.
  // It never reads from selectedRegister, stale route state, or localStorage.
  const lookupAndHandleBarcode = useCallback(async (rawCode, sourceOrOptions = "MANUAL_TOP_INPUT", maybeOptions = {}) => {
    let source = "MANUAL_TOP_INPUT";
    let regId = activeSessionRegisterId;
    let autoAdd = true;

    if (typeof sourceOrOptions === "object" && sourceOrOptions !== null) {
      source = sourceOrOptions.source || "MANUAL_TOP_INPUT";
      autoAdd = sourceOrOptions.autoAdd !== false;
    } else {
      source = sourceOrOptions;
      autoAdd = maybeOptions.autoAdd !== false;
    }

    const code = normalizeBarcode(rawCode);
    if (!sessionReady) throw Object.assign(new Error("Open the register session before scanning products."), { code: "POS_SESSION_NOT_OPEN" });
    if (lookupRef.current) throw Object.assign(new Error("A barcode lookup is already in progress."), { code: "POS_LOOKUP_IN_PROGRESS" });
    const controller = new AbortController();
    const request = { controller, code, source };
    lookupRef.current = request;
    setScanLoading(true);
    try {
      // CHECKPOINT 6: Development log per spec — no tokens logged.
      console.info("[POS_BARCODE_LOOKUP_STARTED]", {
        code,
        registerId: regId,
        source,
      });
      // register_id is always the active session register, never stale storage.
      const product = await posApi.scan(code, regId, { signal: controller.signal });
      if (autoAdd && !addItem(product, 1)) throw new Error("Product cannot be added at this register");
      console.info("[POS_BARCODE_LOOKUP_COMPLETED]", { source, product_id: product.product_id, variant_id: product.variant_id });

      if (source === "CAMERA") {
        console.info("[POS_CAMERA_AUTO_LOOKUP]", JSON.stringify({
          detectedValue: code,
          registerId: regId,
          source: "CAMERA",
          automatic: true,
          lookupCount: 1,
          httpStatus: 200,
          productFound: true,
          passed: true
        }, null, 2));
      }

      return product;
    } catch (error) {
      // CHECKPOINT 9: Expose 409 / 403 with correct messages instead of hiding them.
      const errCode = posErrorCode(error);
      if (errCode === "POS_OPERATOR_HAS_OTHER_OPEN_SESSION" || errCode === "POS_OPERATOR_SESSION_ALREADY_OPEN") {
        toast.error("You already have an open session on another register.");
      } else if (errCode === "POS_REGISTER_SESSION_MISMATCH") {
        toast.error("Your active POS session belongs to another register.");
      } else if (errCode === "POS_OPERATOR_NOT_ASSIGNED" || errCode === "POS_REGISTER_NOT_ASSIGNED") {
        const registerName = pos.register?.name;
        toast.error(registerName ? `You are not assigned to the selected register (${registerName}).` : "You are not assigned to the selected register.");
      }
      console.warn("[POS_BARCODE_LOOKUP_FAILED]", { source, code_length: code.length, error_code: errCode });

      if (source === "CAMERA") {
        console.info("[POS_CAMERA_AUTO_LOOKUP]", JSON.stringify({
          detectedValue: code,
          registerId: regId,
          source: "CAMERA",
          automatic: true,
          lookupCount: 1,
          httpStatus: error?.status || error?.response?.status || 500,
          productFound: false,
          passed: false
        }, null, 2));
      }

      throw error;
    } finally {
      if (lookupRef.current === request) lookupRef.current = null;
      if (mountedRef.current) setScanLoading(false);
    }
  }, [activeSessionRegisterId, addItem, sessionReady, pos.register?.name]);

  const scan = useCallback(async (code, source = "MANUAL_TOP_INPUT") => {
    if (!sessionReady) {
      toast.error("Open the register session before scanning products.");
      return;
    }
    setInitialScanCode(code);
    setScannerOpen(true);
  }, [sessionReady]);
  const lookupBarcodeForModal = useCallback((code, source) => lookupAndHandleBarcode(code, { source, autoAdd: false }), [lookupAndHandleBarcode]);
  const closeScanner = useCallback(() => {
    lookupRef.current?.controller?.abort();
    lookupRef.current = null;
    setScanLoading(false);
    setScannerOpen(false);
    setInitialScanCode("");
    setBarcodeFocusSignal((value) => value + 1);
  }, []);

  const checkout = async () => {
    setCheckoutLoading(true);
    let offlineIdentity = null;
    try {
      let activeRegisterId = activeSessionRegisterId;
      if (!activeRegisterId) throw new Error("Open the register session before checkout.");
      const clientUuid = crypto.randomUUID();
      const idempotencyKey = `pos-checkout:${clientUuid}`;
      offlineIdentity = { client_uuid: clientUuid, idempotency_key: idempotencyKey };
      // Cart always carries the authoritative active session register ID.
      let cart;
      try {
        ({ cart } = await posApi.createCart({ register_id: activeRegisterId, client_uuid: clientUuid, idempotency_key: idempotencyKey }));
      } catch (cartError) {
        const code = cartError?.response?.data?.code;
        if (!["POS_REGISTER_SESSION_REQUIRED", "POS_REGISTER_SESSION_MISMATCH"].includes(code)) throw cartError;
        const refreshed = await posRuntime.refreshBootstrap();
        if (!refreshed?.session?.register_id) {
          dispatch(clearPosCart());
          navigate("/pos/register-select", { replace: true, state: { message: "Your register session is no longer active. Select or reopen a register." } });
          return;
        }
        activeRegisterId = refreshed.session.register_id;
        ({ cart } = await posApi.createCart({ register_id: activeRegisterId, client_uuid: clientUuid, idempotency_key: idempotencyKey }));
      }
      await posApi.updateCart(cart.id, { items: pos.items.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity, last_known_price_minor: item.unit_price, last_known_inventory: item.inventory })), customer_id: pos.customer?.id || null, guest_email: pos.customer?.email || null, notes: pos.note || null, fulfillment_type: "IMMEDIATE_CARRYOUT" });
      if (pos.discountCode) await posApi.applyPromotion(cart.id, pos.discountCode);
      const submit = async (confirmedTotal) => {
        const tenderedMinor = pos.paymentMethod === "CASH" && tendered.trim() ? majorToMinor(tendered, String(pos.register?.currency_code || "CAD").toUpperCase()) : confirmedTotal;
        if (pos.paymentMethod === "CASH" && tenderedMinor < confirmedTotal) throw new Error("Cash tendered is less than the amount due");
        const payments = pos.paymentMethod === "CASH"
          ? [{ method: "CASH", amount_minor: confirmedTotal, amount_tendered_minor: tenderedMinor }]
          : [{ method: "CARD_MANUAL", amount_minor: confirmedTotal, terminal_reference: terminalReference, authorization_reference: authorizationReference }];
        return posApi.checkout(cart.id, { idempotency_key: idempotencyKey, confirmed_total_minor: confirmedTotal, payments, fulfillment_type: "IMMEDIATE_CARRYOUT" }, idempotencyKey);
      };
      let data;
      try {
        data = await submit(authoritativeTotal ?? subtotal);
      } catch (error) {
        const response = error.response?.data;
        if (response?.code !== "POS_TOTAL_CHANGED" || !response.native_cart) throw error;
        const nativeTotal = Number(response.native_cart.total_minor);
        setAuthoritativeTotal(nativeTotal);
        const currency = String(response.native_cart.currency_code || pos.register?.currency_code || "CAD").toUpperCase();
        const approved = window.confirm(`The server recalculated this sale to ${new Intl.NumberFormat(undefined, { style: "currency", currency }).format(nativeTotal / 100)} including native tax and promotions. Continue?`);
        if (!approved) throw new Error("Checkout canceled because the recalculated total was not approved");
        if (pos.paymentMethod === "CASH" && tendered.trim() && majorToMinor(tendered, currency) < nativeTotal) throw new Error("Cash tendered is less than the recalculated total");
        data = await submit(nativeTotal);
      }
      dispatch(setLastPosOrder(data));
      setReceiptOpen(true);
      toast.success("Sale completed");
    } catch (error) {
      if (!error.response && offlineIdentity && pos.register && pos.session && pos.staff) {
        savePosOfflineDraft({ ...offlineIdentity, register_id: activeSessionRegisterId, session_id: pos.session.id, operator_id: pos.staff.id, region_id: pos.register.region_id, currency_code: pos.register.currency_code, items: pos.items, sync_status: "UNKNOWN_RESPONSE" });
        toast.error("Connection lost. No offline payment was recorded; the draft is retained with the same idempotency key for online review.");
      } else toast.error(error.response?.data?.message || error.message || "Unable to complete sale");
    }
    finally { setCheckoutLoading(false); }
  };

  const newSale = () => { setReceiptOpen(false); setTendered(""); setTerminalReference(""); setAuthorizationReference(""); setAuthoritativeTotal(null); dispatch(clearPosCart()); };

  return <POSShell>
    {!sessionReady ? (
      <div role="alert" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-center font-bold text-amber-900">{sessionMismatchMessage || "Register closed. Open a valid register session before scanning or checkout."}</div>
    ) : (
      <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 flex flex-wrap items-center justify-between text-sm font-bold text-emerald-800">
        <span>Register session ready</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-500">Scan Mode:</span>
          <select
            value={scanMode}
            onChange={(e) => changeScanMode(e.target.value)}
            className="rounded border bg-white px-2 py-1 text-xs font-semibold outline-none focus:border-emerald-700"
          >
            <option value="BOTH">Both (Camera & Hardware)</option>
            <option value="CAMERA">Camera Only</option>
            <option value="HARDWARE">Hardware Only</option>
          </select>
        </div>
      </div>
    )}
    <div className="grid min-h-[calc(100vh-73px)] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-6">
      <section className="flex min-h-0 flex-col gap-4">
        <POSBarcodeInput onScan={scan} onOpenCamera={() => setScannerOpen(true)} loading={!sessionReady || scanLoading || scannerOpen} focusSignal={barcodeFocusSignal} scanMode={scanMode} />
        <POSProductSearch registerId={activeSessionRegisterId} onAdd={addItem} />
      </section>
      <aside className="flex min-h-0 flex-col gap-4">
        <POSCart items={pos.items} subtotal={subtotal} onRemove={(id) => dispatch(removePosItem(id))} onQty={(id, quantity) => dispatch(updatePosQty({ variant_id: id, quantity }))} />
        <POSCustomerSelector registerId={activeSessionRegisterId} customer={pos.customer} onSelect={(customer) => dispatch(setPosCustomer(customer))} />
        <POSPaymentPanel method={pos.paymentMethod} onMethod={(method) => dispatch(setPaymentMethod(method))} discountCode={pos.discountCode} onDiscountCode={(code) => dispatch(setDiscountCode(code))} note={pos.note} onNote={(note) => dispatch(setPosNote(note))} tendered={tendered} onTendered={setTendered} terminalReference={terminalReference} onTerminalReference={setTerminalReference} authorizationReference={authorizationReference} onAuthorizationReference={setAuthorizationReference} currencyCode={pos.register?.currency_code} amountDueMinor={authoritativeTotal ?? subtotal} disabled={!sessionReady || !pos.items.length} loading={checkoutLoading} onCheckout={checkout} />
      </aside>
    </div>
    <BarcodeScannerModal open={scannerOpen} onClose={closeScanner} onDetected={lookupBarcodeForModal} onAdd={addItem} register={pos.register} disabled={!sessionReady} initialCode={initialScanCode} />
    <POSReceipt receipt={receiptOpen ? pos.lastReceipt : null} transaction={pos.lastOrder} onClose={() => setReceiptOpen(false)} onNewSale={newSale} />
  </POSShell>;
}
