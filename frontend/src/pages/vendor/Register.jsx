import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Store, Mail, Lock, FileText, CheckCircle2, ArrowRight, Loader2, Phone } from "lucide-react";
import { vendorApi } from "../../services/vendorApi";
import { vendorStart, vendorSuccess, vendorFailure } from "../../redux/vendorSlice";
import toast from "react-hot-toast";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const { loading, error } = useSelector((state) => state.vendor);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const storeName = name.trim();
    const businessEmail = email.trim();
    if (!storeName || !businessEmail || !password) {
      return toast.error("Please fill in all required fields");
    }
    if (password.length < 12) {
      return toast.error("Password must be at least 12 characters long");
    }

    dispatch(vendorStart());
    try {
      await vendorApi.register({
        name: storeName,
        store_name: storeName,
        email: businessEmail,
        phone: phone.trim() || undefined,
        password,
        description,
      });
      dispatch(vendorSuccess());
      setIsSuccess(true);
      toast.success("Application submitted successfully!");
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to register";
      dispatch(vendorFailure(msg));
      toast.error(msg);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#0d0e12] flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/10 blur-[120px]" />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-stone-900/60 backdrop-blur-xl border border-stone-800 rounded-[2.5rem] p-10 shadow-2xl relative z-10 text-center"
        >
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={42} />
          </div>
          <h1 className="text-2xl font-black text-white mb-3">Application Submitted!</h1>
          <p className="text-stone-400 text-sm font-medium mb-8 leading-relaxed">
            Your store application for <span className="text-emerald-400 font-bold">{name}</span> has been received. Our administrator team will review your application shortly.
          </p>

          <Link
            to="/vendor/login"
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-stone-950 font-black text-sm uppercase tracking-wider py-4 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 transition-all"
          >
            Return to Login <ArrowRight size={18} />
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0e12] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Background Gradients */}
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
          <h1 className="text-3xl font-black tracking-tight text-white mb-2">Create Store.</h1>
          <p className="text-stone-400 text-sm font-medium text-center">
            Register your vendor profile to begin selling on Eatsie.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Store Name</label>
            <div className="relative">
              <Store className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
              <input
                type="text"
                placeholder="Organic Farms Ltd."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 focus:border-emerald-500 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Business Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
              <input
                type="email"
                placeholder="contact@organicfarms.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 focus:border-emerald-500 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Phone</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
              <input
                type="tel"
                placeholder="9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 focus:border-emerald-500 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Store Description</label>
            <div className="relative">
              <FileText className="absolute left-4 top-4 text-stone-500" size={16} />
              <textarea
                placeholder="Briefly describe what your store offers..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 focus:border-emerald-500 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold min-h-[80px] max-h-[140px]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 focus:border-emerald-500 rounded-2xl py-3.5 pl-12 pr-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-3 bg-gradient-to-r from-emerald-500 to-teal-400 text-stone-950 font-black text-sm uppercase tracking-wider py-4 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                Submit Application <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-stone-800 text-center">
          <p className="text-stone-500 text-xs font-semibold">
            Already registered?{" "}
            <Link to="/vendor/login" className="text-emerald-400 hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
