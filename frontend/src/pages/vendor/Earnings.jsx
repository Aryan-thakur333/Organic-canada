import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Loader2,
  WalletCards,
  Banknote,
  PiggyBank,
  ArrowUpRight,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  Percent,
  Calendar,
  CreditCard,
  FileText,
} from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import { vendorApi } from "../../services/vendorApi";
import { safeNumber, safeDivide, safeMax } from "../../utils/safeNumber";
import toast from "react-hot-toast";

const money = (amount, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(safeNumber(amount));

export default function Earnings() {
  const [data, setData] = useState({ payouts: [], earnings: {} });
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vendorApi.getPayouts();
      setData({
        payouts: res.payouts || [],
        earnings: res.earnings || {},
      });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Unable to load earnings";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRequestPayout = async (e) => {
    e.preventDefault();
    const cents = Math.round(safeNumber(amount) * 100);
    if (cents < 1000) {
      return toast.error("Minimum payout is $10.00");
    }
    setSubmitting(true);
    try {
      await vendorApi.requestPayout(cents);
      setAmount("");
      toast.success("Payout request submitted for admin approval");
      await load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Payout request failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const earnings = data.earnings;
  const currency = earnings.currency_code || "CAD";

  const safeEarnings = {
    total_revenue: safeNumber(earnings.total_revenue),
    pending_earning: safeNumber(earnings.pending_earning),
    completed_earning: safeNumber(earnings.completed_earning),
    pending_payout: safeNumber(earnings.pending_payout),
    completed_payout: safeNumber(earnings.completed_payout),
    net_earnings: safeNumber(earnings.net_earnings),
    commission_deduction: safeNumber(earnings.commission_deduction),
    commission_rate: safeNumber(earnings.commission_rate, 0.1),
    available_payout: safeNumber(earnings.available_payout),
    order_count: safeNumber(earnings.order_count),
  };

  const statCards = [
    {
      label: "Gross Sales",
      value: money(safeEarnings.total_revenue, currency),
      subtitle: "Total revenue from delivered orders",
      icon: <DollarSign size={20} />,
      color: "from-emerald-500 to-teal-400",
      positive: true,
    },
    {
      label: "Commission Deducted",
      value: money(safeEarnings.commission_deduction, currency),
      subtitle: `${(safeEarnings.commission_rate) * 100}% marketplace fee`,
      icon: <Percent size={20} />,
      color: "from-amber-500 to-orange-400",
      positive: false,
    },
    {
      label: "Net Earnings",
      value: money(safeEarnings.net_earnings, currency),
      subtitle: "Gross minus commission",
      icon: <PiggyBank size={20} />,
      color: "from-blue-500 to-indigo-400",
      positive: true,
    },
    {
      label: "Pending Payout",
      value: money(safeEarnings.pending_payout, currency),
      subtitle: "Awaiting admin approval",
      icon: <AlertCircle size={20} />,
      color: "from-amber-500 to-red-400",
      positive: false,
    },
    {
      label: "Completed Payout",
      value: money(safeEarnings.completed_payout, currency),
      subtitle: "Already paid out",
      icon: <CreditCard size={20} />,
      color: "from-emerald-500 to-teal-400",
      positive: true,
    },
    {
      label: "Available for Payout",
      value: money(safeEarnings.available_payout, currency),
      subtitle: "Net minus all committed payouts",
      icon: <WalletCards size={20} />,
      color: "from-purple-500 to-pink-400",
      positive: true,
    },
  ];

  const payoutStatusBadge = (status) => {
    const map = {
      pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      approved: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      rejected: "bg-red-500/10 text-red-400 border-red-500/20",
      paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    };
    return (
      <span
        className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
          map[status] || "bg-stone-500/10 text-stone-400 border-stone-500/20"
        }`}
      >
        {status}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black mb-2">Earnings & Payouts.</h1>
            <p className="text-sm text-stone-400 font-bold">
              Track your revenue, marketplace commission, and payout requests.
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

        {loading ? (
          <div className="h-[40vh] flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-400" size={32} />
          </div>
        ) : (
          <>
            {/* ── Summary Cards Grid ────────────────────────────────────── */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {statCards.map((card, i) => (
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
                    {card.positive === false && safeEarnings.commission_deduction > 0 && (
                      <span className="text-[9px] font-black px-2 py-1 rounded-full bg-red-500/10 text-red-400 flex items-center gap-1">
                        <TrendingDown size={10} /> Fee
                      </span>
                    )}
                    {card.positive && safeEarnings.net_earnings > 0 && card.label === "Net Earnings" && (
                      <span className="text-[9px] font-black px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                        <ArrowUpRight size={10} /> Net
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1">
                    {card.label}
                  </p>
                  <p className="text-2xl font-black group-hover:text-emerald-400 transition-colors">
                    {card.value}
                  </p>
                  {card.subtitle && (
                    <p className="text-[9px] text-stone-600 font-medium mt-1.5">{card.subtitle}</p>
                  )}
                </motion.div>
              ))}
            </div>

            {/* ── Request Payout Form ────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 shadow-xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-500 to-pink-400 text-stone-950 flex items-center justify-center">
                  <Banknote size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black">Request a Payout</h3>
                  <p className="text-[10px] text-stone-500 font-bold">
                    Available: {money(safeEarnings.available_payout, currency)}
                    {safeEarnings.pending_payout > 0 && (
                      <span className="text-amber-400 ml-2">
                        · {money(safeEarnings.pending_payout, currency)} pending approval
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <form onSubmit={handleRequestPayout} className="flex flex-col sm:flex-row gap-3 max-w-lg">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    min="10"
                    step="0.01"
                    max={safeMax(safeEarnings.available_payout)}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl py-3.5 pl-8 pr-4 text-white placeholder-stone-600 outline-none transition-all text-sm font-bold"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !amount || safeNumber(amount) < 10}
                  className="px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-400 text-stone-950 font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shrink-0"
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <>
                      <WalletCards size={16} /> Request Payout
                    </>
                  )}
                </button>
              </form>

              {safeEarnings.available_payout <= 0 && (
                <p className="text-xs text-amber-400 font-semibold mt-3 flex items-center gap-1.5">
                  <AlertCircle size={12} />
                  No earnings available for payout yet. Earnings become available after orders are delivered.
                </p>
              )}
            </motion.div>

            {/* ── Payout History ──────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-stone-900 border border-stone-800 rounded-[2.5rem] overflow-hidden shadow-xl"
            >
              <div className="p-6 border-b border-stone-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-400 text-stone-950 flex items-center justify-center">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black">Payout History</h3>
                    <p className="text-[10px] text-stone-500 font-bold">
                      {data.payouts.length} request{data.payouts.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>

              {data.payouts.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-stone-950 flex items-center justify-center mx-auto mb-4 text-stone-500">
                    <Banknote size={28} />
                  </div>
                  <h3 className="text-lg font-black mb-2">No Payout Requests Yet</h3>
                  <p className="text-stone-500 text-sm font-semibold max-w-sm mx-auto">
                    Request your first payout above and it will appear here once submitted for admin review.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-stone-950/40">
                      <tr>
                        <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                          Date
                        </th>
                        <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                          Amount
                        </th>
                        <th className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-stone-500">
                          Status
                        </th>
                        <th className="px-6 py-4 text-right text-[9px] font-black uppercase tracking-widest text-stone-500">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800/40">
                      {data.payouts.map((payout, i) => (
                        <motion.tr
                          key={payout.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="hover:bg-stone-950/20 transition-colors"
                        >
                          <td className="px-6 py-5">
                            <p className="text-xs font-bold text-stone-300">
                              {new Date(payout.created_at).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                            <p className="text-[9px] text-stone-500 font-medium">
                              {new Date(payout.created_at).toLocaleTimeString(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </td>
                          <td className="px-6 py-5">
                            <span className="text-sm font-black text-white">
                              {money(payout.amount, payout.currency_code)}
                            </span>
                          </td>
                          <td className="px-6 py-5">{payoutStatusBadge(payout.status)}</td>
                          <td className="px-6 py-5 text-right">
                            <span className="text-[10px] text-stone-500 font-medium">
                              {payout.status === "paid" && payout.paid_at
                                ? `Paid ${new Date(payout.paid_at).toLocaleDateString()}`
                                : payout.status === "rejected" && payout.reviewed_at
                                ? `Reviewed ${new Date(payout.reviewed_at).toLocaleDateString()}`
                                : payout.status === "approved" && payout.approved_at
                                ? `Approved ${new Date(payout.approved_at).toLocaleDateString()}`
                                : "Awaiting review"}
                            </span>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>

            {/* ── Earnings Breakdown Table ────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-stone-900 border border-stone-800 rounded-[2.5rem] overflow-hidden shadow-xl"
            >
              <div className="p-6 border-b border-stone-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-stone-950 flex items-center justify-center">
                    <WalletCards size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black">Earnings Summary</h3>
                    <p className="text-[10px] text-stone-500 font-bold">
                      Breakdown of revenue, commission, and net
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="flex flex-col gap-3 max-w-lg">
                  {[
                    {
                      label: "Total Revenue (Gross)",
                      value: money(safeEarnings.total_revenue, currency),
                      color: "text-white",
                      bar: "bg-emerald-500",
                      pct: safeEarnings.total_revenue > 0 ? 100 : 0,
                    },
                    {
                      label: `Commission (${(safeEarnings.commission_rate) * 100}%)`,
                      value: money(safeEarnings.commission_deduction, currency),
                      color: "text-amber-400",
                      bar: "bg-amber-500",
                      pct: Math.round(safeDivide(safeEarnings.commission_deduction, safeEarnings.total_revenue) * 100),
                    },
                    {
                      label: "Net Earnings",
                      value: money(safeEarnings.net_earnings, currency),
                      color: "text-emerald-400",
                      bar: "bg-emerald-500",
                      pct: Math.round(safeDivide(safeEarnings.net_earnings, safeEarnings.total_revenue || 1) * 100),
                    },
                  ].map((row, i) => (
                    <div key={row.label}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-bold text-stone-400">{row.label}</span>
                        <span className={`text-sm font-black ${row.color}`}>{row.value}</span>
                      </div>
                      <div className="h-2 bg-stone-950 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.bar} transition-all duration-700`}
                          style={{ width: `${row.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-stone-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1">
                      Orders
                    </p>
                    <p className="text-lg font-black text-white">{safeEarnings.order_count}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1">
                      Avg per Order
                    </p>
                    <p className="text-lg font-black text-white">
                      {money(safeDivide(safeEarnings.total_revenue, safeEarnings.order_count), currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1">
                      Pending
                    </p>
                    <p className="text-lg font-black text-amber-400">
                      {money(safeEarnings.pending_earning, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1">
                      Completed
                    </p>
                    <p className="text-lg font-black text-emerald-400">
                      {money(safeEarnings.completed_earning, currency)}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
