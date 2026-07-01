import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  Package,
  Loader2,
  Search,
  RefreshCw,
  History,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import toast from "react-hot-toast";
import DashboardLayout from "./DashboardLayout";
import { vendorApi } from "../../services/vendorApi";

export default function Inventory() {
  const [activeTab, setActiveTab] = useState("inventory");
  const [digitalCount, setDigitalCount] = useState(0);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* ── Tab Switcher ────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 bg-stone-900 border border-stone-800 rounded-2xl p-1 w-fit">
          <button
            onClick={() => setActiveTab("inventory")}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === "inventory"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "text-stone-500 hover:text-stone-300"
            }`}
          >
            <Package size={14} /> Inventory
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              activeTab === "audit"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "text-stone-500 hover:text-stone-300"
            }`}
          >
            <History size={14} /> Audit Log
          </button>
        </div>

        {activeTab === "inventory" ? <InventoryPanel /> : <AuditLogPanel />}
      </div>
    </DashboardLayout>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Inventory Panel
 * ════════════════════════════════════════════════════════════════════════════ */
function InventoryPanel() {
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState({ lowStock: [], lowStockCount: 0, outOfStock: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await vendorApi.getInventory();
      setItems(response.inventory || []);
      setAlerts(response.alerts || { lowStock: [], lowStockCount: 0, outOfStock: 0 });
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load inventory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Track inline notes per row (level_id -> note text)
  const [pendingNotes, setPendingNotes] = useState({});
  const [openNoteRows, setOpenNoteRows] = useState({});

  const updateQuantity = async (item, value, note) => {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0) return;
    setSaving(item.level_id);
    try {
      await vendorApi.updateInventory(item.level_id, quantity, note || "");
      setItems((current) =>
        current.map((row) =>
          row.level_id === item.level_id
            ? {
                ...row,
                stocked_quantity: quantity,
                available_quantity: quantity - Number(row.reserved_quantity || 0),
              }
            : row
        )
      );
      // Clear note state for this row
      setPendingNotes((prev) => { const n = { ...prev }; delete n[item.level_id]; return n; });
      setOpenNoteRows((prev) => { const n = { ...prev }; delete n[item.level_id]; return n; });
      toast.success(note ? "Inventory updated with note" : "Inventory updated");
    } catch (error) {
      toast.error(error.response?.data?.message || "Inventory update failed");
    } finally {
      setSaving(null);
    }
  };

  // ── Filtering ───────────────────────────────────────────────────────────
  const filteredItems = items.filter((item) => {
    // Digital items don't need inventory filtering
    if (item.is_digital || item.stock_status === 'digital') return true;
    if (stockFilter === "low" && item.available_quantity > 5) return false;
    if (stockFilter === "out" && item.available_quantity > 0) return false;
    if (stockFilter === "healthy" && item.available_quantity <= 5) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesProduct = item.product_title?.toLowerCase().includes(q);
      const matchesVariant = item.variant_title?.toLowerCase().includes(q);
      const matchesSku = item.sku?.toLowerCase().includes(q);
      if (!matchesProduct && !matchesVariant && !matchesSku) return false;
    }
    return true;
  });

  // ── Stock health badge ──────────────────────────────────────────────────
  const stockBadge = (item) => {
    if (item.is_digital || item.stock_status === 'digital')
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1 w-fit">
          <Download size={10} /> Digital — No Inventory Required
        </span>
      );
    const available = item.available_quantity;
    if (available <= 0)
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1 w-fit">
          <AlertTriangle size={10} /> Out of Stock
        </span>
      );
    if (available <= 5)
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1 w-fit">
          <AlertTriangle size={10} /> Low Stock ({available})
        </span>
      );
    if (available <= 20)
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1 w-fit">
          <Package size={10} /> Moderate ({available})
        </span>
      );
    return (
      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 w-fit">
        <CheckCircle size={10} /> In Stock
      </span>
    );
  };

  const filterTabs = [
    { value: "all", label: "All", count: items.length },
    { value: "low", label: "Low Stock", count: alerts.lowStockCount },
    { value: "out", label: "Out of Stock", count: alerts.outOfStock },
    { value: "healthy", label: "Healthy", count: items.length - alerts.lowStockCount - alerts.outOfStock },
  ];

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black mb-2">Inventory.</h1>
            <p className="text-sm text-stone-400 font-bold">
              Stock levels for products owned by your store. Digital products do not require inventory.
            </p>
          </div>
          <button
            onClick={load}
            className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

      {/* ── Alert Banner ──────────────────────────────────────────────── */}
      {alerts.lowStockCount > 0 && !loading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3"
        >
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <p className="text-xs font-bold text-amber-300">
            {alerts.lowStockCount} item{alerts.lowStockCount !== 1 ? "s" : ""} running low
            {alerts.outOfStock > 0 && ` (${alerts.outOfStock} out of stock)`}.
            Restock soon to avoid missed sales.
          </p>
        </motion.div>
      )}

      {/* ── Filters & Search ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            placeholder="Search products, variants, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-stone-900 border border-stone-800 rounded-xl text-xs font-bold text-white placeholder-stone-600 outline-none focus:border-emerald-500/50 transition-all"
          />
        </div>

        <div className="flex gap-1 flex-wrap">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStockFilter(tab.value)}
              className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                stockFilter === tab.value
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "text-stone-500 hover:text-stone-300 border border-transparent"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* ── Inventory Table ────────────────────────────────────────────── */}
      <div className="bg-stone-900 border border-stone-800 rounded-3xl overflow-x-auto shadow-xl">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-400" size={28} />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={36} className="mx-auto mb-3 text-stone-600" />
            <p className="text-stone-400 font-bold text-sm">
              {searchQuery || stockFilter !== "all"
                ? "No items match your filters."
                : "No inventory items found."}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-stone-950/40">
              <tr>
                <th className="p-5 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Product</th>
                <th className="p-5 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">SKU</th>
                <th className="p-5 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Status</th>
                <th className="p-5 text-right text-[9px] font-black uppercase tracking-widest text-stone-500">Reserved</th>
                <th className="p-5 text-right text-[9px] font-black uppercase tracking-widest text-stone-500">Stocked</th>
                <th className="p-5 text-right text-[9px] font-black uppercase tracking-widest text-stone-500">Available</th>
                <th className="p-5 text-center text-[9px] font-black uppercase tracking-widest text-stone-500">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/40">
              {filteredItems.map((item, index) => {
                const isDigitalItem = item.is_digital || item.stock_status === 'digital';
                return (
                <motion.tr
                  key={item.level_id || item.variant_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className={`hover:bg-stone-950/20 transition-colors ${
                    isDigitalItem ? "bg-blue-500/5" : item.available_quantity <= 0 ? "bg-red-500/5" : item.available_quantity <= 5 ? "bg-amber-500/5" : ""
                  }`}
                >
                  <td className="p-5">
                    <p className="text-sm font-bold text-white">{item.product_title}</p>
                    <p className="text-[10px] text-stone-500 font-medium">{item.variant_title}</p>
                  </td>
                  <td className="p-5 text-sm text-stone-400 font-mono">{item.sku || "—"}</td>
                  <td className="p-5">{stockBadge(item)}</td>
                  <td className="p-5 text-right text-sm text-stone-400">—</td>
                  <td className="p-5 text-right text-sm font-bold text-white">{isDigitalItem ? "—" : item.stocked_quantity}</td>
                  <td className="p-5 text-right">
                    <span className={`text-sm font-black ${
                      isDigitalItem ? "text-blue-400" : item.available_quantity <= 0 ? "text-red-400" : item.available_quantity <= 5 ? "text-amber-400" : "text-emerald-400"
                    }`}>
                      {isDigitalItem ? "N/A" : item.available_quantity}
                    </span>
                  </td>
                  <td className="p-5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="relative">
                        {isDigitalItem ? (
                          <span className="text-[10px] text-blue-400 font-bold">No stock needed</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            defaultValue={item.stocked_quantity}
                            disabled={saving === item.level_id}
                            onBlur={(event) => {
                              const note = pendingNotes[item.level_id] || "";
                              updateQuantity(item, event.target.value, note);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const note = pendingNotes[item.level_id] || "";
                                updateQuantity(item, e.target.value, note);
                              }
                            }}
                            className={`w-20 text-center rounded-xl bg-stone-950 border px-2 py-2 text-sm font-bold outline-none transition-all ${
                              saving === item.level_id ? "border-emerald-500/50 opacity-50" : "border-stone-800 focus:border-emerald-500/50"
                            }`}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenNoteRows((prev) => ({
                            ...prev,
                            [item.level_id]: !prev[item.level_id],
                          }))
                        }
                        className={`p-1.5 rounded-lg border transition-all ${
                          openNoteRows[item.level_id]
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-stone-950 text-stone-500 border-stone-800 hover:text-stone-300 hover:border-stone-700"
                        }`}
                        title={pendingNotes[item.level_id] ? "Edit note" : "Add note"}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                    </div>
                    {openNoteRows[item.level_id] && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2"
                      >
                        <textarea
                          placeholder="Why? e.g. 'Restocked from supplier XYZ'"
                          value={pendingNotes[item.level_id] || ""}
                          onChange={(e) =>
                            setPendingNotes((prev) => ({
                              ...prev,
                              [item.level_id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.shiftKey) {
                              e.preventDefault();
                              const note = pendingNotes[item.level_id] || "";
                              updateQuantity(
                                item,
                                e.target.closest("tr")?.querySelector('input[type="number"]')?.value || item.stocked_quantity,
                                note
                              );
                            }
                          }}
                          rows={2}
                          className="w-full max-w-[200px] mx-auto block rounded-xl bg-stone-950 border border-stone-800 px-3 py-2 text-[11px] font-medium text-stone-300 placeholder-stone-600 outline-none focus:border-emerald-500/50 transition-all resize-none"
                        />
                        <p className="text-[8px] text-stone-600 mt-1">Shift+Enter to save with note</p>
                      </motion.div>
                    )}
                  </td>
                </motion.tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Summary Bar ────────────────────────────────────────────────── */}
      {!loading && items.length > 0 && (
        <div className="flex gap-4 text-[10px] font-bold text-stone-500">
          <span>{items.length} total item{items.length !== 1 ? "s" : ""}</span>
          <span className="text-emerald-400">{items.filter((i) => i.available_quantity > 5).length} healthy</span>
          {alerts.lowStockCount > 0 && <span className="text-amber-400">{alerts.lowStockCount} low</span>}
          {alerts.outOfStock > 0 && <span className="text-red-400">{alerts.outOfStock} out of stock</span>}
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Audit Log Panel
 * ════════════════════════════════════════════════════════════════════════════ */
function AuditLogPanel() {
  const [entries, setEntries] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const limit = 25;

  const load = useCallback(async (pageOffset = 0) => {
    setLoading(true);
    try {
      const res = await vendorApi.getInventoryAudit({ limit, offset: pageOffset });
      setEntries(res.entries || []);
      setCount(res.count || 0);
      setOffset(pageOffset);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(0); }, [load]);

  const totalPages = Math.ceil(count / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const changeLabel = (entry) => {
    const diff = entry.new_stocked_quantity - entry.previous_stocked_quantity;
    if (diff > 0) return { text: `+${diff}`, cls: "text-emerald-400" };
    if (diff < 0) return { text: `${diff}`, cls: "text-red-400" };
    return { text: "0", cls: "text-stone-500" };
  };

  const changeTypeBadge = (type) => {
    const map = {
      restock: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      adjustment: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      manual_update: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      order_fulfillment: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
      return: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      admin_correction: "bg-red-500/10 text-red-400 border-red-500/20",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${map[type] || "bg-stone-500/10 text-stone-400"}`}>
        {type?.replace(/_/g, " ") || "unknown"}
      </span>
    );
  };

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black mb-2">Inventory Audit Log.</h1>
          <p className="text-sm text-stone-400 font-bold">
            Track every stock change — who changed what, when, and by how much.
          </p>
        </div>
        <button
          onClick={() => load(0)}
          className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white transition-all"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── Audit Table ────────────────────────────────────────────────── */}
      <div className="bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-400" size={28} />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center">
            <History size={36} className="mx-auto mb-3 text-stone-600" />
            <p className="text-stone-400 font-bold text-sm">
              No audit entries yet. Stock changes will appear here after you update inventory levels.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-950/40">
                  <tr>
                    <th className="p-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Time</th>
                    <th className="p-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Product</th>
                    <th className="p-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Type</th>
                    <th className="p-4 text-right text-[9px] font-black uppercase tracking-widest text-stone-500">Before</th>
                    <th className="p-4 text-right text-[9px] font-black uppercase tracking-widest text-stone-500">After</th>
                    <th className="p-4 text-right text-[9px] font-black uppercase tracking-widest text-stone-500">Change</th>
                    <th className="p-4 text-center text-[9px] font-black uppercase tracking-widest text-stone-500">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/40">
                  {entries.map((entry, i) => {
                    const change = changeLabel(entry);
                    return (
                      <motion.tr
                        key={entry.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.01 }}
                        className="hover:bg-stone-950/20 transition-colors cursor-pointer"
                        onClick={() => setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)}
                      >
                        <td className="p-4 whitespace-nowrap">
                          <p className="text-[10px] font-bold text-stone-300">
                            {new Date(entry.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </p>
                          <p className="text-[9px] text-stone-500 font-medium">
                            {new Date(entry.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </td>
                        <td className="p-4">
                          <p className="text-xs font-bold text-white truncate max-w-[200px]">
                            {entry.product_title || entry.variant_title || "—"}
                          </p>
                          {entry.sku && (
                            <p className="text-[9px] text-stone-500 font-mono">{entry.sku}</p>
                          )}
                        </td>
                        <td className="p-4">{changeTypeBadge(entry.change_type)}</td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-bold text-stone-400">{entry.previous_stocked_quantity}</span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="text-sm font-bold text-white">{entry.new_stocked_quantity}</span>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`text-sm font-black ${change.cls} flex items-center justify-end gap-1`}>
                            <ArrowUpDown size={12} /> {change.text}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedEntry(selectedEntry?.id === entry.id ? null : entry); }}
                            className="p-1.5 rounded-lg bg-stone-950 border border-stone-800 text-stone-500 hover:text-emerald-400 hover:border-emerald-500/20 transition-all"
                          >
                            <History size={12} />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ──────────────────────────────────────────── */}
            <div className="p-4 border-t border-stone-800 flex items-center justify-between">
              <p className="text-[10px] text-stone-500 font-bold">{count} total entries</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => load(offset - limit)}
                  disabled={offset === 0}
                  className="p-2 rounded-lg bg-stone-950 border border-stone-800 text-stone-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[10px] font-bold text-stone-400 px-2">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <button
                  onClick={() => load(offset + limit)}
                  disabled={offset + limit >= count}
                  className="p-2 rounded-lg bg-stone-950 border border-stone-800 text-stone-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Detail Row ──────────────────────────────────────────────────── */}
      {selectedEntry && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-stone-950 border border-stone-800 rounded-2xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">Product</span>
            <p className="text-sm font-bold text-white">{selectedEntry.product_title || "—"}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">Variant</span>
            <p className="text-sm font-bold text-white">{selectedEntry.variant_title || "—"}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">SKU</span>
            <p className="text-sm font-mono text-white">{selectedEntry.sku || "—"}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">Change Type</span>
            <div>{changeTypeBadge(selectedEntry.change_type)}</div>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">Previous Stock</span>
            <p className="text-sm font-bold text-stone-400">{selectedEntry.previous_stocked_quantity}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">New Stock</span>
            <p className="text-sm font-bold text-white">{selectedEntry.new_stocked_quantity}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">Previous Reserved</span>
            <p className="text-sm font-bold text-stone-400">{selectedEntry.previous_reserved_quantity}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">New Reserved</span>
            <p className="text-sm font-bold text-white">{selectedEntry.new_reserved_quantity}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">Source</span>
            <p className="text-sm font-bold text-white capitalize">{selectedEntry.source?.replace(/_/g, " ")}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">Actor</span>
            <p className="text-sm font-bold text-white">{selectedEntry.actor_type} {selectedEntry.actor_id?.slice(0, 8)}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">Timestamp</span>
            <p className="text-sm font-bold text-white">{new Date(selectedEntry.created_at).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-500 block mb-1">Notes</span>
            <p className="text-sm font-bold text-white">{selectedEntry.notes || "—"}</p>
          </div>
        </motion.div>
      )}
    </>
  );
}
