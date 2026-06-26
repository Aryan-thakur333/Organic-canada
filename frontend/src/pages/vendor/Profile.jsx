import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { motion } from "framer-motion";
import {
  Store,
  Mail,
  FileText,
  Calendar,
  Shield,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  UserCircle,
  Building2,
} from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import { vendorApi } from "../../services/vendorApi";
import { setProfile } from "../../redux/vendorSlice";
import toast from "react-hot-toast";

export default function VendorProfile() {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.vendor.profile);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await vendorApi.getProfile();
        dispatch(setProfile(res.vendor));
      } catch (err) {
        const msg = err.response?.data?.message || err.message || "Failed to load profile";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    };

    if (!profile) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, [dispatch, profile]);

  const statusBadge = (status) => {
    const map = {
      approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      rejected: "bg-red-500/10 text-red-400 border-red-500/20",
      suspended: "bg-stone-500/10 text-stone-400 border-stone-500/20",
    };
    return (
      <span
        className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 w-fit ${
          map[status] || "bg-stone-500/10 text-stone-400 border-stone-500/20"
        }`}
      >
        {status === "approved" && <CheckCircle2 size={12} />}
        {status === "pending" && <AlertTriangle size={12} />}
        {status === "suspended" && <AlertTriangle size={12} />}
        {status}
      </span>
    );
  };

  return (
    <DashboardLayout>
      {loading ? (
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-emerald-400" size={32} />
        </div>
      ) : !profile ? (
        <div className="h-[60vh] flex items-center justify-center">
          <p className="text-stone-400 text-sm font-bold">Could not load profile.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8 max-w-3xl mx-auto">
          {/* ── Header ───────────────────────────────────────────────── */}  
          <div>
            <h1 className="text-3xl font-black mb-2">My Profile.</h1>
            <p className="text-sm text-stone-400 font-bold">
              Your store information and account status.
            </p>
          </div>

          {/* ── Profile Card ─────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-stone-900 border border-stone-800 rounded-[2.5rem] overflow-hidden shadow-xl"
          >
            {/* Cover */}
            <div className="h-24 bg-gradient-to-r from-emerald-900/40 to-teal-900/40 border-b border-stone-800" />

            {/* Avatar Row */}
            <div className="px-8 pb-6">
              <div className="-mt-12 flex items-end gap-5 mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-stone-950 flex items-center justify-center shadow-xl border-4 border-stone-900">
                  <Store size={36} />
                </div>
                <div className="pb-1">
                  <h2 className="text-xl font-black text-white">{profile.store_name || profile.name}</h2>
                  <p className="text-xs text-stone-500 font-semibold">Vendor Partner</p>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid md:grid-cols-2 gap-4">
                {[
                  { icon: <Store size={16} />, label: "Store Name", value: profile.store_name || profile.name },
                  { icon: <Mail size={16} />, label: "Email", value: profile.email },
                  { icon: <FileText size={16} />, label: "Description", value: profile.description || "No description provided." },
                  { icon: <Calendar size={16} />, label: "Member Since", value: new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) },
                  { icon: <Shield size={16} />, label: "Vendor ID", value: profile.id },
                  { icon: <Building2 size={16} />, label: "Account Status", value: statusBadge(profile.status) },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="bg-stone-950 border border-stone-800 rounded-2xl p-4"
                  >
                    <div className="flex items-center gap-2 text-stone-500 mb-1.5">
                      {item.icon}
                      <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
                    </div>
                    <div className="text-sm font-bold text-white">{item.value}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── Company Details ──────────────────────────────────────── */}
          {profile.company_details && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-8 shadow-xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-stone-950 flex items-center justify-center">
                  <Building2 size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black">Company Details</h3>
                  <p className="text-[10px] text-stone-500 font-bold">Additional business information</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {Object.entries(profile.company_details).map(([key, value]) => (
                  <div key={key} className="bg-stone-950 border border-stone-800 rounded-2xl p-4">
                    <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm font-bold text-white">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
