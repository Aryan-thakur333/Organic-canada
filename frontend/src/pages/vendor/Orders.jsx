import React, { useEffect, useState, useCallback, useRef } from "react";
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
import { normalizeVendorOrder, safeArray, safeNumber } from "../../utils/vendorOrderNormalizer";

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
    processing: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    prepared: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    ready_to_ship: "bg-teal-500/10 text-teal-400 border-teal-500/20",
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

const formatMoney = (amount, currencyCode = "CAD") => {
  const minorUnits = Number(amount ?? 0);

  if (!Number.isFinite(minorUnits)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "CAD",
    }).format(0);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currencyCode || "CAD").toUpperCase(),
  }).format(minorUnits / 100);
};

function getVendorOrderMoney(order) {
  const gross = Number(order?.item_subtotal ?? order?.gross_amount ?? 0);
  const commission = Number(order?.commission_total ?? order?.commission_amount ?? 0);
  const explicitNet = order?.vendor_net_total ?? order?.net_amount;
  const net = explicitNet != null ? Number(explicitNet) : Math.max(0, gross - commission);

  return {
    gross: Number.isFinite(gross) ? gross : 0,
    commission: Number.isFinite(commission) ? commission : 0,
    net: Number.isFinite(net) ? net : 0,
    currencyCode: String(order?.currency_code || "cad").toUpperCase(),
  };
}

export function getVendorOrderActions(order) {
  const status = String(order?.vendor_fulfillment_status || order?.status || "pending").toLowerCase();

  if (status === "delivered" || order?.fulfillment_status === "delivered") {
    return [];
  }
  if (status === "shipped") {
    return ["deliver"];
  }
  if (status === "ready_to_ship" || status === "fulfilled") {
    return ["ship"];
  }
  if (status === "prepared") {
    return ["fulfill"];
  }
  if (status === "processing" || status === "allocated") {
    return ["prepare"];
  }
  if (status === "accepted") {
    return ["allocate", "prepare"];
  }
  if (status === "pending") {
    return ["accept", "reject"];
  }
  return [];
}

export function getNormalizedItems(order) {
  if (!order) return [];
  if (Array.isArray(order.items)) return order.items;
  if (Array.isArray(order.vendor_order_items)) return order.vendor_order_items;
  return [];
}

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
  const [selectedOrderLive, setSelectedOrderLive] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [personalizationLoading, setPersonalizationLoading] = useState(null);
  const [itemNotes, setItemNotes] = useState({});

  const [error, setError] = useState(null);
  const actionLocksRef = useRef(new Set());
  const [activeActionKey, setActiveActionKey] = useState(null);

  const runLockedOrderAction = async (orderId, action, callback) => {
    const key = `${orderId}:${action}`;
    if (actionLocksRef.current.has(key)) {
      console.log(`[ACTION_LOCK] Prevented duplicate execution for ${key}`);
      return;
    }
    actionLocksRef.current.add(key);
    setActiveActionKey(key);
    setActionLoading(orderId);
    setActionModal(null);
    try {
      return await callback();
    } finally {
      actionLocksRef.current.delete(key);
      setActiveActionKey(null);
      setActionLoading(null);
    }
  };

  const fetchSingleOrder = useCallback(async (id) => {
    setModalLoading(true);
    try {
      const res = await vendorApi.getOrder(id);
      const order = res?.order ?? res?.data?.order ?? null;
      if (order) {
        setSelectedOrderLive(order);
        dispatch(setOrders(orders.map((o) => o.id === id ? order : o)));
      }
    } catch (err) {
      console.error("[VENDOR_ORDER_DETAIL_FETCH_FAILED]", err);
      if (err.response?.status === 429) {
        toast.error("Rate limit exceeded. Try again in a moment.");
      } else {
        toast.error("Failed to refresh order details");
      }
    } finally {
      setModalLoading(false);
    }
  }, [orders, dispatch]);

  useEffect(() => {
    if (selectedOrder?.id) {
      setSelectedOrderLive(selectedOrder);
      fetchSingleOrder(selectedOrder.id);
    } else {
      setSelectedOrderLive(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrder]);

  // Request guard — prevents concurrent GET /vendor/orders calls
  const fetchInFlightRef = useRef(false);

  const fetchOrders = useCallback(async () => {
    if (fetchInFlightRef.current) return; // skip if already in-flight
    fetchInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await vendorApi.getOrders();
      // Support both response shapes
      const list = res?.orders ?? res?.data?.orders ?? [];
      dispatch(setOrders(list));
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Vendor orders could not be loaded.";
      setError(msg);
      // Do NOT toast here — the error panel in the UI is sufficient
    } finally {
      setLoading(false);
      fetchInFlightRef.current = false;
    }
  }, [dispatch]);

  // Fire once on mount — do NOT include fetchOrders in deps array
  // (useCallback already memoizes it, and including it would still be stable,
  //  but make intent explicit: one call on mount only)
  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const handleActionError = async (orderId, action, err) => {
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message || "";
    const code = err.response?.data?.code;

    if (code === "VENDOR_INVENTORY_LEVEL_MISSING") {
      // Backend provides: "Inventory is not configured for Organic OIL at organic canada Vendor Warehouse."
      toast.error(message, { duration: 6000 });
      return;
    }
    
    if (code === "VENDOR_INSUFFICIENT_INVENTORY") {
      const details = err.response?.data?.details?.[0] || {};
      const requested = details.requested_quantity ?? details.requested ?? 0;
      const available = details.available_quantity ?? details.available ?? 0;
      toast.error(`Requested: ${requested} Available: ${available}`, { duration: 6000 });
      return;
    }
    
    if (status === 409 || message.includes("Invalid state transition")) {
      // 1. refetch order details
      await fetchSingleOrder(orderId);
      await fetchOrders();
      
      // 2. check the specific desync case
      if (message.includes("ready_to_ship") && message.includes("prepared")) {
        toast.error("This order is already ready to ship.", { duration: 5000 });
      } else {
        toast.error("Order status changed. Available actions were refreshed.", { duration: 5000 });
      }
    } else if (status === 429) {
      toast.error("Rate limit exceeded. Please wait a moment.", { duration: 5000 });
    } else {
      toast.error(message || `Failed to ${action} order`);
    }
  };

  const handleShipOrder = async (e) => {
    e.preventDefault();
    if (!trackingCode.trim()) {
      return toast.error("Tracking code is required");
    }
    const orderId = trackingModal.id;
    await runLockedOrderAction(orderId, "ship", async () => {
      setTrackingSubmitting(true);
      try {
        const res = await vendorApi.shipOrder(orderId, {
          tracking_number: trackingCode.trim(),
          carrier: trackingCarrier,
          tracking_url: trackingUrl.trim(),
        });
        toast.success("Order shipped with tracking information");
        setTrackingModal(null);
        setTrackingCode("");
        setTrackingCarrier("Canada Post");
        setTrackingUrl("");
        
        const updatedOrder = res?.order ?? res?.data?.order;
        if (updatedOrder) {
          dispatch(setOrders(orders.map((o) => o.id === orderId ? updatedOrder : o)));
          if (selectedOrder?.id === orderId) setSelectedOrderLive(updatedOrder);
        } else {
          await fetchOrders();
          if (selectedOrder?.id === orderId) await fetchSingleOrder(orderId);
        }
      } finally {
        setTrackingSubmitting(false);
      }
    }).catch(err => {
      handleActionError(orderId, "ship", err);
    });
  };

  // ── State Machine Actions (accept/pack/ship/deliver) ──────────────────────
  const [actionLoading, setActionLoading] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleOrderAction = async (orderId, action) => {
    await runLockedOrderAction(orderId, action, async () => {
      let res;
      if (action === "reject") {
        res = await vendorApi.rejectOrder(orderId, rejectReason);
      } else {
        res = await vendorApi.orderAction(orderId, action, action === "reject" ? rejectReason : "");
      }
      const label = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "fulfilled";
      toast.success(`Order ${label} successfully`);
      setRejectReason("");
      
      const updatedOrder = res?.order ?? res?.data?.order;
      if (updatedOrder) {
        dispatch(setOrders(orders.map((o) => o.id === orderId ? updatedOrder : o)));
        if (selectedOrder?.id === orderId) setSelectedOrderLive(updatedOrder);
      } else {
        await fetchOrders();
        if (selectedOrder?.id === orderId) await fetchSingleOrder(orderId);
      }
    }).catch(err => {
      handleActionError(orderId, action, err);
    });
  };

  // Stock locations state
  const [stockLocations, setStockLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(false);

  // Fetch stock locations once
  useEffect(() => {
    const fetchLocations = async () => {
      // This endpoint is optional for older vendor API deployments and partial
      // test doubles. Fulfillment still shows a clear location-required error.
      if (typeof vendorApi.getStockLocations !== "function") return;
      setLocationsLoading(true);
      try {
        const res = await vendorApi.getStockLocations();
        const locs = res?.locations ?? [];
        setStockLocations(locs);
        if (locs.length === 1) {
          setSelectedLocationId(locs[0].id);
        }
      } catch (err) {
        console.error("[VENDOR_STOCK_LOCATIONS_FETCH_FAILED]", err);
      } finally {
        setLocationsLoading(false);
      }
    };
    fetchLocations();
  }, []);

  // New state machine handlers using the dedicated endpoints
  const handleStateAction = async (orderId, action, extraPayload = {}) => {
    await runLockedOrderAction(orderId, action, async () => {
      let res;
      switch (action) {
        case "accept":
          res = await vendorApi.acceptOrder(orderId);
          break;
        case "reject":
          res = await vendorApi.rejectOrder(orderId, rejectReason);
          break;
        case "allocate":
          res = await vendorApi.allocateOrder(orderId);
          break;
        case "prepare":
          res = await vendorApi.prepareOrder(orderId);
          break;
        case "fulfill": {
          // Use the selected location ID — never send "default"
          const locId = selectedLocationId || extraPayload.location_id;
          if (!locId) {
            return toast.error("No stock location is assigned to your vendor account.");
          }
          res = await vendorApi.fulfillOrder(orderId, locId);
          break;
        }
        case "deliver":
          res = await vendorApi.deliverOrder(orderId);
          break;
        default:
          return toast.error(`Unknown action: ${action}`);
      }
      toast.success(`Order ${action}ed successfully`);
      setRejectReason("");
      
      const updatedOrder = res?.order ?? res?.data?.order;
      if (updatedOrder) {
        dispatch(setOrders(orders.map((o) => o.id === orderId ? updatedOrder : o)));
        if (selectedOrder?.id === orderId) setSelectedOrderLive(updatedOrder);
      } else {
        await fetchOrders();
        if (selectedOrder?.id === orderId) await fetchSingleOrder(orderId);
      }
    }).catch(err => {
      handleActionError(orderId, action, err);
    });
  };

  const handleCreateFulfillment = async (order) => {
    const locId = selectedLocationId;
    if (!locId) {
      return toast.error("No stock location is assigned to your vendor account.");
    }
    await runLockedOrderAction(order.id, "fulfill", async () => {
      const res = await vendorApi.fulfillOrder(order.id, locId);
      toast.success("Order fulfilled successfully");
      
      const updatedOrder = res?.order ?? res?.data?.order;
      if (updatedOrder) {
        dispatch(setOrders(orders.map((o) => o.id === order.id ? updatedOrder : o)));
        if (selectedOrder?.id === order.id) setSelectedOrderLive(updatedOrder);
      } else {
        await fetchOrders();
        if (selectedOrder?.id === order.id) await fetchSingleOrder(order.id);
      }
    }).catch(err => {
      handleActionError(order.id, "fulfill", err);
    });
  };

  const handleUpdateItemPersonalization = async (itemId, action) => {
    if (!selectedOrderLive?.id || personalizationLoading) return;
    setPersonalizationLoading(itemId);
    const notes = itemNotes[itemId] || "";
    try {
      await vendorApi.updateOrderItemPersonalizationStatus(selectedOrderLive.id, itemId, action, notes);
      toast.success(`Item personalization updated to ${action}`);
      setItemNotes(prev => ({ ...prev, [itemId]: "" }));
      await fetchSingleOrder(selectedOrderLive.id);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to update personalization status`);
    } finally {
      setPersonalizationLoading(null);
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
        {loading && orders.length === 0 ? (
          <div className="h-[40vh] flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-400" size={32} />
          </div>
        ) : error && orders.length === 0 ? (
          /* ── Error Panel ─ shown when GET /vendor/orders fails ─────────── */
          <div className="bg-stone-900 border border-red-500/20 rounded-[2.5rem] p-16 text-center shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6 text-red-400">
              <ShoppingBag size={28} />
            </div>
            <h3 className="text-lg font-black mb-2 text-red-400">Could not load orders</h3>
            <p className="text-stone-500 text-sm font-semibold max-w-sm mx-auto mb-6">
              {error}
            </p>
            <button
              onClick={fetchOrders}
              className="px-6 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-500/20 transition-all"
            >
              Retry
            </button>
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
                  <tr><th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Order</th><th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Date</th><th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Customer</th><th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Items</th><th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">Payment</th><th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">My Fulfillment</th><th className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-widest text-emerald-400">Vendor Net</th><th className="px-6 py-4 text-center text-[9px] font-black uppercase tracking-widest text-stone-500">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-800/40">
                  {filteredOrders.map((order) => {
                    const financials = getVendorOrderMoney(order);
                    const allowedActions = getVendorOrderActions(order);
                    const items = getNormalizedItems(order);
                    return (
                      <tr key={order.id} className="hover:bg-stone-950/20 transition-colors"><td className="px-6 py-5 text-sm font-black text-emerald-400">#{order.display_id || order.id.slice(-6).toUpperCase()}</td><td className="px-6 py-5 text-xs text-stone-300">{new Date(order.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</td><td className="px-6 py-5"><p className="text-xs text-stone-300 font-bold truncate max-w-[160px]">{order.customer_email || "—"}</p></td><td className="px-6 py-5 text-xs text-stone-400">{items.reduce((s, i) => s + i.quantity, 0)} unit(s){(order.has_digital_items || items.some(i => i.metadata?.is_digital || i.metadata?.is_digital === 'true')) && (<span className="ml-2 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[8px] font-black uppercase tracking-wider inline-flex items-center gap-0.5"><Download size={8} /> Digital</span>)}</td><td className="px-6 py-5"><span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${order.payment_status === "captured" || order.payment_status === "paid" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : order.payment_status === "awaiting" || order.payment_status === "pending" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-stone-500/10 text-stone-400 border-stone-500/20"}`}>{order.payment_status || "—"}</span></td><td className="px-6 py-5"><div className="flex flex-col gap-1">{(order.has_digital_items || items.some(i => i.metadata?.is_digital || i.metadata?.is_digital === 'true')) ? (<><span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border bg-blue-500/10 text-blue-400 border-blue-500/20 flex items-center gap-1 w-fit"><Download size={10} /> Download Available</span>{items.some(i => !(i.metadata?.is_digital || i.metadata?.is_digital === 'true')) && (<>{vendorStatusBadge(order.vendor_fulfillment_status)}{order.tracking && (<span className="text-[9px] text-stone-500 font-mono font-medium flex items-center gap-1 mt-0.5"><Truck size={8} />{order.tracking.tracking_code}</span>)}</>)}</>) : (<>{vendorStatusBadge(order.vendor_fulfillment_status)}{order.tracking && (<span className="text-[9px] text-stone-500 font-mono font-medium flex items-center gap-1 mt-0.5"><Truck size={8} />{order.tracking.tracking_code}</span>)}</>)}</div></td><td className="px-6 py-5 text-right font-black text-emerald-400">{formatMoney(financials.net, financials.currencyCode)}</td><td className="px-6 py-5"><div className="flex items-center justify-center gap-1.5"><button onClick={() => setSelectedOrder(order)} className="p-2 bg-stone-950 border border-stone-800 hover:border-emerald-500/20 text-stone-400 hover:text-emerald-400 rounded-xl transition-all" title="View details"><Eye size={14} /></button>{allowedActions.includes("accept") && (<><button onClick={() => setActionModal({ id: order.id, action: "accept" })} disabled={actionLoading === order.id} className="p-2 bg-stone-950 border border-stone-800 hover:border-emerald-500/20 text-stone-400 hover:text-emerald-400 rounded-xl transition-all disabled:opacity-30" title="Accept order — start processing"><ThumbsUp size={14} /></button><button onClick={() => setActionModal({ id: order.id, action: "reject" })} disabled={actionLoading === order.id} className="p-2 bg-stone-950 border border-stone-800 hover:border-red-500/20 text-stone-400 hover:text-red-400 rounded-xl transition-all disabled:opacity-30" title="Reject order"><ThumbsDown size={14} /></button></>)}{allowedActions.includes("allocate") && (<button onClick={() => handleStateAction(order.id, "allocate")} disabled={actionLoading === order.id} className="p-2 bg-stone-950 border border-stone-800 hover:border-indigo-500/20 text-stone-400 hover:text-indigo-400 rounded-xl transition-all disabled:opacity-30" title="Allocate inventory"><Package size={14} /></button>)}{allowedActions.includes("prepare") && (<button onClick={() => handleStateAction(order.id, "prepare")} disabled={actionLoading === order.id} className="p-2 bg-stone-950 border border-stone-800 hover:border-yellow-500/20 text-stone-400 hover:text-yellow-400 rounded-xl transition-all disabled:opacity-30" title="Prepare/Pack order"><Package size={14} /></button>)}{allowedActions.includes("fulfill") && (<button onClick={() => handleStateAction(order.id, "fulfill")} disabled={actionLoading === order.id} className="p-2 bg-stone-950 border border-stone-800 hover:border-teal-500/20 text-stone-400 hover:text-teal-400 rounded-xl transition-all disabled:opacity-30" title="Create fulfillment"><PackageCheck size={14} /></button>)}{allowedActions.includes("ship") && (<button onClick={() => { setTrackingModal(order); setTrackingCode(order.tracking?.tracking_code || ""); setTrackingCarrier(order.tracking?.carrier || "Canada Post"); setTrackingUrl(order.tracking?.tracking_url || ""); }} className="p-2 bg-stone-950 border border-stone-800 hover:border-blue-500/20 text-stone-400 hover:text-blue-400 rounded-xl transition-all" title="Ship order"><Truck size={14} /></button>)}{allowedActions.includes("deliver") && (<button onClick={() => { setActionModal({ id: order.id, action: "deliver" }); }} disabled={actionLoading === order.id} className="p-2 bg-stone-950 border border-stone-800 hover:border-emerald-500/20 text-stone-400 hover:text-emerald-400 rounded-xl transition-all disabled:opacity-30" title="Mark as delivered"><CheckCircle size={14} /></button>)}</div></td></tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Order Details Modal ────────────────────────────────────────── */}
        <AnimatePresence>
          {selectedOrder && (() => {
            const orderObj = selectedOrderLive || selectedOrder;
            const allowedActions = getVendorOrderActions(orderObj);
            return (
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
                        Order Details - #{orderObj.display_id || orderObj.id.slice(-6).toUpperCase()}
                      </h3>
                      <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                        {new Date(orderObj.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button onClick={() => setSelectedOrder(null)} className="text-stone-400 hover:text-white">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="p-6 max-h-[60vh] overflow-y-auto relative">
                    {modalLoading && (
                      <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center z-20">
                        <Loader2 className="animate-spin text-emerald-400" size={32} />
                      </div>
                    )}
                    {/* Status badges */}
                    <div className="flex gap-2 mb-5 flex-wrap">
                      {statusBadge(orderObj.status)}
                      <div className="flex items-center gap-1.5">
                        {vendorStatusBadge(orderObj.vendor_fulfillment_status)}
                      </div>
                      {orderObj.tracking && (
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                          <Truck size={10} /> {orderObj.tracking.carrier || "Shipped"}
                        </span>
                      )}
                    </div>

                    {/* Payment & Fulfillment Status */}
                    <div className="mb-5 grid grid-cols-2 gap-3">
                      <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl">
                        <p className="text-[8px] font-black uppercase tracking-widest text-stone-500 mb-1">Payment</p>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                          orderObj.payment_status === "captured" || orderObj.payment_status === "paid"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : orderObj.payment_status === "awaiting" || orderObj.payment_status === "pending"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-stone-500/10 text-stone-400 border-stone-500/20"
                        }`}>
                          {orderObj.payment_status || "—"}
                        </span>
                      </div>
                      <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl">
                        <p className="text-[8px] font-black uppercase tracking-widest text-stone-500 mb-1">Fulfillment</p>
                        <span className="text-[10px] font-bold text-stone-300">
                          {orderObj.fulfillment_status || orderObj.status || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="mb-5 p-4 bg-stone-950 border border-stone-800 rounded-2xl">
                      <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-3">Vendor Timeline</p>
                      <div className="flex flex-col gap-2">
                        {[
                          { state: "accepted", label: "Accepted", icon: <ThumbsUp size={10} /> },
                          { state: "processing", label: "Processing", icon: <Package size={10} /> },
                          { state: "prepared", label: "Prepared", icon: <Package size={10} /> },
                          { state: "ready_to_ship", label: "Ready to Ship", icon: <PackageCheck size={10} /> },
                          { state: "shipped", label: "Shipped", icon: <Truck size={10} /> },
                          { state: "delivered", label: "Delivered", icon: <CheckCircle size={10} /> },
                        ].map((step, i) => {
                          const states = ["pending", "accepted", "processing", "prepared", "ready_to_ship", "shipped", "delivered"];
                          const currentIdx = states.indexOf(orderObj.vendor_fulfillment_status);
                          const stepIdx = states.indexOf(step.state);
                          const done = stepIdx <= currentIdx && currentIdx >= 0;
                          const ts = orderObj.vendor_timestamps?.[step.state];
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
                    {orderObj.customer_email && (
                      <div className="mb-5 p-4 bg-stone-950 border border-stone-800 rounded-2xl">
                        <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1.5">Customer</p>
                        <p className="text-sm font-bold text-white">{orderObj.customer_email}</p>
                        {orderObj.shipping_address && (
                          <div className="mt-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1">Shipping Address</p>
                            <p className="text-xs text-stone-300 font-medium">
                              {orderObj.shipping_address.address_1}
                              {orderObj.shipping_address.address_2 && `, ${orderObj.shipping_address.address_2}`}
                              <br />
                              {[orderObj.shipping_address.city, orderObj.shipping_address.province, orderObj.shipping_address.postal_code].filter(Boolean).join(", ")}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Items */}
                    <div className="flex flex-col gap-3 mb-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">
                        Your Items ({getNormalizedItems(orderObj).length})
                      </p>
                      <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto">
                        {getNormalizedItems(orderObj).map((item, itemIndex) => (
                          <div
                            key={item.id || `${orderObj.id}:item:${itemIndex}`}
                            className="flex justify-between items-start gap-4 p-3 bg-stone-950 border border-stone-800 rounded-xl"
                          >
                            <div>
                              <p className="text-sm font-bold">{item.title}</p>
                              <p className="text-[10px] text-stone-500 font-semibold mt-0.5">
                                Qty: {item.quantity} × ${(item.unit_price / 100).toFixed(2)}
                              </p>
                              {item.metadata?.personalization_values && (
                                <div className="mt-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-[9px] flex flex-col gap-2 w-full">
                                  <div>
                                    <span className="font-black text-purple-400 uppercase tracking-widest text-[8px]">Customizations:</span>
                                    <div className="flex flex-col gap-0.5 mt-1">
                                      {Object.entries(item.metadata.personalization_values).map(([key, val]) => (
                                        <div key={key} className="flex gap-1.5">
                                          <span className="font-bold text-stone-300 capitalize">{key.replace(/_/g, ' ')}:</span>
                                          <span className="text-stone-400">{String(val)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  
                                  {item.metadata.price_adjustment > 0 && (
                                    <span className="text-[8px] text-purple-400 font-bold">
                                      (+${Number(item.metadata.price_adjustment).toFixed(2)} customization charges)
                                    </span>
                                  )}

                                  <div className="border-t border-purple-500/20 pt-2 flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-stone-400 font-bold">Production Status:</span>
                                      {(() => {
                                        const status = item.metadata.production_status || "pending_review";
                                        const badgeClasses = {
                                          pending_review: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
                                          approved: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
                                          in_production: "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30",
                                          ready: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
                                          rejected: "bg-red-500/20 text-red-400 border border-red-500/30"
                                        };
                                        return (
                                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${badgeClasses[status] || badgeClasses.pending_review}`}>
                                            {status.replace(/_/g, " ")}
                                          </span>
                                        );
                                      })()}
                                    </div>

                                    {item.metadata.vendor_notes && (
                                      <div className="text-[8px] text-stone-400 italic">
                                        <span className="font-bold text-stone-300">Notes:</span> {item.metadata.vendor_notes}
                                      </div>
                                    )}

                                    {/* Action forms/buttons */}
                                    {["pending_review", "approved", "in_production"].includes(item.metadata.production_status || "pending_review") && (
                                      <div className="flex flex-col gap-1.5 mt-1 bg-stone-900/50 p-2 rounded-lg border border-stone-850">
                                        <input
                                          type="text"
                                          value={itemNotes[item.id] || ""}
                                          onChange={(e) => setItemNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                          placeholder="Add notes / rejection reason..."
                                          className="bg-stone-950 border border-stone-800 rounded p-1 text-[9px] text-white outline-none focus:border-purple-500 font-semibold w-full"
                                        />
                                        
                                        <div className="flex gap-1.5 justify-end">
                                          {personalizationLoading === item.id ? (
                                            <span className="flex items-center gap-1 text-[8px] text-stone-500">
                                              <Loader2 className="animate-spin" size={10} /> Working...
                                            </span>
                                          ) : (
                                            <>
                                              {(item.metadata.production_status || "pending_review") === "pending_review" && (
                                                <>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleUpdateItemPersonalization(item.id, "approve")}
                                                    className="px-2 py-1 bg-emerald-500 text-stone-950 font-black uppercase text-[8px] rounded hover:bg-emerald-400"
                                                  >
                                                    Approve
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleUpdateItemPersonalization(item.id, "reject")}
                                                    className="px-2 py-1 bg-red-500 text-white font-black uppercase text-[8px] rounded hover:bg-red-400"
                                                  >
                                                    Reject
                                                  </button>
                                                </>
                                              )}
                                              {(item.metadata.production_status || "pending_review") === "approved" && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateItemPersonalization(item.id, "start_production")}
                                                  className="px-2 py-1 bg-indigo-500 text-white font-black uppercase text-[8px] rounded hover:bg-indigo-400"
                                                >
                                                  Start Production
                                                </button>
                                              )}
                                              {(item.metadata.production_status || "pending_review") === "in_production" && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateItemPersonalization(item.id, "mark_ready")}
                                                  className="px-2 py-1 bg-teal-500 text-stone-950 font-black uppercase text-[8px] rounded hover:bg-teal-400"
                                                >
                                                  Mark Ready
                                                </button>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            <span className="text-sm font-black shrink-0">
                              ${((item.unit_price * item.quantity) / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tracking info */}
                    {orderObj.tracking && (
                      <div className="p-4 bg-stone-950 border border-blue-500/20 rounded-2xl mb-5">
                        <div className="flex items-center gap-2 mb-2">
                          <Truck size={14} className="text-blue-400" />
                          <span className="text-xs font-black text-blue-400">Tracking Information</span>
                        </div>
                        <p className="text-xs text-stone-300">
                          Carrier: {orderObj.tracking.carrier}
                        </p>
                        <p className="text-xs text-stone-300">
                          Code: {orderObj.tracking.tracking_code}
                        </p>
                        {orderObj.tracking.tracking_url && (
                          <a
                            href={orderObj.tracking.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-400 hover:underline flex items-center gap-1 mt-1"
                          >
                            <ExternalLink size={10} /> Track Package
                          </a>
                        )}
                      </div>
                    )}

                    {/* Financial Breakdown */}
                    {(() => {
                      const { gross, commission, net, currencyCode } = getVendorOrderMoney(orderObj);
                      return (
                        <div className="bg-stone-950 p-5 rounded-2xl border border-stone-800 flex flex-col gap-3">
                          <div className="flex justify-between items-center pb-2 border-b border-stone-800/60">
                            <p className="text-xs font-black uppercase tracking-widest text-stone-500">Gross Sale</p>
                            <span className="text-sm font-black text-stone-300">
                              {formatMoney(gross, currencyCode)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pb-2 border-b border-stone-800/60">
                            <p className="text-xs font-black uppercase tracking-widest text-stone-500">Commission</p>
                            <span className="text-sm font-black text-rose-400">
                              -{formatMoney(commission, currencyCode)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Vendor Net</p>
                            <span className="text-xl font-black text-emerald-400">
                              {formatMoney(net, currencyCode)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Detail Modal Action Footer (Phase 13) */}
                  <div className="p-6 bg-stone-950 border-t border-stone-800 flex justify-end gap-2 flex-wrap">
                    {allowedActions.includes("accept") && (
                      <>
                        <button
                          type="button"
                          onClick={() => setActionModal({ id: orderObj.id, action: "accept" })}
                          disabled={activeActionKey === `${orderObj.id}:accept`}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-30 flex items-center gap-1.5"
                        >
                          {activeActionKey === `${orderObj.id}:accept` ? (
                            <>
                              <Loader2 className="animate-spin" size={12} />
                              Accepting...
                            </>
                          ) : (
                            <>
                              <ThumbsUp size={12} /> Accept Order
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionModal({ id: orderObj.id, action: "reject" })}
                          disabled={activeActionKey === `${orderObj.id}:reject`}
                          className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-30 flex items-center gap-1.5"
                        >
                          <ThumbsDown size={12} /> Reject Order
                        </button>
                      </>
                    )}
                    {allowedActions.includes("allocate") && (
                      <button
                        type="button"
                        onClick={() => handleStateAction(orderObj.id, "allocate")}
                        disabled={activeActionKey === `${orderObj.id}:allocate`}
                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-30 flex items-center gap-1.5"
                      >
                        {activeActionKey === `${orderObj.id}:allocate` ? (
                          <>
                            <Loader2 className="animate-spin" size={12} />
                            Allocating Stock...
                          </>
                        ) : (
                          <>
                            <Package size={12} /> Allocate Stock
                          </>
                        )}
                      </button>
                    )}
                    {allowedActions.includes("prepare") && (
                      <button
                        type="button"
                        onClick={() => handleStateAction(orderObj.id, "prepare")}
                        disabled={activeActionKey === `${orderObj.id}:prepare`}
                        className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-stone-950 text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-30 flex items-center gap-1.5"
                      >
                        {activeActionKey === `${orderObj.id}:prepare` ? (
                          <>
                            <Loader2 className="animate-spin" size={12} />
                            Preparing Order...
                          </>
                        ) : (
                          <>
                            <Package size={12} /> Prepare / Pack Order
                          </>
                        )}
                      </button>
                    )}
                    {allowedActions.includes("fulfill") && (
                      <button
                        type="button"
                        onClick={() => handleCreateFulfillment(orderObj)}
                        disabled={activeActionKey === `${orderObj.id}:fulfill`}
                        className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-stone-950 text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-30 flex items-center gap-1.5"
                      >
                        {activeActionKey === `${orderObj.id}:fulfill` ? (
                          <>
                            <Loader2 className="animate-spin" size={12} />
                            Creating Fulfillment...
                          </>
                        ) : (
                          <>
                            <PackageCheck size={12} />
                            Create Fulfillment
                          </>
                        )}
                      </button>
                    )}
                    {allowedActions.includes("ship") && (
                      <button
                        type="button"
                        onClick={() => {
                          setTrackingModal(orderObj);
                          setTrackingCode(orderObj.tracking?.tracking_code || "");
                          setTrackingCarrier(orderObj.tracking?.carrier || "Canada Post");
                          setTrackingUrl(orderObj.tracking?.tracking_url || "");
                        }}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5"
                      >
                        <Truck size={12} /> Mark as Shipped
                      </button>
                    )}
                    {allowedActions.includes("deliver") && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionModal({ id: orderObj.id, action: "deliver" });
                        }}
                        disabled={activeActionKey === `${orderObj.id}:deliver`}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-30 flex items-center gap-1.5"
                      >
                        {activeActionKey === `${orderObj.id}:deliver` ? (
                          <>
                            <Loader2 className="animate-spin" size={12} />
                            Delivering...
                          </>
                        ) : (
                          <>
                            <CheckCircle size={12} /> Mark as Delivered
                          </>
                        )}
                      </button>
                    )}
                    {allowedActions.length === 0 && (
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-500 flex items-center gap-1.5">
                        <CheckCircle size={12} /> Completed
                      </span>
                    )}
                  </div>
                </motion.div>
              </div>
            );
          })()}
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
