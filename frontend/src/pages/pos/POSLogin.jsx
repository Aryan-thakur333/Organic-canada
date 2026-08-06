import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LockKeyhole, Store } from "lucide-react";
import toast from "react-hot-toast";
import { loginPosStaff } from "../../services/posApi";
import { usePOS } from "../../contexts/usePOS";

export default function POSLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { clearRuntime, refreshBootstrap } = usePOS();

  const submit = async (event) => {
    event.preventDefault();
    clearRuntime({ clearToken: true });
    setErrorMessage("");
    setLoading(true);

    try {
      await loginPosStaff({ email, password });
      await refreshBootstrap();
      toast.success("POS authenticated");
      navigate("/pos/register-select", { replace: true });
    } catch (error) {
      clearRuntime({ clearToken: true });

      let msg = "Unable to login";
      const status = error?.response?.status;
      const errorCode = error?.code || error?.response?.data?.code;

      if (errorCode === "POS_BOOTSTRAP_ACTOR_ID_MISSING") {
        msg = "POS configuration is incomplete: Missing actor identity.";
      } else if (errorCode === "POS_ACTOR_MISMATCH" || errorCode === "POS_AUTH_IDENTITY_MISMATCH") {
        msg = "This account is not linked to the configured POS operator.";
      } else if (errorCode === "POS_AUTH_ACTOR_ID_MISSING") {
        msg = "POS authentication token is missing its actor identity.";
      } else if (errorCode === "POS_REGISTER_ASSIGNMENT_LOOKUP_FAILED") {
        msg = "Unable to load POS register assignments.";
      } else if (errorCode === "POS_REGISTER_INVARIANT_FAILED") {
        msg = "POS register configuration invariant failed.";
      } else if (status === 401) {
        msg = "Invalid email or password.";
      } else if (status === 403) {
        msg = "You are not authorized to use POS.";
      } else if (error?.code === "BACKEND_OFFLINE" || error?.code === "ERR_NETWORK" || error?.message?.includes("offline")) {
        msg = "POS backend is unavailable.";
      } else if (error?.response?.data?.message) {
        msg = error.response.data.message;
      } else if (error?.message) {
        msg = error.message;
      }

      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-white">
      <form onSubmit={submit} className="w-full max-w-sm rounded border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded bg-emerald-500 text-zinc-950">
            <Store size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black">Eatsie POS</h1>
            <p className="text-sm text-zinc-400">Authorized staff access</p>
          </div>
        </div>
        {errorMessage ? (
          <p role="alert" className="mb-4 rounded border border-red-500/50 bg-red-950/60 p-3 text-sm font-bold text-red-200">
            {errorMessage}
          </p>
        ) : null}
        <label htmlFor="pos-staff-email" className="text-xs font-black uppercase text-zinc-400">Staff email</label>
        <input
          id="pos-staff-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 h-12 w-full rounded border border-zinc-700 bg-zinc-950 px-3 font-semibold outline-none focus:border-emerald-500"
        />
        <label htmlFor="pos-staff-password" className="mt-4 block text-xs font-black uppercase text-zinc-400">Password</label>
        <input
          id="pos-staff-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 h-12 w-full rounded border border-zinc-700 bg-zinc-950 px-3 font-semibold outline-none focus:border-emerald-500"
        />
        <button
          disabled={loading}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded bg-emerald-500 font-black text-zinc-950 disabled:opacity-50"
        >
          <LockKeyhole size={18} /> {loading ? "Authenticating..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
