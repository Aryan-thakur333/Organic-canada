import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ShoppingBag,
  Package,
  Heart,
  Repeat,
  User,
  MapPin,
  CreditCard,
  ChevronRight,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Building2,
  Loader2,
  Store,
} from "lucide-react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/Footer";
import MobileNav from "../components/MobileNav";
import Button from "../components/common/Button";
import { fetchCustomerOrders } from "../services/apiClient";
import { subscriptionService } from "../services/medusa/subscriptionService";
import useToast from "../hooks/useToast";
import useB2BCompany from "../hooks/useB2BCompany";
import { isB2BUser } from "../utils/accountType";

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format((cents || 0) / 100);

const statusBadge = (status) => {
  const map = {
    completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    fulfilled: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    processing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    canceled: "bg-red-500/10 text-red-600 dark:text-red-400",
    requires_action: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
        map[status] || "bg-stone-100 text-stone-500 dark:bg-slate-700 dark:text-slate-400"
      }`}
    >
      {status?.replace(/_/g, " ")}
    </span>
  );
};

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useSelector((state) => state.auth);
  const userProfile = useSelector((state) => state.user?.profile);
  const { items: wishlistItems } = useSelector((state) => state.wishlist);
  const { company: b2bCompany } = useB2BCompany();
  const isApprovedB2B = isB2BUser(userProfile || user, b2bCompany);

  const [orders, setOrders] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const [ordersRes, subsRes] = await Promise.all([
          fetchCustomerOrders().catch(() => ({ orders: [] })),
          subscriptionService.list().catch(() => ({ subscriptions: [] })),
        ]);
        setOrders(ordersRes?.orders || []);
        setSubscriptions(subsRes?.subscriptions || []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  // ── Computed stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeOrders = orders.filter(
      (o) => o.status !== "canceled" && o.status !== "completed"
    );
    const activeSubs = subscriptions.filter(
      (s) => s.status === "active" || s.status === "trialing"
    );
    const totalSpent = orders
      .filter((o) => o.status !== "canceled")
      .reduce((sum, o) => sum + (o.total || 0), 0);
    return {
      totalOrders: orders.length,
      activeOrders: activeOrders.length,
      activeSubscriptions: activeSubs.length,
      wishlistCount: wishlistItems.length,
      totalSpent,
    };
  }, [orders, subscriptions, wishlistItems]);

  const latestOrder = orders[0] || null;
  const latestSub = subscriptions[0] || null;

  // ── Quick actions ──────────────────────────────────────────────────────
  const quickActions = [
    {
      label: "Browse Products",
      icon: <Store size={18} />,
      path: "/listing",
      color: "from-emerald-500 to-teal-400",
    },
    {
      label: "View Orders",
      icon: <Package size={18} />,
      path: "/orders",
      color: "from-blue-500 to-indigo-400",
    },
    {
      label: "My Wishlist",
      icon: <Heart size={18} />,
      path: "/wishlist",
      color: "from-rose-500 to-pink-400",
    },
    {
      label: "Subscriptions",
      icon: <Repeat size={18} />,
      path: "/dashboard/subscriptions",
      color: "from-amber-500 to-orange-400",
    },
  ];

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <main className="pt-28 pb-20 container-custom">
        {/* ── Welcome Header ────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-text-primary mb-2">
              Welcome back{user?.first_name ? `, ${user.first_name}` : ""}. 👋
            </h1>
            <p className="text-text-secondary max-w-xl">
              Your organic farm dashboard — track orders, manage subscriptions, and discover fresh produce.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2 text-xs font-black uppercase tracking-wider"
            onClick={() => navigate("/profile")}
          >
            <User size={14} /> My Profile
          </Button>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="animate-spin text-accent-primary" size={32} />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* ── Stats Grid ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: "Total Orders",
                  value: stats.totalOrders,
                  icon: <ShoppingBag size={18} />,
                  color: "from-blue-500 to-indigo-400",
                },
                {
                  label: "Active Orders",
                  value: stats.activeOrders,
                  icon: <Clock size={18} />,
                  color: "from-amber-500 to-orange-400",
                },
                {
                  label: "Subscriptions",
                  value: stats.activeSubscriptions,
                  icon: <Repeat size={18} />,
                  color: "from-emerald-500 to-teal-400",
                },
                {
                  label: "Wishlist",
                  value: stats.wishlistCount,
                  icon: <Heart size={18} />,
                  color: "from-rose-500 to-pink-400",
                },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all"
                >
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${stat.color} text-white flex items-center justify-center mb-3`}
                  >
                    {stat.icon}
                  </div>
                  <p className="text-2xl font-black text-text-primary">{stat.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mt-0.5">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* ── Quick Actions ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {quickActions.map((action, i) => (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.03 }}
                  onClick={() => navigate(action.path)}
                  className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-2xl hover:shadow-md transition-all group text-left"
                >
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${action.color} text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}
                  >
                    {action.icon}
                  </div>
                  <span className="text-sm font-bold text-text-primary group-hover:text-accent-primary transition-colors">
                    {action.label}
                  </span>
                  <ChevronRight size={16} className="ml-auto text-stone-300 group-hover:text-accent-primary transition-colors" />
                </motion.button>
              ))}
            </div>

            {/* ── Main Content Grid ──────────────────────────────────────── */}
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Left: Recent Orders */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                {/* Latest Order */}
                {latestOrder && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-[2rem] p-6 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Package size={18} className="text-accent-primary" />
                        <h3 className="text-lg font-black text-text-primary">Latest Order</h3>
                      </div>
                      <button
                        onClick={() => navigate("/orders")}
                        className="text-[10px] font-black uppercase tracking-widest text-accent-primary hover:underline"
                      >
                        View All
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-text-primary">
                          Order #{latestOrder.display_id || latestOrder.id.slice(-8).toUpperCase()}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {statusBadge(latestOrder.status)}
                          <span className="text-[10px] text-text-secondary font-medium">
                            {new Date(latestOrder.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-2">
                          {(latestOrder.items || []).length} item(s)
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-accent-primary">
                          {money(latestOrder.total)}
                        </p>
                        <button
                          onClick={() => navigate(`/track/${latestOrder.id}`)}
                          className="text-[10px] font-black uppercase tracking-widest text-accent-primary hover:underline mt-1"
                        >
                          Track Order
                        </button>
                      </div>
                    </div>

                    {/* Item Preview */}
                    {latestOrder.items?.length > 0 && (
                      <div className="flex gap-2 mt-4 pt-4 border-t border-stone-100 dark:border-slate-700">
                        {latestOrder.items.slice(0, 5).map((item) => (
                          <div
                            key={item.id}
                            className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-slate-700 overflow-hidden border border-stone-200 dark:border-slate-600"
                          >
                            {item.thumbnail ? (
                              <img
                                src={item.thumbnail}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-stone-400 text-[10px] font-bold">
                                {item.title?.[0] || "?"}
                              </div>
                            )}
                          </div>
                        ))}
                        {latestOrder.items.length > 5 && (
                          <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-slate-700 border border-stone-200 dark:border-slate-600 flex items-center justify-center text-[10px] font-black text-text-secondary">
                            +{latestOrder.items.length - 5}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Recent Orders List */}
                {orders.length > 1 && (
                  <div className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-[2rem] p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-black text-text-primary">Recent Orders</h3>
                      <button
                        onClick={() => navigate("/orders")}
                        className="text-[10px] font-black uppercase tracking-widest text-accent-primary hover:underline"
                      >
                        View All
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {orders.slice(1, 4).map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between p-3 bg-stone-50 dark:bg-slate-900/40 rounded-2xl hover:bg-stone-100 dark:hover:bg-slate-900/60 transition-colors cursor-pointer"
                          onClick={() => navigate(`/track/${order.id}`)}
                        >
                          <div className="flex items-center gap-3">
                            <CheckCircle2
                              size={16}
                              className={
                                order.status === "completed" || order.status === "fulfilled"
                                  ? "text-emerald-500"
                                  : order.status === "canceled"
                                  ? "text-red-400"
                                  : "text-amber-400"
                              }
                            />
                            <div>
                              <p className="text-xs font-bold text-text-primary">
                                #{order.display_id || order.id.slice(-8).toUpperCase()}
                              </p>
                              <p className="text-[9px] text-text-secondary font-medium">
                                {new Date(order.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {statusBadge(order.status)}
                            <ArrowUpRight size={14} className="text-stone-300" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Profile + Subscriptions Sidebar */}
              <div className="flex flex-col gap-6">
                {/* Profile Card */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-[2rem] p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center text-lg font-black">
                      {user?.email?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-text-primary truncate">
                        {user?.first_name
                          ? `${user.first_name} ${user.last_name || ""}`
                          : user?.email || "Customer"}
                      </p>
                      <p className="text-[10px] text-text-secondary font-medium truncate">
                        {user?.email}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate("/profile")}
                      className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <ChevronRight size={16} className="text-stone-400" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => navigate("/profile")}
                      className="flex items-center gap-2 p-3 bg-stone-50 dark:bg-slate-900/40 rounded-xl text-xs font-bold text-text-secondary hover:text-accent-primary transition-colors"
                    >
                      <User size={14} /> Profile
                    </button>
                    <button
                      onClick={() => navigate("/orders")}
                      className="flex items-center gap-2 p-3 bg-stone-50 dark:bg-slate-900/40 rounded-xl text-xs font-bold text-text-secondary hover:text-accent-primary transition-colors"
                    >
                      <Package size={14} /> Orders
                    </button>
                    <button
                      onClick={() => navigate("/addresses")}
                      className="flex items-center gap-2 p-3 bg-stone-50 dark:bg-slate-900/40 rounded-xl text-xs font-bold text-text-secondary hover:text-accent-primary transition-colors"
                    >
                      <MapPin size={14} /> Addresses
                    </button>
                    <button
                      onClick={() => navigate("/wishlist")}
                      className="flex items-center gap-2 p-3 bg-stone-50 dark:bg-slate-900/40 rounded-xl text-xs font-bold text-text-secondary hover:text-accent-primary transition-colors"
                    >
                      <Heart size={14} /> Wishlist
                    </button>
                  </div>
                </motion.div>

                {/* Subscription Card */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-[2rem] p-6 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/10">
                      <Sparkles size={18} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-black uppercase tracking-widest text-text-primary">
                        {latestSub ? "Active Plan" : "Subscription"}
                      </h4>
                    </div>
                    {latestSub && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          latestSub.status === "active"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : latestSub.status === "past_due"
                            ? "bg-red-500/10 text-red-600"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {latestSub.status}
                      </span>
                    )}
                  </div>
                  {latestSub ? (
                    <>
                      <p className="text-xl font-black text-text-primary mb-1">
                        {latestSub.product_title || "Premium Plan"}
                      </p>
                      <p className="text-xs text-text-secondary font-medium mb-4">
                        {money(latestSub.amount)} / {latestSub.plan}
                        {latestSub.next_billing_date && (
                          <> — renews {new Date(latestSub.next_billing_date).toLocaleDateString()}</>
                        )}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full gap-2 text-xs font-black uppercase tracking-wider"
                        onClick={() => navigate("/dashboard/subscriptions")}
                      >
                        Manage Plan
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-black text-text-primary mb-1">Free Plan</p>
                      <p className="text-xs text-text-secondary font-medium mb-4">
                        Subscribe to unlock recurring deliveries & exclusive discounts.
                      </p>
                      <Button
                        size="sm"
                        className="w-full gap-2 text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-400"
                        onClick={() => navigate("/dashboard/subscriptions")}
                      >
                        <Sparkles size={14} /> Upgrade Now
                      </Button>
                    </>
                  )}
                </motion.div>

                {isApprovedB2B && (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-[2rem] p-6 shadow-sm"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Building2 size={18} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-widest text-text-primary">
                          B2B Wholesale
                        </h4>
                      </div>
                    </div>
                    <p className="text-xs text-text-secondary font-medium mb-4 leading-relaxed">
                      Access bulk pricing, submit quote requests, and manage your company account.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 gap-1 text-[10px] font-black uppercase tracking-wider"
                        onClick={() => navigate("/b2b/request-quote")}
                      >
                        New Quote
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 gap-1 text-[10px] font-black uppercase tracking-wider"
                        onClick={() => navigate("/account/b2b-quotes")}
                      >
                        History
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Total Spent */}
                {stats.totalSpent > 0 && (
                  <div className="bg-gradient-to-br from-accent-primary/5 to-accent-primary/10 border border-accent-primary/10 rounded-[2rem] p-6 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-accent-primary mb-1">
                      Lifetime Spent
                    </p>
                    <p className="text-3xl font-black text-text-primary">
                      {money(stats.totalSpent)}
                    </p>
                    <p className="text-[10px] text-text-secondary font-medium mt-1">
                      Across {stats.totalOrders} order{stats.totalOrders !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
