import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { posApi } from "../../services/posApi";
import { usePOS } from "../../contexts/usePOS";

const POS_SESSION_ALREADY_OPEN = "POS_OPERATOR_SESSION_ALREADY_OPEN";
const currencyCode = (register) => String(register?.currency_code || "usd").toUpperCase();
const minorToMajor = (value) => (Number(value || 0) / 100).toFixed(2);
const majorToMinor = (value, currency) => {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{0,2})?$/.test(text)) throw new Error(`${currency} cash amount must be a non-negative value with up to two decimals.`);
  return Math.round(Number(text || "0") * 100);
};

export default function POSRegisterSelect() {
  const { status, operator, registers, session, activeRegister, error, refreshBootstrap, clearRuntime } = usePOS();
  const [targetRegister, setTargetRegister] = useState(null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState("");
  const [openingCashMajor, setOpeningCashMajor] = useState("0.00");
  const [closingCashMajor, setClosingCashMajor] = useState("0.00");
  const navigate = useNavigate();
  const location = useLocation();
  const currentRegister = useMemo(() => registers.find((register) => register.id === session?.register_id) || activeRegister || null, [activeRegister, registers, session?.register_id]);
  const isLoading = status === "BOOTSTRAP_LOADING" || status === "IDLE";

  const closeModal = () => {
    if (busy) return;
    setModal(null);
    setTargetRegister(null);
  };
  const resume = (bootstrap) => {
    const registerId = bootstrap?.session?.register_id || session?.register_id;
    if (registerId) navigate(`/pos/register/${registerId}`);
  };
  const refresh = async () => {
    try { await refreshBootstrap(); } catch (refreshError) { toast.error(refreshError?.response?.data?.message || refreshError.message || "Unable to refresh POS assignments."); }
  };
  const openRegister = async (register) => {
    setBusy(register.id);
    try {
      await posApi.openRegister(register.id, majorToMinor(openingCashMajor, currencyCode(register)));
      const bootstrap = await refreshBootstrap();
      setModal(null);
      setTargetRegister(null);
      resume(bootstrap);
    } catch (openError) {
      const data = openError?.response?.data || {};
      if (openError?.response?.status === 409 && data.code === POS_SESSION_ALREADY_OPEN) {
        await refresh();
        setClosingCashMajor(minorToMajor(session?.expected_cash_minor));
        setModal("switch");
        return;
      }
      toast.error(data.message || openError.message || "Unable to open register.");
    } finally { setBusy(""); }
  };
  const switchRegister = async () => {
    if (!currentRegister || !targetRegister) return;
    setBusy(targetRegister.id);
    try {
      await posApi.closeRegister(currentRegister.id, majorToMinor(closingCashMajor, currencyCode(currentRegister)));
      await posApi.openRegister(targetRegister.id, majorToMinor(openingCashMajor, currencyCode(targetRegister)));
      const bootstrap = await refreshBootstrap();
      setModal(null);
      setTargetRegister(null);
      resume(bootstrap);
    } catch (switchError) {
      toast.error(switchError?.response?.data?.message || switchError.message || "Unable to switch register safely.");
      await refresh();
    } finally { setBusy(""); }
  };
  const selectRegister = (register) => {
    if (busy) return;
    if (session?.register_id === register.id) return resume();
    setTargetRegister(register);
    setOpeningCashMajor("0.00");
    if (session) {
      setClosingCashMajor(minorToMajor(session.expected_cash_minor));
      setModal("switch");
    } else setModal("open");
  };

  return <main className="min-h-screen bg-zinc-100 p-6"><div className="mx-auto max-w-4xl">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-black">Select register</h1><p className="mt-1 text-zinc-500">Only assigned, active registers are shown.</p></div><button onClick={() => { clearRuntime({ clearToken: true }); navigate("/pos/login", { replace: true }); }} className="rounded border border-zinc-300 bg-white px-4 py-2 font-bold text-zinc-700">Sign out</button></div>
    {location.state?.message ? <p role="alert" className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 font-bold text-amber-900">{location.state.message}</p> : null}
    {session && currentRegister ? <div className="mt-6 rounded border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><p className="text-xs font-black uppercase">Current session</p><p className="mt-1 font-bold">You already have an open session on {currentRegister.name}.</p></div> : null}
    {isLoading ? <p className="mt-6 rounded border bg-white p-4 font-bold text-zinc-600">Loading POS registers...</p> : null}
    {status === "ERROR" ? <div className="mt-6"><p role="alert" className="rounded border border-red-300 bg-red-50 p-4 font-bold text-red-900">{error?.response?.data?.message || error?.message || "Unable to load register assignments."}</p><button onClick={refresh} className="mt-4 rounded bg-emerald-700 px-4 py-2 font-bold text-white">Retry</button></div> : null}
    {!isLoading && status !== "ERROR" && registers.length === 0 ? <div className="mt-6"><p className="rounded border bg-white p-4 text-zinc-600">No POS registers are assigned to this account.</p>{operator?.email ? <p className="mt-2 text-sm text-zinc-500">Logged in as: {operator.email}</p> : null}<button onClick={() => { clearRuntime({ clearToken: true }); navigate("/pos/login", { replace: true }); }} className="mt-4 rounded border border-zinc-300 bg-white px-4 py-2 font-bold text-zinc-700">Sign out and use another account</button></div> : null}
    {!isLoading && status !== "ERROR" && registers.length > 0 ? <><div className="mt-6 grid gap-3 sm:grid-cols-2">{registers.map((register) => { const current = session?.register_id === register.id; return <button key={register.id} disabled={Boolean(busy)} onClick={() => selectRegister(register)} className={`rounded border bg-white p-5 text-left shadow-sm hover:border-emerald-700 disabled:opacity-50 ${current ? "border-emerald-600 ring-2 ring-emerald-100" : ""}`}><div className="flex items-center justify-between gap-3"><strong className="text-lg">{register.name}</strong>{current ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-800">CURRENT SESSION</span> : null}</div><span className="mt-1 block text-sm text-zinc-500">{register.code} · {currencyCode(register)} · {register.status}</span><span className="mt-4 inline-flex rounded bg-zinc-900 px-3 py-2 text-sm font-bold text-white">{current ? "Resume Register" : session ? "Switch Register" : "Open Register"}</span></button>; })}</div><button onClick={refresh} className="mt-4 rounded bg-emerald-700 px-4 py-2 font-bold text-white">Refresh assignments</button></> : null}
    {modal && targetRegister ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded bg-white p-6 shadow-xl"><h2 className="text-xl font-black">{modal === "switch" ? `Switch to ${targetRegister.name}` : `Open ${targetRegister.name}`}</h2>{modal === "switch" ? <><label className="mt-5 block text-xs font-black uppercase text-zinc-500">Counted Cash ({currencyCode(currentRegister)})</label><input type="number" min="0" step="0.01" value={closingCashMajor} onChange={(event) => setClosingCashMajor(event.target.value)} className="mt-2 h-12 w-full rounded border px-3" /></> : null}<label className="mt-5 block text-xs font-black uppercase text-zinc-500">Opening Cash ({currencyCode(targetRegister)})</label><input type="number" min="0" step="0.01" value={openingCashMajor} onChange={(event) => setOpeningCashMajor(event.target.value)} className="mt-2 h-12 w-full rounded border px-3" /><div className="mt-6 flex justify-end gap-3"><button disabled={Boolean(busy)} onClick={closeModal} className="rounded border px-4 py-2 font-bold">Cancel</button><button disabled={Boolean(busy)} onClick={() => modal === "switch" ? switchRegister() : openRegister(targetRegister)} className="rounded bg-emerald-700 px-4 py-2 font-bold text-white">{busy ? "Working..." : modal === "switch" ? "Close and Switch" : "Open Register"}</button></div></div></div> : null}
  </div></main>;
}
