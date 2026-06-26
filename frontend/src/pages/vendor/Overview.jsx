import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { motion } from "framer-motion";
import {
  DollarSign,
  ShoppingBag,
  Package,
  TrendingUp,
  TrendingDown,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Clock,
  BarChart3,
  Star,
  PackageOpen,
  Minus,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import DashboardLayout from "./DashboardLayout";
import { vendorApi } from "../../services/vendorApi";
import { setStats, setOrders, setProducts } from "../../redux/vendorSlice";
import toast from "react-hot-toast";

const monthLabels = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};

function formatMonth(m) {
  if (!m) return "";
  const [, y, mo] = m.match(/^(\d{4})-(\d{2})$/) || [];
  return `${monthLabels[mo] || mo} ${y}`;
}

const money = (val) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(val || 0);

export default function Overview() {
  const dispatch = useDispatch();
  const { stats, orders, products } = useSelector((state) => state.vendor);
  const [fetching, setFetching] = useState(true);
  const [inventoryAlerts, setInventoryAlerts] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setFetching(true);
      try {
        const [statsRes, ordersRes, productsRes, invRes] = await Promise.all([
          vendorApi.getStats(),
          vendorApi.getOrders(),
          vendorApi.getProducts(),
          vendorApi.getInventory().catch(() => ({ inventory: [], alerts: { lowStock: [], lowStockCount: 0 } })),
        ]);

        dispatch(setStats(statsRes.stats));
        dispatch(setOrders(ordersRes.orders));
        dispatch(setProducts(productsRes.products || []));
        setInventoryAlerts(invRes.alerts?.lowStock || []);
      } catch (err) {
        const msg = err.response?.data?.message || err.message || "Failed to fetch dashboard data";
        toast.error(msg);
      } finally {
        setFetching(false);
      }
    };

    fetchData();
  }, [dispatch]);

  // ── Stat Cards ──────────────────────────────────────────────────────────
  const cards = useMemo(
    () => [
      {
        label: "Total Sales",
        value: money(stats?.revenue ?? 0),
        change: stats?.revenueGrowth != null ? `${stats.revenueGrowth >= 0 ? "+" : ""}${stats.revenueGrowth}%` : "—",
        positive: (stats?.revenueGrowth ?? 0) >= 0,
        icon: <DollarSign size={20} />,
        color: "from-emerald-500 to-teal-400",
      },
      {
        label: "Orders Count",
        value: stats?.orders ?? 0,
        change: stats?.orderGrowth != null
          ? `${stats.orderGrowth >= 0 ? "+" : ""}${stats.orderGrowth}%`
          : "—",
        positive: (stats?.orderGrowth ?? 0) >= 0,
        icon: <ShoppingBag size={20} />,
        color: "from-blue-500 to-indigo-400",
      },
      {
        label: "Active Products",
        value: stats?.products ?? 0,
        change: "Total",
        positive: true,
        icon: <Package size={20} />,
        color: "from-amber-500 to-orange-400",
      },
      {
        label: "Avg Order Value",
        value: money(stats?.avgOrderValue ?? 0),
        change: `${stats?.orders ?? 0} order${stats?.orders !== 1 ? "s" : ""}`,
        positive: true,
        icon: <TrendingUp size={20} />,
        color: "from-purple-500 to-pink-400",
      },
      {
        label: "Pending Orders",
        value: stats?.pendingOrders ?? 0,
        change: stats?.pendingOrders ? "Requires attention" : "All clear",
        positive: !stats?.pendingOrders,
        icon: <Clock size={20} />,
        color: "from-amber-500 to-red-400",
      },
      {
        label: "Low Stock Items",
        value: stats?.lowStockAlerts ?? 0,
        change: inventoryAlerts.length
          ? `${inventoryAlerts.length} item${inventoryAlerts.length !== 1 ? "s" : ""} low`
          : "Healthy",
        positive: !(stats?.lowStockAlerts ?? 0),
        icon: <AlertTriangle size={20} />,
        color: "from-red-500 to-rose-400",
      },
    ],
    [stats, inventoryAlerts.length]
  );

  // ── Recent Orders ───────────────────────────────────────────────────────
  const recentOrders = orders.slice(0, 5);

  // ── Status badge helper ─────────────────────────────────────────────────
  const statusBadge = (status) => {
    const map = {
      pending: "bg-amber-500/10 text-amber-400",
      processing: "bg-blue-500/10 text-blue-400",
      fulfilled: "bg-emerald-500/10 text-emerald-400",
      completed: "bg-emerald-500/10 text-emerald-400",
      canceled: "bg-red-500/10 text-red-400",
      requires_action: "bg-rose-500/10 text-rose-400",
    };
    return (
      <span
        className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
          map[status] || "bg-stone-500/10 text-stone-400"
        }`}
      >
        {status?.replace("_", " ") || "unknown"}
      </span>
    );
  };

  return (
    <DashboardLayout>
      {fetching ? (
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-emerald-400" size={32} />
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div>
            <h1 className="text-3xl font-black mb-2">Overview.</h1>
            <p className="text-sm text-stone-400 font-bold">
              Here's what's happening with your storefront today.
            </p>
          </div>

          {/* ── Stat Cards Grid ──────────────────────────────────────────── */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {cards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="bg-stone-900 border border-stone-800 p-5 rounded-[1.5rem] shadow-xl hover:border-stone-700/80 transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${card.color} text-stone-950 flex items-center justify-center shadow-lg`}
                  >
                    {card.icon}
                  </div>
                  {card.change !== "Stable" && card.change !== "Total" && card.change !== "All clear" && card.change !== "Healthy" && (
                    <span
                      className={`text-[9px] font-black px-2 py-1 rounded-full flex items-center gap-1 ${
                        card.positive
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {card.positive ? (
                        <ArrowUpRight size={10} />
                      ) : (
                        <ArrowDownRight size={10} />
                      )}
                      {card.change}
                    </span>
                  )}
                  {(card.change === "All clear" || card.change === "Healthy") && (
                    <span className="text-[9px] font-black px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
                      {card.change}
                    </span>
                  )}
                  {card.change === "Total" && (
                    <span className="text-[9px] font-black px-2 py-1 rounded-full bg-stone-800 text-stone-400">
                      {card.change}
                    </span>
                  )}
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1">
                  {card.label}
                </p>
                <p className="text-2xl font-black group-hover:text-emerald-400 transition-colors">
                  {card.value}
                </p>
              </motion.div>
            ))}
          </div>

          {/* ── Charts Row ───────────────────────────────────────────────── */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Revenue Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-2 bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 shadow-xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-stone-950 flex items-center justify-center">
                    <BarChart3 size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black">Revenue Trend</h3>
                    <p className="text-[10px] text-stone-500 font-bold">
                      Monthly revenue from your products
                    </p>
                  </div>
                </div>
                {stats?.revenueGrowth != null && (
                  <span
                    className={`text-xs font-black flex items-center gap-1 ${
                      stats.revenueGrowth >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {stats.revenueGrowth >= 0 ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownRight size={14} />
                    )}
                    {Math.abs(stats.revenueGrowth).toFixed(1)}% vs last month
                  </span>
                )}
              </div>

              {stats?.revenueByMonth?.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={stats.revenueByMonth}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1917" strokeOpacity={0.5} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={formatMonth}
                        tick={{ fill: "#78716c", fontSize: 11, fontWeight: 600 }}
                        axisLine={{ stroke: "#292524" }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${v}`}
                        tick={{ fill: "#78716c", fontSize: 11, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1c1917",
                          border: "1px solid #292524",
                          borderRadius: "12px",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                        labelFormatter={formatMonth}
                        formatter={(value) => [money(value), "Revenue"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#revenueGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-stone-500 text-sm font-bold">
                  No revenue data yet. Start selling to see trends here.
                </div>
              )}
            </motion.div>

            {/* Best Sellers */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 shadow-xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-stone-950 flex items-center justify-center">
                  <Star size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black">Best Sellers</h3>
                  <p className="text-[10px] text-stone-500 font-bold">
                    Top products by revenue
                  </p>
                </div>
              </div>

              {stats?.bestSellers?.length > 0 ? (
                <div className="flex flex-col gap-3 max-h-[280px] overflow-y-auto pr-1">
                  {stats.bestSellers.map((product, i) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 p-3 bg-stone-950 border border-stone-800 hover:border-emerald-500/20 rounded-2xl transition-all"
                    >
                      {/* Rank */}
                      <span className="w-6 h-6 rounded-lg bg-stone-800 flex items-center justify-center text-[10px] font-black text-stone-400 shrink-0">
                        {i + 1}
                      </span>
                      {/* Thumbnail */}
                      <div className="w-10 h-10 rounded-xl bg-stone-800 shrink-0 overflow-hidden">
                        {product.thumbnail ? (
                          <img
                            src={product.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-600">
                            <PackageOpen size={16} />
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {product.title}
                        </p>
                        <p className="text-[10px] text-stone-500 font-medium">
                          {product.quantity} unit{product.quantity !== 1 ? "s" : ""} sold
                        </p>
                      </div>
                      {/* Revenue */}
                      <span className="text-xs font-black text-emerald-400 shrink-0">
                        {money(product.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-stone-500 text-sm font-bold">
                  No sales data yet.
                </div>
              )}
            </motion.div>
          </div>

          {/* ── Second Row: Orders + Alerts ───────────────────────────────── */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Orders List */}
            <div className="lg:col-span-2 bg-stone-900 border border-stone-800 rounded-[2.5rem] overflow-hidden shadow-xl">
              <div className="p-6 border-b border-stone-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-400 text-stone-950 flex items-center justify-center">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black">Recent Orders</h3>
                    <p className="text-[10px] text-stone-500 font-bold">
                      Latest sales containing your products
                    </p>
                  </div>
                </div>
                <Link
                  to="/vendor/orders"
                  className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:underline"
                >
                  View All
                </Link>
              </div>

              {recentOrders.length === 0 ? (
                <div className="p-10 text-center text-stone-500 font-bold text-sm">
                  No orders containing your products have been placed yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-stone-950/40">
                      <tr>
                        <th className="px-6 py-3 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                          Order
                        </th>
                        <th className="px-6 py-3 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-[9px] font-black uppercase tracking-widest text-stone-500">
                          Share
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800/40">
                      {recentOrders.map((order, index) => (
                        <motion.tr
                          key={order.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: index * 0.03 }}
                          className="hover:bg-stone-950/20 transition-colors"
                        >
                          <td className="px-6 py-4 text-sm font-black text-emerald-400">
                            #{order.display_id || order.id.slice(-6).toUpperCase()}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-stone-300">
                              {new Date(order.created_at).toLocaleDateString()}
                            </p>
                          </td>
                          <td className="px-6 py-4">{statusBadge(order.status)}</td>
                          <td className="px-6 py-4 text-right font-black text-white">
                            ${order.vendor_subtotal?.toFixed(2)}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right Panel: Status Breakdown + Alerts */}
            <div className="flex flex-col gap-6">
              {/* Status Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 shadow-xl"
              >
                <h3 className="text-base font-black mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-emerald-400" />
                  Order Status
                </h3>
                <div className="space-y-2.5">
                  {[
                    { key: "pending", label: "Pending", color: "bg-amber-500" },
                    { key: "processing", label: "Processing", color: "bg-blue-500" },
                    { key: "fulfilled", label: "Fulfilled", color: "bg-emerald-500" },
                    { key: "completed", label: "Completed", color: "bg-teal-500" },
                    { key: "canceled", label: "Canceled", color: "bg-red-500" },
                  ].map((item) => {
                    const count = stats?.statusBreakdown?.[item.key] || 0;
                    const total = stats?.orders || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={item.key} className="flex items-center gap-3">
                        <span className="w-20 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                          {item.label}
                        </span>
                        <div className="flex-1 h-2.5 bg-stone-950 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.color} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs font-black text-stone-300">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              {/* Low Stock Alerts */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 shadow-xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-400" />
                    <h3 className="text-base font-black">Low Stock</h3>
                  </div>
                  {inventoryAlerts.length > 0 && (
                    <Link
                      to="/vendor/inventory"
                      className="text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:underline"
                    >
                      View All
                    </Link>
                  )}
                </div>
                {inventoryAlerts.length > 0 ? (
                  <div className="flex flex-col gap-2 max-h-44 overflow-y-auto">
                    {inventoryAlerts.slice(0, 5).map((item) => (
                      <div
                        key={item.level_id}
                        className="flex items-center justify-between p-3 bg-stone-950 border border-stone-800 rounded-xl"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {item.product_title}
                          </p>
                          <p className="text-[9px] text-stone-500 font-medium">
                            {item.variant_title} · {item.sku || "No SKU"}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-black shrink-0 ml-3 ${
                            item.available_quantity <= 0
                              ? "text-red-400"
                              : "text-amber-400"
                          }`}
                        >
                          {item.available_quantity} left
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-stone-500 text-xs font-bold">
                    <PackageOpen size={24} className="mx-auto mb-2 opacity-50" />
                    All stock levels are healthy.
                  </div>
                )}
              </motion.div>

              {/* Quick Actions */}
              <Link
                to="/vendor/inventory"
                className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-5 shadow-xl hover:border-emerald-500/20 transition-all block"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-stone-950 flex items-center justify-center">
                    <Minus size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-black">Inventory Management</p>
                    <p className="text-[10px] text-stone-500 font-medium">
                      Update stock levels and monitor alerts
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
