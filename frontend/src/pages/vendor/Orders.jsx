import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Eye, X, Loader2 } from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import { vendorApi } from "../../services/vendorApi";
import { setOrders } from "../../redux/vendorSlice";
import toast from "react-hot-toast";

export default function Orders() {
  const dispatch = useDispatch();
  const orders = useSelector((state) => state.vendor.orders);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await vendorApi.getOrders();
      dispatch(setOrders(res.orders || []));
    } catch (err) {
      toast.error("Failed to load orders", { id: "failed-orders" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [dispatch]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-10">
        <div>
          <h1 className="text-3xl font-black mb-2">Order Payouts.</h1>
          <p className="text-sm text-stone-400 font-bold">Monitor incoming sales and track your specific item payouts.</p>
        </div>

        {loading ? (
          <div className="h-[40vh] flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-400" size={32} />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-16 text-center shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-stone-950 flex items-center justify-center mx-auto mb-6 text-stone-500">
              <ShoppingBag size={28} />
            </div>
            <h3 className="text-lg font-black mb-2">No Sales Yet</h3>
            <p className="text-stone-500 text-sm font-semibold max-w-sm mx-auto">
              Once customers purchase products linked to your storefront, their orders and payout summaries will display here.
            </p>
          </div>
        ) : (
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-950/40">
                  <tr>
                    <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-stone-500">Order ID</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-stone-500">Date Placed</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-stone-500">Items Sold</th>
                    <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-stone-500">Status</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest text-stone-500 font-bold text-emerald-400">My Share</th>
                    <th className="px-8 py-4 text-center text-[10px] font-black uppercase tracking-widest text-stone-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/40 font-medium">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-stone-950/20 transition-colors">
                      <td className="px-8 py-5 text-sm font-black text-emerald-400">
                        #{order.display_id || order.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="px-8 py-5 text-sm text-stone-300">
                        {new Date(order.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-8 py-5 text-sm text-stone-350">
                        {order.items.reduce((sum, item) => sum + item.quantity, 0)} Unit(s)
                      </td>
                      <td className="px-8 py-5">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          order.status === "completed" || order.status === "fulfilled" ? "bg-emerald-500/10 text-emerald-400" :
                          order.status === "processing" ? "bg-blue-500/10 text-blue-400" : "bg-amber-500/10 text-amber-400"
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right text-sm font-black text-white">
                        ${order.vendor_subtotal.toFixed(2)}
                      </td>
                      <td className="px-8 py-5 text-center">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="p-2.5 bg-stone-950 border border-stone-850 hover:border-emerald-500/20 text-stone-400 hover:text-emerald-400 rounded-xl transition-all inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider px-3"
                        >
                          <Eye size={12} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Order details Modal */}
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
                <div className="p-8 border-b border-stone-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black">
                      Order Details #{selectedOrder.display_id || selectedOrder.id.slice(-6).toUpperCase()}
                    </h3>
                    <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                      Placed: {new Date(selectedOrder.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => setSelectedOrder(null)} className="text-stone-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-8">
                  <div className="flex flex-col gap-4 mb-6">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-400 uppercase tracking-widest border-b border-stone-850 pb-2">
                      <span>Items Belonging to My Store</span>
                      <span>Total</span>
                    </div>

                    <div className="flex flex-col gap-4 max-h-[220px] overflow-y-auto">
                      {selectedOrder.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-start gap-4">
                          <div>
                            <p className="text-sm font-bold text-white">{item.title}</p>
                            <p className="text-xs text-stone-500 font-semibold mt-0.5">
                              Qty: {item.quantity} × ${(item.unit_price / 100).toFixed(2)}
                            </p>
                          </div>
                          <span className="text-sm font-black text-white shrink-0">
                            ${((item.unit_price * item.quantity) / 100).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-stone-950 p-6 rounded-2xl border border-stone-850 flex justify-between items-center mt-6">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-widest text-stone-500 mb-1">My Total Revenue</h4>
                      <p className="text-[10px] text-stone-600 font-bold">Excludes other vendors' items</p>
                    </div>
                    <span className="text-2xl font-black text-emerald-400">
                      ${selectedOrder.vendor_subtotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
