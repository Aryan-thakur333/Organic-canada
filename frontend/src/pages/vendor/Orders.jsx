import React, { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingBag,
  Eye,
  X,
  Loader2,
  PackageCheck,
  Truck,
  MapPin,
  Search,
  CheckCircle,
  Send,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Package,
  Clock,
  ChevronRight,
  Download,
} from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import { vendorApi } from "../../services/vendorApi";
import { setOrders } from "../../redux/vendorSlice";
import toast from "react-hot-toast";

const statusBadge = (status) => {
  const map = {
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    processing: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    fulfilled: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    canceled: "bg-red-500/10 text-red-400 border-red-500/20",
    partially_fulfilled: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    requires_action: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
        map[status] || "bg-stone-500/10 text-stone-400 border-stone-500/20"
      }`}
    >
      {status?.replace(/_/g, " ") || "unknown"}
    </span>
  );
};

// Vendor fulfillment status badge — shows the vendor-specific state machine status
const vendorStatusBadge = (status) => {
  const map = {
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    accepted: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    packed: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    shipped: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    delivered: "bg-emerald-600/10 text-emerald-500 border-emerald-500/20",
    rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 w-fit ${
        map[status] || "bg-stone-500/10 text-stone-400 border-stone-500/20"
      }`}
    >
      {status === "shipped" && <Truck size={10} />}
      {status === "delivered" && <CheckCircle size={10} />}
      {status === "packed" && <Package size={10} />}
      {status === "accepted" && <ThumbsUp size={10} />}
      {status === "pending" && <Clock size={10} />}
      {status === "rejected" && <ThumbsDown size={10} />}
      {status?.replace(/_/g, " ") || "unknown"}
    </span>
  );
};

export default function Orders() {
  const dispatch = useDispatch();
  const orders = useSelector((state) => state.vendor.orders);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [trackingModal, setTrackingModal] = useState(null);
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("UPS");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [trackingSubmitting, setTrackingSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vendorApi.getOrders();
      dispatch(setOrders(res.orders || []));
    } catch (err) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ── Filtering ───────────────────────────────────────────────────────────
  const filteredOrders = orders.filter((order) => {
    if (statusFilter && order.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const displayId = String(order.display_id || order.id.slice(-6).toUpperCase());
      if (!displayId.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Ship Order (with tracking) ───────────────────────────────────────────
  const handleShipOrder = async (e) => {
    e.preventDefault();
    if (!trackingCode.trim()) {
      return toast.error("Tracking code is required");
    }
    setTrackingSubmitting(true);
    try {
      await vendorApi.shipOrder(trackingModal.id, {
        tracking_number: trackingCode.trim(),
        carrier: trackingCarrier,
        tracking_url: trackingUrl.trim(),
      });
      toast.success("Order shipped with tracking information");
      setTrackingModal(null);
      setTrackingCode("");
      setTrackingCarrier("Canada Post");
      setTrackingUrl("");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to ship order");
    } finally {
      setTrackingSubmitting(false);
    }
  };

  // ── State Machine Actions (accept/pack/ship/deliver) ──────────────────────
  const [actionLoading, setActionLoading] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleOrderAction = async (orderId, action) => {
    setActionLoading(orderId);
    setActionModal(null);
    try {
      await vendorApi.orderAction(orderId, action, action === "reject" ? rejectReason : "");
      const label = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "fulfilled";
      toast.success(`Order ${label} successfully`);
      setRejectReason("");
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} order`);
    } finally {
      setActionLoading(null);
    }
  };

  // New state machine handlers using the dedicated endpoints
  const handleStateAction = async (orderId, action) => {
    setActionLoading(orderId);
    setActionModal(null);
    try {
      switch (action) {
        case "accept":
          await vendorApi.acceptOrder(orderId);
          break;
        case "pack":
          await vendorApi.packOrder(orderId);
          break;
        case "deliver":
          await vendorApi.deliverOrder(orderId);
          break;
        default:
          return toast.error(`Unknown action: ${action}`);
      }
      toast.success(`Order ${action}ed successfully`);
      fetchOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} order`);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Status tabs for filter ──────────────────────────────────────────────
  const statusTabs = [
    { value: "", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "processing", label: "Processing" },
    { value: "fulfilled", label: "Fulfilled" },
    { value: "completed", label: "Completed" },
    { value: "canceled", label: "Canceled" },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-3xl font-black mb-2">Orders.</h1>
          <p className="text-sm text-stone-400 font-bold">
            Monitor incoming sales, track shipments, and manage fulfillment.
          </p>
        </div>

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              placeholder="Search by order ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-stone-900 border border-stone-800 rounded-xl text-xs font-bold text-white placeholder-stone-600 outline-none focus:border-emerald-500/50 transition-all"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex gap-1 flex-wrap">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  statusFilter === tab.value
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "text-stone-500 hover:text-stone-300 border border-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchOrders}
            className="p-2.5 rounded-xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white transition-all"
          >
            <Loader2 size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* ── Order List ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="h-[40vh] flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-400" size={32} />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-16 text-center shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-stone-950 flex items-center justify-center mx-auto mb-6 text-stone-500">
              <ShoppingBag size={28} />
            </div>
            <h3 className="text-lg font-black mb-2">
              {searchQuery || statusFilter ? "No matching orders" : "No Sales Yet"}
            </h3>
            <p className="text-stone-500 text-sm font-semibold max-w-sm mx-auto">
              {searchQuery || statusFilter
                ? "Try adjusting your search or filter."
                : "Once customers purchase products linked to your storefront, their orders will display here."}
            </p>
          </div>
        ) : (
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-950/40">
                  <tr>
                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                      Order
                    </th>
                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                      Date
                    </th>                      <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                      Customer
                    </th>
                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                      Items
                    </th>
                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                      Payment
                    </th>
                    <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                      My Fulfillment
                    </th>
                    <th className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-widest text-emerald-400">
                      My Share
                    </th>
                    <th className="px-6 py-4 text-center text-[9px] font-black uppercase tracking-widest text-stone-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/40">
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-stone-950/20 transition-colors"
                    >
                      <td className="px-6 py-5 text-sm font-black text-emerald-400">
                        #{order.display_id || order.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="px-6 py-5 text-xs text-stone-300">
                        {new Date(order.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-xs text-stone-300 font-bold truncate max-w-[160px]">{order.customer_email || "—"}</p>
                      </td>
                      <td className="px-6 py-5 text-xs text-stone-400">
                        {order.items.reduce((s, i) => s + i.quantity, 0)} unit(s)
                        {(order.has_digital_items || order.items.some(i => i.metadata?.is_digital || i.metadata?.is_digital === 'true')) && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase tracking-wider inline-flex items-center gap-0.5">
                            <Download size={8} /> Digital
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                          order.payment_status === "captured" || order.payment_status === "paid"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : order.payment_status === "awaiting" || order.payment_status === "pending"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-stone-500/10 text-stone-400 border-stone-500/20"
                        }`}>
                          {order.payment_status || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1">
                          {(order.has_digital_items || order.items.some(i => i.metadata?.is_digital || i.metadata?.is_digital === 'true')) ? (
                            <>
                              <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border bg-blue-500/10 text-blue-400 border-blue-500/20 flex items-center gap-1 w-fit">
                                <Download size={10} /> Download Available
                              </span>
                              {/* Show physical items fulfillment status if there's a mix */}
                              {order.items.some(i => !(i.metadata?.is_digital || i.metadata?.is_digital === 'true')) && (
                                <>
                                  {vendorStatusBadge(order.vendor_fulfillment_status)}
                                  {order.tracking && (
                                    <span className="text-[9px] text-stone-500 font-mono font-medium flex items-center gap-1 mt-0.5">
                                      <Truck size={8} />
                                      {order.tracking.tracking_code}
                                    </span>
                                  )}
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              {vendorStatusBadge(order.vendor_fulfillment_status)}
                              {order.tracking && (
                                <span className="text-[9px] text-stone-500 font-mono font-medium flex items-center gap-1 mt-0.5">
                                  <Truck size={8} />
                                  {order.tracking.tracking_code}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right font-black text-white">
                        ${order.vendor_subtotal?.toFixed(2)}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="p-2 bg-stone-950 border border-stone-800 hover:border-emerald-500/20 text-stone-400 hover:text-emerald-400 rounded-xl transition-all"
                            title="View details"
                          >
                            <Eye size={14} />
                          </button>
                          {order.status !== "canceled" && order.status !== "completed" && (
                            <>
                              {/* State machine action buttons */}
                          {order.status !== "canceled" && order.status !== "completed" && order.vendor_fulfillment_status !== "delivered" && order.vendor_fulfillment_status !== "rejected" && (
                            <>
                              {/* PENDING → ACCEPT */}
                              {(order.vendor_fulfillment_status === "pending") && (
                                <>
                                  <button
                                    onClick={() => setActionModal({ id: order.id, action: "accept" })}
                                    disabled={actionLoading === order.id}
                                    className="p-2 bg-stone-950 border border-stone-800 hover:border-emerald-500/20 text-stone-400 hover:text-emerald-400 rounded-xl transition-all disabled:opacity-30"
                                    title="Accept order — start processing"
                                  >
                                    <ThumbsUp size={14} />
                                  </button>
                                  <button
                                    onClick={() => setActionModal({ id: order.id, action: "reject" })}
                                    disabled={actionLoading === order.id}
                                    className="p-2 bg-stone-950 border border-stone-800 hover:border-red-500/20 text-stone-400 hover:text-red-400 rounded-xl transition-all disabled:opacity-30"
                                    title="Reject order"
                                  >
                                    <ThumbsDown size={14} />
                                  </button>
                                </>
                              )}
                              
                              {/* ACCEPTED → PACK */}
                              {order.vendor_fulfillment_status === "accepted" && (
                                <button
                                  onClick={() => handleStateAction(order.id, "pack")}
                                  disabled={actionLoading === order.id}
                                  className="p-2 bg-stone-950 border border-stone-800 hover:border-indigo-500/20 text-stone-400 hover:text-indigo-400 rounded-xl transition-all disabled:opacity-30"
                                  title="Mark as packed"
                                >
                                  <Package size={14} />
                                </button>
                              )}
                              
                              {/* PACKED → SHIP */}
                              {order.vendor_fulfillment_status === "packed" && (
                                <button
                                  onClick={() => {
                                    setTrackingModal(order);
                                    setTrackingCode(order.tracking?.tracking_code || "");
                                    setTrackingCarrier(order.tracking?.carrier || "Canada Post");
                                    setTrackingUrl(order.tracking?.tracking_url || "");
                                  }}
                                  className="p-2 bg-stone-950 border border-stone-800 hover:border-blue-500/20 text-stone-400 hover:text-blue-400 rounded-xl transition-all"
                                  title="Ship order — add tracking"
                                >
                                  <Truck size={14} />
                                </button>
                              )}
                              
                              {/* SHIPPED → DELIVER */}
                              {order.vendor_fulfillment_status === "shipped" && (
                                <button
                                  onClick={() => {
                                    setActionModal({ id: order.id, action: "deliver" });
                                  }}
                                  disabled={actionLoading === order.id}
                                  className="p-2 bg-stone-950 border border-stone-800 hover:border-emerald-500/20 text-stone-400 hover:text-emerald-400 rounded-xl transition-all disabled:opacity-30"
                                  title="Mark as delivered"
                                >
                                  <CheckCircle size={14} />
                                </button>
                              )}
                            </>
                          )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Order Details Modal ────────────────────────────────────────── */}
        <AnimatePresence>
          {selectedOrder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedOrder(null)}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-stone-900 border border-stone-800 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10 text-white"
              >
                <div className="p-6 border-b border-stone-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black">
                      Order #{selectedOrder.display_id || selectedOrder.id.slice(-6).toUpperCase()}
                    </h3>
                    <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                      {new Date(selectedOrder.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => setSelectedOrder(null)} className="text-stone-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6">
                  {/* Status badges */}
                  <div className="flex gap-2 mb-5 flex-wrap">
                    {statusBadge(selectedOrder.status)}
                    <div className="flex items-center gap-1.5">
                      {vendorStatusBadge(selectedOrder.vendor_fulfillment_status)}
                    </div>
                    {selectedOrder.tracking && (
                      <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                        <Truck size={10} /> {selectedOrder.tracking.carrier || "Shipped"}
                      </span>
                    )}
                  </div>

                  {/* Payment & Fulfillment Status */}
                  <div className="mb-5 grid grid-cols-2 gap-3">
                    <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl">
                      <p className="text-[8px] font-black uppercase tracking-widest text-stone-500 mb-1">Payment</p>
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                        selectedOrder.payment_status === "captured" || selectedOrder.payment_status === "paid"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : selectedOrder.payment_status === "awaiting" || selectedOrder.payment_status === "pending"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-stone-500/10 text-stone-400 border-stone-500/20"
                      }`}>
                        {selectedOrder.payment_status || "—"}
                      </span>
                    </div>
                    <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl">
                      <p className="text-[8px] font-black uppercase tracking-widest text-stone-500 mb-1">Fulfillment</p>
                      <span className="text-[10px] font-bold text-stone-300">
                        {selectedOrder.fulfillment_status || selectedOrder.status || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="mb-5 p-4 bg-stone-950 border border-stone-800 rounded-2xl">
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-3">Vendor Timeline</p>
                    <div className="flex flex-col gap-2">
                      {[
                        { state: "accepted", label: "Accepted", icon: <ThumbsUp size={10} /> },
                        { state: "packed", label: "Packed", icon: <Package size={10} /> },
                        { state: "shipped", label: "Shipped", icon: <Truck size={10} /> },
                        { state: "delivered", label: "Delivered", icon: <CheckCircle size={10} /> },
                      ].map((step, i) => {
                        const states = ["pending", "accepted", "packed", "shipped", "delivered"];
                        const currentIdx = states.indexOf(selectedOrder.vendor_fulfillment_status);
                        const stepIdx = states.indexOf(step.state);
                        const done = stepIdx <= currentIdx && currentIdx >= 0;
                        // Get timestamp for this state from vendor_timestamps
                        const ts = selectedOrder.vendor_timestamps?.[step.state];
                        return (
                          <div key={step.state} className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                              done
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-stone-800 text-stone-600"
                            }`}>
                              {done ? <CheckCircle size={10} /> : step.icon}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className={`text-[10px] font-bold ${done ? "text-emerald-400" : "text-stone-600"}`}>
                                {step.label}
                              </span>
                              {ts && (
                                <span className="text-[8px] text-stone-500 font-medium">
                                  {new Date(ts).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                            {done && currentIdx === stepIdx && (
                              <span className="text-[8px] font-black uppercase tracking-wider text-emerald-500 ml-auto shrink-0">
                                Current
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Customer info */}
                  {selectedOrder.customer_email && (
                    <div className="mb-5 p-4 bg-stone-950 border border-stone-800 rounded-2xl">
                      <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1.5">Customer</p>
                      <p className="text-sm font-bold text-white">{selectedOrder.customer_email}</p>
                      {selectedOrder.shipping_address && (
                        <div className="mt-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1">Shipping Address</p>
                          <p className="text-xs text-stone-300 font-medium">
                            {selectedOrder.shipping_address.address_1}
                            {selectedOrder.shipping_address.address_2 && `, ${selectedOrder.shipping_address.address_2}`}
                            <br />
                            {[selectedOrder.shipping_address.city, selectedOrder.shipping_address.province, selectedOrder.shipping_address.postal_code].filter(Boolean).join(", ")}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Items */}
                  <div className="flex flex-col gap-3 mb-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                      Your Items ({selectedOrder.items.length})
                    </p>
                    <div className="flex flex-col gap-3 max-h-[200px] overflow-y-auto">
                      {selectedOrder.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between items-start gap-4 p-3 bg-stone-950 border border-stone-800 rounded-xl"
                        >
                          <div>
                            <p className="text-sm font-bold">{item.title}</p>
                            <p className="text-[10px] text-stone-500 font-semibold mt-0.5">
                              Qty: {item.quantity} × ${(item.unit_price / 100).toFixed(2)}
                            </p>
                          </div>
                          <span className="text-sm font-black shrink-0">
                            ${((item.unit_price * item.quantity) / 100).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tracking info */}
                  {selectedOrder.tracking && (
                    <div className="p-4 bg-stone-950 border border-blue-500/20 rounded-2xl mb-5">
                      <div className="flex items-center gap-2 mb-2">
                        <Truck size={14} className="text-blue-400" />
                        <span className="text-xs font-black text-blue-400">Tracking Information</span>
                      </div>
                      <p className="text-xs text-stone-300">
                        Carrier: {selectedOrder.tracking.carrier}
                      </p>
                      <p className="text-xs text-stone-300">
                        Code: {selectedOrder.tracking.tracking_code}
                      </p>
                      {selectedOrder.tracking.tracking_url && (
                        <a
                          href={selectedOrder.tracking.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-400 hover:underline flex items-center gap-1 mt-1"
                        >
                          <ExternalLink size={10} /> Track Package
                        </a>
                      )}
                    </div>
                  )}

                  {/* Total */}
                  <div className="bg-stone-950 p-5 rounded-2xl border border-stone-800 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">
                        My Revenue Share
                      </p>
                      <p className="text-[9px] text-stone-600 font-bold">
                        Excludes other vendors' items
                      </p>
                    </div>
                    <span className="text-2xl font-black text-emerald-400">
                      ${selectedOrder.vendor_subtotal?.toFixed(2)}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── Action Confirmation Modal ───────────────────────────────────── */}
        <AnimatePresence>
          {actionModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActionModal(null)}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-stone-900 border border-stone-800 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative z-10 text-center"
              >
                <div className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center ${
                  actionModal.action === "accept"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : actionModal.action === "reject"
                    ? "bg-red-500/10 text-red-400"
                    : actionModal.action === "deliver"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-blue-500/10 text-blue-400"
                }`}>
                  {actionModal.action === "accept" ? (
                    <ThumbsUp size={28} />
                  ) : actionModal.action === "reject" ? (
                    <ThumbsDown size={28} />
                  ) : actionModal.action === "deliver" ? (
                    <CheckCircle size={28} />
                  ) : (
                    <Package size={28} />
                  )}
                </div>
                <h3 className="text-xl font-black text-white mb-2 capitalize">
                  {actionModal.action === "deliver" ? "Confirm Delivery" : `${actionModal.action} Order`}
                </h3>
                <p className="text-sm text-stone-400 mb-6">
                  {actionModal.action === "accept"
                    ? "Confirm that you will fulfill this order. The customer will be notified."
                    : actionModal.action === "reject"
                    ? "Rejecting will cancel your participation in this order. Provide a reason below."
                    : actionModal.action === "deliver"
                    ? "Mark this order as delivered to the customer. This will finalize the fulfillment and update earnings."
                    : "Mark this order as fulfilled. Tracking info can be added separately."}
                </p>

                {/* Rejection reason input */}
                {actionModal.action === "reject" && (
                  <div className="mb-6">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5 text-left">
                      Reason for rejection
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. Out of stock, unable to fulfill this item..."
                      rows={2}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-white text-sm font-bold outline-none placeholder-stone-600 focus:border-red-500/50 transition-all resize-none"
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setActionModal(null)}
                    className="flex-1 py-4 bg-stone-950 border border-stone-800 text-stone-300 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-stone-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      // Use state machine handler for accept/deliver, fallback for reject
                      if (actionModal.action === "accept" || actionModal.action === "deliver") {
                        handleStateAction(actionModal.id, actionModal.action);
                      } else {
                        handleOrderAction(actionModal.id, actionModal.action);
                      }
                    }}
                    disabled={actionLoading === actionModal.id}
                    className={`flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      actionModal.action === "accept"
                        ? "bg-emerald-500 text-stone-950 hover:bg-emerald-400"
                        : actionModal.action === "reject"
                        ? "bg-red-500 text-white hover:bg-red-400"
                        : "bg-emerald-500 text-stone-950 hover:bg-emerald-400"
                    } disabled:opacity-50`}
                  >
                    {actionLoading === actionModal.id ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      `Yes, ${actionModal.action === "deliver" ? "deliver" : actionModal.action}`
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── Tracking Modal ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {trackingModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setTrackingModal(null)}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              />
              <motion.form
                onSubmit={handleShipOrder}
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-[2.5rem] p-6 shadow-2xl relative z-10"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                      <Truck size={18} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">Ship Order</h3>
                      <p className="text-[10px] text-stone-500 font-bold">
                        Order #{trackingModal.display_id || trackingModal.id.slice(-6).toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTrackingModal(null)}
                    className="text-stone-400 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Carrier */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5">
                      Carrier
                    </label>
                    <select
                      value={trackingCarrier}
                      onChange={(e) => setTrackingCarrier(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-white text-sm font-bold outline-none focus:border-emerald-500/50 transition-all"
                    >
                      <option value="UPS">UPS</option>
                      <option value="FedEx">FedEx</option>
                      <option value="USPS">USPS</option>
                      <option value="DHL">DHL</option>
                      <option value="Canada Post">Canada Post</option>
                      <option value="Purolator">Purolator</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Tracking Code */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5">
                      Tracking Code <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value)}
                      placeholder="e.g. 1Z999AA10123456784"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-white text-sm font-bold outline-none placeholder-stone-600 focus:border-emerald-500/50 transition-all"
                      required
                    />
                  </div>

                  {/* Tracking URL */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5">
                      Tracking URL <span className="text-stone-600 font-normal normal-case">— optional</span>
                    </label>
                    <input
                      type="url"
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder="https://www.ups.com/track?num=..."
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-white text-sm font-bold outline-none placeholder-stone-600 focus:border-emerald-500/50 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={trackingSubmitting || !trackingCode.trim()}
                    className="w-full mt-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-black text-sm uppercase tracking-wider py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {trackingSubmitting ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <>
                        <Send size={16} /> Save Tracking
                      </>
                    )}
                  </button>
                </div>
              </motion.form>
            </div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
