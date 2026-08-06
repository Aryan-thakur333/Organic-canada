import { Link, NavLink, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { BarChart3, LogOut, ReceiptText, RotateCcw, Search, ShoppingCart, Users, LockKeyhole } from "lucide-react";
import { usePOS } from "../../contexts/usePOS";

const nav = [
  { to: "/pos/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/pos/sell", label: "Sell", icon: ShoppingCart },
  { to: "/pos/orders", label: "Orders", icon: ReceiptText },
  { to: "/pos/customers", label: "Customers", icon: Users },
  { to: "/pos/returns", label: "Returns", icon: RotateCcw },
];

export default function POSShell({ children }) {
  const staff = useSelector((state) => state.pos.staff);
  const register = useSelector((state) => state.pos.register);
  const session = useSelector((state) => state.pos.session);
  const { clearRuntime } = usePOS();
  const navigate = useNavigate();

  const logout = () => {
    clearRuntime({ clearToken: true });
    navigate("/pos/login");
  };
  const sellRoute = session?.register_id ? `/pos/register/${session.register_id}` : "/pos/register-select";
  const navigation = nav.map((item) => item.to === "/pos/sell" ? { ...item, to: sellRoute } : item);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <aside className="fixed left-0 top-0 hidden h-screen w-20 border-r border-zinc-200 bg-white lg:flex lg:flex-col lg:items-center lg:py-4">
        <Link to={sellRoute} title="Sell" aria-label="Sell" className="mb-6 flex h-11 w-11 items-center justify-center rounded bg-zinc-950 text-white">
          <Search size={20} />
        </Link>
        <nav className="flex flex-1 flex-col gap-2">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `flex h-11 w-11 items-center justify-center rounded border ${
                  isActive ? "border-emerald-700 bg-emerald-700 text-white" : "border-transparent text-zinc-500 hover:bg-zinc-100"
                }`
              }
            >
              <Icon size={20} />
            </NavLink>
          ))}
        </nav>
        {register?.id ? <Link to={`/pos/register/${register.id}/close`} title="Close register" aria-label="Close register" className="flex h-11 w-11 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100"><LockKeyhole size={20} /></Link> : null}
        <button onClick={logout} title="Sign out" aria-label="Sign out" className="flex h-11 w-11 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100">
          <LogOut size={20} />
        </button>
      </aside>

      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur lg:ml-20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700">Eatsie POS</p>
            <p className="text-sm text-zinc-500">{staff?.email || "Local staff"}</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:hidden">
            {navigation.map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `rounded px-3 py-2 text-sm font-semibold ${isActive ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700"}`}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="lg:ml-20">{children}</main>
    </div>
  );
}
