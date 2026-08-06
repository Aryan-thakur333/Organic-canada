import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { ReceiptText, RotateCcw, ShoppingCart, Users } from "lucide-react";
import POSShell from "../../components/pos/POSShell";

const actions = [
  { to: "/pos/sell", label: "Start Sale", icon: ShoppingCart },
  { to: "/pos/orders", label: "Order History", icon: ReceiptText },
  { to: "/pos/customers", label: "Customers", icon: Users },
  { to: "/pos/returns", label: "Returns", icon: RotateCcw },
];

export default function POSDashboard() {
  const session = useSelector((state) => state.pos.session);
  const sellRoute = session?.register_id ? `/pos/register/${session.register_id}` : "/pos/register-select";
  return (
    <POSShell>
      <div className="p-4 lg:p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-black">POS Dashboard</h1>
          <p className="text-sm font-semibold text-zinc-500">Cashier workspace for in-store orders.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map(({ to, label, icon: Icon }) => (
            (() => {
              const destination = to === "/pos/sell" ? sellRoute : to;
              return (
            <Link key={to} to={destination} className="flex min-h-32 items-center justify-between rounded border border-zinc-200 bg-white p-5 shadow-sm hover:border-emerald-700">
              <span className="text-lg font-black">{label}</span>
              <Icon className="text-emerald-700" size={28} />
            </Link>
              );
            })()
          ))}
        </div>
      </div>
    </POSShell>
  );
}
