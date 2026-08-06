import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Eye } from "lucide-react";
import toast from "react-hot-toast";
import POSShell from "../../components/pos/POSShell";
import POSReceipt from "../../components/pos/POSReceipt";
import { posApi } from "../../services/posApi";

const money = (amount, currency) => new Intl.NumberFormat("en-CA", { style: "currency", currency: String(currency || "cad").toUpperCase() }).format(Number(amount || 0) / 100);

export default function POSOrders() {
  const register = useSelector((state) => state.pos.register);
  const [transactions, setTransactions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [receipt, setReceipt] = useState(null);
  useEffect(() => { if (register?.id) posApi.listOrders({ register_id: register.id }).then((data) => setTransactions(data.transactions || [])).catch((error) => toast.error(error.message)); }, [register?.id]);
  const view = async (transaction) => { try { const data = await posApi.getReceipt(transaction.id); setSelected(transaction); setReceipt(data.receipt); } catch (error) { toast.error(error.message); } };
  return <POSShell><div className="p-4 lg:p-6"><h1 className="text-2xl font-black">POS transactions</h1><p className="text-sm text-zinc-500">Register-scoped sales, returns, and receipt reprints.</p><div className="mt-4 overflow-x-auto rounded border bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-zinc-50"><tr><th className="p-3">Transaction</th><th className="p-3">Order</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Total</th><th /></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id} className="border-t"><td className="p-3 font-mono text-xs">{transaction.id}</td><td className="p-3 font-mono text-xs">{transaction.order_id}</td><td className="p-3">{transaction.transaction_type}</td><td className="p-3">{transaction.status}</td><td className="p-3 font-black">{money(transaction.total_minor, transaction.currency_code)}</td><td className="p-3 text-right"><button onClick={() => view(transaction)} className="rounded p-2 hover:bg-zinc-100"><Eye size={18} /></button></td></tr>)}</tbody></table></div></div><POSReceipt receipt={receipt} transaction={selected} onClose={() => setReceipt(null)} onNewSale={() => setReceipt(null)} /></POSShell>;
}
