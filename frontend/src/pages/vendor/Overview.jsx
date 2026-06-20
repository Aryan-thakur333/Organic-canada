import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { motion } from "framer-motion";
import { 
  DollarSign, 
  ShoppingBag, 
  Package, 
  TrendingUp, 
  ArrowUpRight,
  TrendingDown,
  Loader2
} from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import { vendorApi } from "../../services/vendorApi";
import { setStats, setOrders, vendorStart, vendorSuccess, vendorFailure } from "../../redux/vendorSlice";
import toast from "react-hot-toast";

export default function Overview() {
  const dispatch = useDispatch();
  const { stats, orders, loading } = useSelector((state) => state.vendor);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setFetching(true);
      try {
        const statsRes = await vendorApi.getStats();
        const ordersRes = await vendorApi.getOrders();
        
        dispatch(setStats(statsRes.stats));
        dispatch(setOrders(ordersRes.orders));
      } catch (err) {
        const msg = err.response?.data?.message || err.message || "Failed to fetch dashboard data";
        toast.error(msg);
      } finally {
        setFetching(false);
      }
    };

    fetchData();
  }, [dispatch]);

  const cards = [
    { 
      label: "Total Sales", 
      value: `$${(stats?.revenue ?? 0).toLocaleString()}`, 
      change: "+12.5%", 
      positive: true,
      icon: <DollarSign size={20} />, 
      color: "from-emerald-500 to-teal-400" 
    },
    { 
      label: "Orders Count", 
      value: stats?.orders ?? 0, 
      change: "+8.2%", 
      positive: true,
      icon: <ShoppingBag size={20} />, 
      color: "from-blue-500 to-indigo-400" 
    },
    { 
      label: "Active Products", 
      value: stats?.products ?? 0, 
      change: "Stable", 
      positive: true,
      icon: <Package size={20} />, 
      color: "from-amber-500 to-orange-400" 
    },
    { 
      label: "Avg Order Value", 
      value: `$${(stats?.avgOrderValue ?? 0).toLocaleString()}`, 
      change: "-1.4%", 
      positive: false,
      icon: <TrendingUp size={20} />, 
      color: "from-purple-500 to-pink-400" 
    },
  ];

  const recentOrders = orders.slice(0, 5);

  return (
    <DashboardLayout>
      {fetching ? (
        <div className="h-[60vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-emerald-400" size={32} />
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <div>
            <h1 className="text-3xl font-black mb-2">Overview.</h1>
            <p className="text-sm text-stone-400 font-bold">Here is what is happening with your storefront today.</p>
          </div>

          {/* Stats Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {cards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="bg-stone-900 border border-stone-800 p-6 rounded-[2rem] shadow-xl hover:border-stone-700/80 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${card.color} text-stone-950 flex items-center justify-center shadow-lg shadow-emerald-500/5`}>
                    {card.icon}
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 ${
                    card.change === "Stable" ? "bg-stone-800 text-stone-400" :
                    card.positive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    {card.change !== "Stable" && (
                      card.positive ? <ArrowUpRight size={10} /> : <TrendingDown size={10} />
                    )}
                    {card.change}
                  </span>
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">{card.label}</p>
                <p className="text-3xl font-black group-hover:text-emerald-400 transition-colors">{card.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Main Analytics / Recent Activity grid */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Orders summary */}
            <div className="lg:col-span-2 bg-stone-900 border border-stone-800 rounded-[2.5rem] overflow-hidden shadow-xl">
              <div className="p-8 border-b border-stone-800 flex items-center justify-between">
                <h3 className="text-lg font-black">Recent Store Orders</h3>
                <Link to="/vendor/orders" className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:underline">
                  View All Orders
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
                        <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-stone-500">Order ID</th>
                        <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-stone-500">Items Count</th>
                        <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-stone-500">Status</th>
                        <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest text-stone-500">My Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800/40">
                      {recentOrders.map((order, index) => (
                        <motion.tr
                          key={order.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className="hover:bg-stone-950/20 transition-colors"
                        >
                          <td className="px-8 py-5 text-sm font-black text-emerald-400">#{order.display_id || order.id.slice(-6).toUpperCase()}</td>
                          <td className="px-8 py-5">
                            <p className="text-sm font-bold">{order.items.length} Product{order.items.length > 1 ? "s" : ""}</p>
                            <p className="text-[10px] text-stone-500 font-medium">
                              {new Date(order.created_at).toLocaleDateString()}
                            </p>
                          </td>
                          <td className="px-8 py-5">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                              order.status === "completed" || order.status === "fulfilled" ? "bg-emerald-500/10 text-emerald-400" :
                              order.status === "processing" ? "bg-blue-500/10 text-blue-400" : "bg-amber-500/10 text-amber-400"
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-right font-black text-white">
                            ${order.vendor_subtotal.toFixed(2)}
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Quick Actions / Tips */}
            <div className="flex flex-col gap-6">
              <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-8 shadow-xl">
                <h3 className="text-lg font-black mb-6">Quick Tools</h3>
                <div className="flex flex-col gap-3">
                  <Link
                    to="/vendor/products"
                    className="flex items-center gap-3 px-5 py-4 bg-stone-950 border border-stone-800 hover:border-emerald-500/30 rounded-2xl text-sm font-black transition-all text-stone-300 hover:text-emerald-400"
                  >
                    <Package size={18} /> List New Product
                  </Link>
                  <Link
                    to="/vendor/orders"
                    className="flex items-center gap-3 px-5 py-4 bg-stone-950 border border-stone-800 hover:border-emerald-500/30 rounded-2xl text-sm font-black transition-all text-stone-300 hover:text-emerald-400"
                  >
                    <ShoppingBag size={18} /> Manage Sales Receipts
                  </Link>
                </div>
              </div>

              <div className="bg-gradient-to-br from-stone-900 to-stone-900/60 border border-stone-800 rounded-[2.5rem] p-8">
                <h3 className="text-base font-black mb-4">Partner Insights</h3>
                <p className="text-xs text-stone-400 font-medium leading-relaxed">
                  Keep your product information accurate, set competitive prices, and upload high-resolution thumbnails to boost your customer conversion rate.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
