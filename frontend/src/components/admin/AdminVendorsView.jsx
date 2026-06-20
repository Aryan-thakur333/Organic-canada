import React, { useState, useEffect } from "react";
import { vendorApi } from "../../services/vendorApi";
import { Check, X, ShieldAlert, Store, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export default function AdminVendorsView() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState(null);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await vendorApi.adminListVendors();
      setVendors(res.vendors || []);
    } catch (err) {
      toast.error("Failed to load vendors list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleApprove = async (id) => {
    setActioningId(id);
    try {
      await vendorApi.adminApproveVendor(id);
      toast.success("Vendor application approved");
      fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to approve vendor");
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id) => {
    setActioningId(id);
    try {
      await vendorApi.adminRejectVendor(id);
      toast.success("Vendor application rejected");
      fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to reject vendor");
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-3xl font-black text-text-primary mb-2">Vendors.</h2>
        <p className="text-sm text-text-secondary font-medium">Review and manage partner storefront registrations.</p>
      </div>

      {loading ? (
        <div className="h-[40vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-accent-primary" size={32} />
        </div>
      ) : vendors.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-[2.5rem] p-16 text-center shadow-premium">
          <div className="w-16 h-16 rounded-2xl bg-stone-50 dark:bg-slate-900 flex items-center justify-center mx-auto mb-6 text-text-secondary">
            <Store size={28} />
          </div>
          <h3 className="text-lg font-black mb-2">No Registered Vendors</h3>
          <p className="text-text-secondary text-sm font-semibold max-w-sm mx-auto">
            Applications from new partners seeking to list items will appear here for review.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 dark:bg-slate-900/50">
                <tr>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary">Store Details</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary">Registered Date</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary">Status</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest text-text-secondary">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50 dark:divide-slate-700 font-semibold text-text-primary">
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="hover:bg-stone-50/50 dark:hover:bg-slate-900/20 transition-colors">
                    <td className="px-8 py-5">
                      <p className="text-sm font-black text-text-primary">{vendor.name}</p>
                      <p className="text-xs text-text-secondary font-medium mt-0.5">{vendor.email}</p>
                      {vendor.description && (
                        <p className="text-[10px] text-text-secondary italic mt-1 font-medium max-w-md line-clamp-1">{vendor.description}</p>
                      )}
                    </td>
                    <td className="px-8 py-5 text-sm text-text-secondary">
                      {new Date(vendor.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        vendor.status === "approved" ? "bg-green-100 text-green-600 dark:bg-green-950/20 dark:text-green-400" :
                        vendor.status === "rejected" ? "bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400" :
                        "bg-amber-100 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"
                      }`}>
                        {vendor.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      {actioningId === vendor.id ? (
                        <Loader2 className="animate-spin text-accent-primary ml-auto mr-4" size={16} />
                      ) : (
                        <div className="flex justify-end gap-2">
                          {vendor.status !== "approved" && (
                            <button
                              onClick={() => handleApprove(vendor.id)}
                              className="p-2 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white rounded-lg transition-all"
                              title="Approve Store"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          {vendor.status !== "rejected" && (
                            <button
                              onClick={() => handleReject(vendor.id)}
                              className="p-2 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all"
                              title="Reject Store"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
