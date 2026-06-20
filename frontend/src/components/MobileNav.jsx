import { Link, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { Home, ShoppingBag, Heart, ShoppingCart, User, LogIn } from "lucide-react";
import { ROUTES } from "../utils/constants";

export default function MobileNav() {
  const location = useLocation();
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);

  const navItems = [
    { label: "Home", icon: <Home size={20} />, to: ROUTES.HOME },
    { label: "Shop", icon: <ShoppingBag size={20} />, to: "/listing" },
    { label: "Wish", icon: <Heart size={20} />, to: ROUTES.WISHLIST },
    { label: "Cart", icon: <ShoppingCart size={20} />, to: ROUTES.CART },
    ...(isAuthenticated
      ? [{ label: "Profile", icon: <User size={20} />, to: ROUTES.PROFILE }]
      : [{ label: "Sign in", icon: <LogIn size={20} />, to: ROUTES.LOGIN }]),
  ];

  const colsClass = navItems.length >= 5 ? "grid-cols-5" : "grid-cols-4";

  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-50 border-t border-stone-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md md:hidden pb-safe">
      <div className={`mx-auto grid max-w-lg ${colsClass}`}>
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.to ||
            (item.to === "/listing" && location.pathname.startsWith("/listing")) ||
            (item.to === ROUTES.WISHLIST && location.pathname.startsWith("/wishlist"));

          return (
            <Link
              key={`${item.label}-${item.to}`}
              to={item.to}
              className={`flex flex-col items-center justify-center py-3 transition-colors ${
                isActive ? "text-accent-primary" : "text-text-secondary hover:text-accent-primary"
              }`}
            >
              {item.icon}
              <span className={`mt-1 text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
