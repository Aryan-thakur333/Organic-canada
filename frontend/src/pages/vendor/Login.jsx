import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Store, Mail, Lock, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { vendorApi } from "../../services/vendorApi";
import { loginSuccess, vendorStart, vendorFailure } from "../../redux/vendorSlice";
import toast from "react-hot-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { loading, error } = useSelector((state) => state.vendor);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      return toast.error("Please enter email and password");
    }

    dispatch(vendorStart());
    try {
      const res = await vendorApi.login({ email, password });
      dispatch(loginSuccess(res));
      toast.success("Welcome to your Storefront!");
      navigate("/vendor/dashboard");
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to log in";
      dispatch(vendorFailure(msg));
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0e12] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Dynamic Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/10 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md bg-stone-900/60 backdrop-blur-xl border border-stone-800 rounded-[2.5rem] p-10 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4">
            <Store className="text-stone-950" size={28} />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white mb-2">Vendor Portal.</h1>
          <p className="text-stone-400 text-sm font-medium text-center">
            Sign in to manage your custom storefront, list products, and track earnings.
          </p>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 bg-red-950/40 border border-red-800/60 p-4 rounded-2xl flex items-start gap-3 text-red-300 text-xs font-semibold"
          >
            <AlertCircle className="shrink-0 mt-0.5" size={16} />
            <span>{error}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" size={18} />
              <input
                type="email"
                placeholder="store@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 focus:border-emerald-500 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" size={18} />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 focus:border-emerald-500 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-gradient-to-r from-emerald-500 to-teal-400 text-stone-950 font-black text-sm uppercase tracking-wider py-4 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                Sign In <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-stone-800 text-center">
          <p className="text-stone-500 text-xs font-semibold">
            Want to open a store?{" "}
            <Link to="/vendor/register" className="text-emerald-400 hover:underline">
              Register Here
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
