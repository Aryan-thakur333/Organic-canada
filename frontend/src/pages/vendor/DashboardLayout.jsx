import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../redux/vendorSlice";
import { 
  Store, 
  LayoutDashboard, 
  ShoppingBag, 
  Package, 
  Boxes,
  WalletCards,
  LogOut, 
  Menu, 
  X, 
  UserCircle 
} from "lucide-react";
import toast from "react-hot-toast";

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.vendor.profile);

  const handleLogout = () => {
    setProfileDropdownOpen(false);
    dispatch(logout());
    toast.success("Signed out successfully");
    navigate("/vendor/login");
  };

  const navItems = [
    { label: "Overview", path: "/vendor/dashboard", icon: <LayoutDashboard size={20} /> },
    { label: "Products", path: "/vendor/products", icon: <Package size={20} /> },
    { label: "Orders", path: "/vendor/orders", icon: <ShoppingBag size={20} /> },
    { label: "Inventory", path: "/vendor/inventory", icon: <Boxes size={20} /> },
    { label: "Earnings", path: "/vendor/earnings", icon: <WalletCards size={20} /> },
  ];

  return (
    <div className="min-h-screen bg-[#090a0f] text-white font-sans flex">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-stone-900 border-r border-stone-800 hidden md:flex flex-col shrink-0">
        <div className="p-6 border-b border-stone-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center">
            <Store className="text-stone-950" size={20} />
          </div>
          <div>
            <h2 className="font-black text-sm uppercase tracking-wider text-emerald-400">Eatsie Vendor</h2>
            <p className="text-[10px] text-stone-500 font-bold">Partner Portal</p>
          </div>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-1.5 mt-6">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-black transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-400 border border-emerald-500/20"
                    : "text-stone-400 hover:bg-stone-800/50 hover:text-white"
                }`}
              >
                {item.icon} {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-black text-red-400 hover:bg-red-500/5 hover:text-red-300 transition-all text-left"
          >
            <LogOut size={20} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-64 bg-stone-900 border-r border-stone-800 z-50 transition-transform duration-300 transform md:hidden flex flex-col ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-6 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center">
              <Store className="text-stone-950" size={20} />
            </div>
            <div>
              <h2 className="font-black text-sm uppercase tracking-wider text-emerald-400">Eatsie</h2>
              <p className="text-[10px] text-stone-500 font-bold">Partner Portal</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-stone-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-1.5 mt-6">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-black transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-400 border border-emerald-500/20"
                    : "text-stone-400 hover:bg-stone-800/50 hover:text-white"
                }`}
              >
                {item.icon} {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-black text-red-400 hover:bg-red-500/5 hover:text-red-300 transition-all text-left"
          >
            <LogOut size={20} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-20 bg-stone-900/40 backdrop-blur-md border-b border-stone-800/60 px-6 flex items-center justify-between relative z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-stone-400 hover:text-white md:hidden"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg font-black tracking-tight text-white hidden md:block">
              {profile?.name || "My Store"} Dashboard.
            </h1>
          </div>

          <div className="flex items-center gap-3 relative">
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              onBlur={() => setTimeout(() => setProfileDropdownOpen(false), 150)}
              className="flex items-center gap-3 group"
            >
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{profile?.name}</span>
                <span className="text-[10px] text-stone-500 font-semibold">{profile?.email}</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/50 transition-all">
                <UserCircle size={24} />
              </div>
            </button>

            {/* Profile Dropdown */}
            {profileDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-stone-800">
                    <p className="text-xs font-bold text-white truncate">{profile?.name || 'Vendor'}</p>
                    <p className="text-[10px] text-stone-500 truncate">{profile?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-black text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Dynamic Sub-page View wrapper */}
        <main className="flex-1 p-6 md:p-10 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
