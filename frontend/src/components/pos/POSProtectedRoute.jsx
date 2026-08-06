import { Navigate, useLocation, useParams } from "react-router-dom";
import { usePOS } from "../../contexts/usePOS";

function Loading({ label }) {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-100 font-bold">{label}</main>;
}

export default function POSProtectedRoute({ children }) {
  const { status, session, error, refreshBootstrap } = usePOS();
  const location = useLocation();
  const { registerId } = useParams();
  const isRegisterSelect = location.pathname === "/pos/register-select";

  if (["IDLE", "AUTH_LOADING", "BOOTSTRAP_LOADING"].includes(status)) return <Loading label="Loading POS registers..." />;
  if (status === "AUTH_REQUIRED") return <Navigate to="/pos/login" replace />;
  if (status === "ERROR") {
    return <main role="alert" className="flex min-h-screen items-center justify-center bg-zinc-100 p-6"><div className="max-w-lg rounded border border-red-300 bg-red-50 p-6 text-center font-bold text-red-900"><p>{error?.response?.data?.message || error?.message || "POS access could not be restored."}</p><button onClick={() => refreshBootstrap().catch(() => undefined)} className="mt-4 rounded bg-zinc-900 px-4 py-2 text-white">Retry</button></div></main>;
  }
  if (status === "EMPTY_ASSIGNMENTS") return isRegisterSelect ? children : <Navigate to="/pos/register-select" replace />;
  if (status === "READY_NO_SESSION") return isRegisterSelect ? children : <Navigate to="/pos/register-select" replace state={{ message: "Open a register session before continuing." }} />;
  if (status === "READY_SESSION" && session?.register_id) {
    if (registerId && registerId !== session.register_id) return <Navigate to={`/pos/register/${session.register_id}`} replace />;
    return children;
  }
  return <Navigate to="/pos/register-select" replace />;
}
