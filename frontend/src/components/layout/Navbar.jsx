import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingBag, 
  Heart, 
  Search, 
  User, 
  Menu, 
  X, 
  Leaf, 
  Moon, 
  Sun,
  LogOut,
  Settings,
  ClipboardList,
  Store,
  Building2
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import Button from '../common/Button';
import { logout } from '../../redux/authSlice';
import { clearUserProfile } from '../../redux/userSlice';
import { firebaseAuthService } from '../../services/firebaseAuthService';
import { BRAND } from '../../config/branding';
import useB2BCompany from '../../hooks/useB2BCompany';
import { isB2BUser } from '../../utils/accountType';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { items } = useSelector((state) => state.cart);
  const wishlistItems = useSelector((state) => state.wishlist.items);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const userProfile = useSelector((state) => state.user?.profile);
  const { company: b2bCompany } = useB2BCompany();
  const isApprovedB2B = isB2BUser(userProfile, b2bCompany);
  const location = useLocation();
  const dispatch = useDispatch();

  const navigate = useNavigate();

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistCount = wishlistItems.length;

  const handleLogout = async () => {
    try {
      await firebaseAuthService.logout();
      dispatch(logout());
      dispatch(clearUserProfile());
      setIsProfileOpen(false);
      navigate('/login');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Shop', path: isApprovedB2B ? '/b2b/products' : '/listing' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
      isScrolled ? 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg shadow-premium py-3' : 'bg-transparent py-5'
    }`}>
      <div className="container-custom flex items-center justify-between">
        {/* Logo — Navigation Isolation Boundary */}
        {/* If the active context holds a validated corporate account role token,
            intercept the request and redirect exclusively to the specialized B2B
            catalog route context. Block all standard retail storefront lookups
            from rendering fallback pricing tiers. */}
        <Link
          to={isApprovedB2B ? '/b2b/dashboard' : '/'}
          className="flex items-center gap-2 group"
        >
          <div className="bg-accent-primary p-2 rounded-xl text-white shadow-lg group-hover:rotate-12 transition-transform">
            <Leaf size={24} />
          </div>
          <span className="text-2xl font-bold tracking-tight text-text-primary">
            {BRAND.name}<span className="text-accent-primary">.</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`text-sm font-semibold transition-colors hover:text-accent-primary ${
                location.pathname === link.path ? 'text-accent-primary' : 'text-text-secondary'
              }`}
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Sell on Eatsie CTA — blocked for B2B users to prevent retail fallback */}
          {!isApprovedB2B && (
            <Link
              to="/login"
              className="hidden md:flex items-center gap-2 text-xs font-bold bg-accent-primary/10 text-accent-primary px-3 py-2 rounded-xl hover:bg-accent-primary hover:text-white transition-colors uppercase tracking-widest"
            >
              <Store size={14} /> Sell
            </Link>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 text-text-secondary transition-colors"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          {/* Search */}
          <Link
            to="/search"
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 text-text-secondary transition-colors"
          >
            <Search size={20} />
          </Link>

          {/* Wishlist */}
          <Link
            to="/wishlist"
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 text-text-secondary transition-colors relative"
          >
            <Heart size={20} />
            {wishlistCount > 0 && (
              <span className="absolute top-0 right-0 h-4 w-4 bg-accent-primary text-white text-[10px] flex items-center justify-center rounded-full">
                {wishlistCount}
              </span>
            )}
          </Link>

          {/* Cart */}
          <Link
            to="/cart"
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 text-text-secondary transition-colors relative"
          >
            <ShoppingBag size={20} />
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 h-4 w-4 bg-accent-primary text-white text-[10px] flex items-center justify-center rounded-full">
                {cartCount}
              </span>
            )}
          </Link>

          {/* Profile */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 text-text-secondary transition-colors"
            >
              <User size={20} />
            </button>
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-premium border border-stone-100 dark:border-slate-700 p-2 overflow-hidden"
                >
                  {isAuthenticated ? (
                    <>
                      <div className="px-3 py-2 border-b border-stone-50 dark:border-slate-700 mb-1">
                        <p className="text-xs font-bold text-text-secondary uppercase">Account</p>
                        <p className="text-sm font-semibold truncate">{userProfile?.name || userProfile?.email || 'User'}</p>
                      </div>

                      {isApprovedB2B && (
                        <div className="px-3 py-2 mx-1 my-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                            <Building2 size={14} className="shrink-0" />
                            <span className="text-xs font-black leading-tight">B2B Buyer</span>
                          </div>
                          <p className="mt-1 text-[10px] font-semibold text-emerald-700/80 dark:text-emerald-300/80 truncate">
                            {b2bCompany.company_name}
                          </p>
                        </div>
                      )}
                      <Link to="/profile" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors">
                        <Settings size={16} /> Profile Settings
                      </Link>
                      <Link to="/orders" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors">
                        <ClipboardList size={16} /> My Orders
                      </Link>
                      {isApprovedB2B && (
                        <>
                          <Link to="/b2b/dashboard" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors">
                            <Building2 size={16} /> B2B Dashboard
                          </Link>
                          <Link to="/b2b/products" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors">
                            <Store size={16} /> Wholesale Products
                          </Link>
                          <Link to="/account/b2b-quotes" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors">
                            <ClipboardList size={16} /> B2B Quotes
                          </Link>
                        </>
                      )}
                      <button 
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg text-sm transition-colors mt-1"
                      >
                        <LogOut size={16} /> Log Out
                      </button>
                    </>
                  ) : (
                    <div className="p-2 flex flex-col gap-2">
                      <Button size="sm" onClick={() => { setIsProfileOpen(false); navigate('/login'); }}>Sign In</Button>
                      <Button variant="secondary" size="sm" onClick={() => { setIsProfileOpen(false); navigate('/login', { state: { mode: 'register' }}); }}>Join Us</Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 text-text-secondary transition-colors"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden bg-white dark:bg-slate-900 border-t border-stone-100 dark:border-slate-800 overflow-hidden"
          >
            <div className="container-custom py-6 flex flex-col gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-lg font-semibold text-text-primary"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;

