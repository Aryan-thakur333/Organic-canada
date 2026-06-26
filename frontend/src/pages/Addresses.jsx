import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Plus,
  Trash2,
  Edit3,
  X,
  Home,
  Briefcase,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { updateUserProfile } from "../redux/userSlice";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/Footer";
import MobileNav from "../components/MobileNav";
import Button from "../components/common/Button";
import { authService } from "../services/medusa/authService";
import useToast from "../hooks/useToast";

const defaultCountries = ["US", "CA", "GB", "AU", "DE", "FR", "IT", "ES", "NL", "NZ"];

const countryName = (code) => {
  const names = {
    US: "United States", CA: "Canada", GB: "United Kingdom",
    AU: "Australia", DE: "Germany", FR: "France", IT: "Italy",
    ES: "Spain", NL: "Netherlands", NZ: "New Zealand",
  };
  return names[code] || code;
};

const emptyAddress = () => ({
  address_1: "",
  address_2: "",
  city: "",
  province: "",
  postal_code: "",
  country_code: "CA",
  first_name: "",
  last_name: "",
  phone: "",
  company: "",
});

export default function Addresses() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showToast } = useToast();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyAddress());
  const [formErrors, setFormErrors] = useState({});

  const fetchAddresses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authService.listAddresses();
      const list = res?.addresses || [];
      setAddresses(list);
      dispatch(updateUserProfile({ addresses: list }));
    } catch {
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    fetchAddresses();
  }, [fetchAddresses]);

  // ── Open modal ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyAddress());
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (addr) => {
    setEditingId(addr.id);
    setForm({
      address_1: addr.address_1 || "",
      address_2: addr.address_2 || "",
      city: addr.city || "",
      province: addr.province || "",
      postal_code: addr.postal_code || "",
      country_code: addr.country_code || "CA",
      first_name: addr.first_name || "",
      last_name: addr.last_name || "",
      phone: addr.phone || "",
      company: addr.company || "",
    });
    setFormErrors({});
    setModalOpen(true);
  };

  // ── Validate ────────────────────────────────────────────────────────────
  const validate = () => {
    const errors = {};
    if (!form.address_1.trim()) errors.address_1 = "Street address is required";
    if (!form.city.trim()) errors.city = "City is required";
    if (!form.postal_code.trim()) errors.postal_code = "Postal code is required";
    if (!form.first_name.trim()) errors.first_name = "First name is required";
    if (!form.last_name.trim()) errors.last_name = "Last name is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        address_1: form.address_1.trim(),
        address_2: form.address_2.trim() || undefined,
        city: form.city.trim(),
        province: form.province.trim(),
        postal_code: form.postal_code.trim(),
        country_code: form.country_code,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim() || undefined,
        company: form.company.trim() || undefined,
      };

      if (editingId) {
        await authService.updateAddress(editingId, payload);
        showToast("Address updated", "success");
      } else {
        await authService.addAddress(payload);
        showToast("Address added", "success");
      }

      setModalOpen(false);
      await fetchAddresses();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to save address";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this address?")) return;
    try {
      await authService.deleteAddress(id);
      showToast("Address deleted", "success");
      await fetchAddresses();
    } catch (err) {
      showToast("Failed to delete address", "error");
    }
  };

  // ── Set as default ──────────────────────────────────────────────────────
  const handleSetDefault = async (addr) => {
    try {
      await Promise.all(addresses.map((item) => authService.updateAddress(item.id, {
        is_default_shipping: item.id === addr.id,
        is_default_billing: item.id === addr.id,
      })));
      showToast("Default address updated", "success");
      await fetchAddresses();
    } catch {
      showToast("Failed to set default", "error");
    }
  };

  // ── Address type icon ───────────────────────────────────────────────────
  const AddressIcon = ({ addr }) => {
    if (addr.company) return <Briefcase size={20} />;
    return <Home size={20} />;
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <main className="pt-28 pb-20 container-custom">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-10">
          <button
            onClick={() => navigate("/profile")}
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-4xl font-black text-text-primary">Saved Addresses.</h1>
            <p className="text-sm text-text-secondary">
              Manage your shipping and billing addresses for faster checkout.
            </p>
          </div>
          <Button size="sm" className="gap-2 text-xs font-black uppercase tracking-wider" onClick={openAdd}>
            <Plus size={14} /> Add Address
          </Button>
        </div>

        {/* ── Address List ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <Loader2 className="animate-spin text-accent-primary" size={28} />
          </div>
        ) : addresses.length === 0 ? (
          <div className="py-20 text-center max-w-md mx-auto">
            <div className="inline-flex p-8 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-400 dark:text-slate-600 mb-8">
              <MapPin size={48} />
            </div>
            <h2 className="text-3xl font-black mb-4">No saved addresses</h2>
            <p className="text-text-secondary mb-8">
              Add a shipping address to speed up your checkout experience.
            </p>
            <Button size="lg" onClick={openAdd}>
              <Plus size={18} /> Add Your First Address
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {addresses.map((addr, i) => (
                <motion.div
                  key={addr.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all relative group"
                >
                  {/* Default badge */}
                  {addr.is_default_shipping && (
                    <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-wider border border-emerald-500/20">
                      Default
                    </span>
                  )}

                  {/* Icon + Name */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                      <AddressIcon addr={addr} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-text-primary">
                        {addr.first_name} {addr.last_name}
                      </p>
                      {addr.company && (
                        <p className="text-[10px] text-text-secondary font-medium">{addr.company}</p>
                      )}
                    </div>
                  </div>

                  {/* Address Details */}
                  <div className="text-xs text-text-secondary font-medium leading-relaxed mb-4 p-4 bg-stone-50 dark:bg-slate-900/40 rounded-2xl">
                    <p>{addr.address_1}</p>
                    {addr.address_2 && <p>{addr.address_2}</p>}
                    <p>
                      {addr.city}, {addr.province} {addr.postal_code}
                    </p>
                    <p>{countryName(addr.country_code)}</p>
                    {addr.phone && <p className="mt-1 font-bold">{addr.phone}</p>}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(addr)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-stone-50 dark:bg-slate-900/40 hover:bg-stone-100 dark:hover:bg-slate-900/60 rounded-xl text-xs font-bold text-text-secondary hover:text-accent-primary transition-all"
                    >
                      <Edit3 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => handleSetDefault(addr)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-stone-50 dark:bg-slate-900/40 hover:bg-stone-100 dark:hover:bg-slate-900/60 rounded-xl text-xs font-bold text-text-secondary hover:text-emerald-600 transition-all"
                      disabled={addr.is_default_shipping}
                    >
                      <CheckCircle2 size={14} />{" "}
                      {addr.is_default_shipping ? "Default" : "Set Default"}
                    </button>
                    <button
                      onClick={() => handleDelete(addr.id)}
                      className="p-2.5 bg-stone-50 dark:bg-slate-900/40 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-stone-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── Add/Edit Modal ────────────────────────────────────────────── */}
        <AnimatePresence>
          {modalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setModalOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.form
                onSubmit={handleSave}
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                      <MapPin size={18} />
                    </div>
                    <h3 className="text-xl font-black text-text-primary">
                      {editingId ? "Edit Address" : "Add Address"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="text-stone-400 hover:text-text-primary transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Form */}
                <div className="flex flex-col gap-4">
                  {/* Name Fields */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        First Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.first_name}
                        onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                        className={`w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 rounded-xl text-sm font-semibold outline-none transition-all ${
                          formErrors.first_name
                            ? "border-red-300 dark:border-red-700"
                            : "border-transparent focus:border-accent-primary"
                        }`}
                        placeholder="John"
                      />
                      {formErrors.first_name && (
                        <p className="mt-1 text-[10px] font-medium text-red-500">{formErrors.first_name}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        Last Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.last_name}
                        onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                        className={`w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 rounded-xl text-sm font-semibold outline-none transition-all ${
                          formErrors.last_name
                            ? "border-red-300 dark:border-red-700"
                            : "border-transparent focus:border-accent-primary"
                        }`}
                        placeholder="Doe"
                      />
                      {formErrors.last_name && (
                        <p className="mt-1 text-[10px] font-medium text-red-500">{formErrors.last_name}</p>
                      )}
                    </div>
                  </div>

                  {/* Company + Phone */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        Company <span className="text-stone-400 font-normal normal-case">— opt.</span>
                      </label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        className="w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-xl text-sm font-semibold outline-none transition-all"
                        placeholder="Company name"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        Phone <span className="text-stone-400 font-normal normal-case">— opt.</span>
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-xl text-sm font-semibold outline-none transition-all"
                        placeholder="+1 (555) 000-0000"
                      />
                    </div>
                  </div>

                  {/* Address 1 */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                      Street Address <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.address_1}
                      onChange={(e) => setForm({ ...form, address_1: e.target.value })}
                      className={`w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 rounded-xl text-sm font-semibold outline-none transition-all ${
                        formErrors.address_1
                          ? "border-red-300 dark:border-red-700"
                          : "border-transparent focus:border-accent-primary"
                      }`}
                      placeholder="123 Organic Lane"
                    />
                    {formErrors.address_1 && (
                      <p className="mt-1 text-[10px] font-medium text-red-500">{formErrors.address_1}</p>
                    )}
                  </div>

                  {/* Address 2 */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                      Apt / Suite <span className="text-stone-400 font-normal normal-case">— opt.</span>
                    </label>
                    <input
                      type="text"
                      value={form.address_2}
                      onChange={(e) => setForm({ ...form, address_2: e.target.value })}
                      className="w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-xl text-sm font-semibold outline-none transition-all"
                      placeholder="Apt 4B"
                    />
                  </div>

                  {/* City + Province */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        City <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        className={`w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 rounded-xl text-sm font-semibold outline-none transition-all ${
                          formErrors.city
                            ? "border-red-300 dark:border-red-700"
                            : "border-transparent focus:border-accent-primary"
                        }`}
                        placeholder="Eco City"
                      />
                      {formErrors.city && (
                        <p className="mt-1 text-[10px] font-medium text-red-500">{formErrors.city}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        State / Province
                      </label>
                      <input
                        type="text"
                        value={form.province}
                        onChange={(e) => setForm({ ...form, province: e.target.value })}
                        className="w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-xl text-sm font-semibold outline-none transition-all"
                        placeholder="California"
                      />
                    </div>
                  </div>

                  {/* Postal Code + Country */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        Postal Code <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.postal_code}
                        onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                        className={`w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 rounded-xl text-sm font-semibold outline-none transition-all ${
                          formErrors.postal_code
                            ? "border-red-300 dark:border-red-700"
                            : "border-transparent focus:border-accent-primary"
                        }`}
                        placeholder="90210"
                      />
                      {formErrors.postal_code && (
                        <p className="mt-1 text-[10px] font-medium text-red-500">{formErrors.postal_code}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        Country
                      </label>
                      <select
                        value={form.country_code}
                        onChange={(e) => setForm({ ...form, country_code: e.target.value })}
                        className="w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-xl text-sm font-semibold outline-none transition-all"
                      >
                        {defaultCountries.map((code) => (
                          <option key={code} value={code}>
                            {countryName(code)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex gap-3 mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 text-xs font-black uppercase tracking-wider"
                      onClick={() => setModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 gap-2 text-xs font-black uppercase tracking-wider"
                      disabled={saving}
                      isLoading={saving}
                    >
                      <MapPin size={14} />
                      {saving ? "Saving..." : editingId ? "Update Address" : "Add Address"}
                    </Button>
                  </div>
                </div>
              </motion.form>
            </div>
          )}
        </AnimatePresence>
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
