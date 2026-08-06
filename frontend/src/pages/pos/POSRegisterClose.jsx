import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import POSShell from "../../components/pos/POSShell";
import { setPosSession } from "../../redux/posSlice";
import { posApi } from "../../services/posApi";

export default function POSRegisterClose() {
  const { registerId } = useParams();
  const [counted, setCounted] = useState("0.00");
  const [reconciliation, setReconciliation] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const register = useSelector((state) => state.pos.register);
  const currency = String(register?.currency_code || "cad").toUpperCase();
  const close = async () => { try { if (!/^\d+(\.\d{0,2})?$/.test(counted.trim())) throw new Error("Counted cash must use up to two decimal places."); const data = await posApi.closeRegister(registerId, Math.round(Number(counted) * 100)); setReconciliation(data.reconciliation); dispatch(setPosSession(null)); toast.success("Register closed"); } catch (error) { toast.error(error.response?.data?.message || error.message); } };
  return <POSShell><div className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-black">Close register</h1><label className="mt-5 block text-xs font-black uppercase text-zinc-500">Counted Cash ({currency})</label><input type="number" min="0" step="0.01" inputMode="decimal" value={counted} onChange={(event) => setCounted(event.target.value)} className="mt-2 h-12 w-full rounded border bg-white px-3" /><button onClick={close} className="mt-3 h-12 w-full rounded bg-zinc-950 font-black text-white">Close and reconcile</button>{reconciliation ? <div className="mt-5 rounded border bg-white p-5">{Object.entries(reconciliation).map(([key, value]) => <div key={key} className="flex justify-between border-b py-2 text-sm"><span>{key}</span><strong>{typeof value === "number" && /Minor|difference/i.test(key) ? new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value / 100) : String(value)}</strong></div>)}<button onClick={() => navigate("/pos/register-select")} className="mt-4 h-11 w-full rounded bg-emerald-700 font-black text-white">Choose register</button></div> : null}</div></POSShell>;
}
