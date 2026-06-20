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
  Sparkles,
  Zap
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import Button from '../common/Button';
import { logout } from '../../redux/authSlice';
import { authService } from '../../services/medusa/authService';
import { firebaseAuthService } from '../../services/firebaseAuthService';
import { BRAND } from '../../config/branding';
import apiClient from '../../services/apiClient';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { items } = useSelector((state) => state.cart);
  const wishlistItems = useSelector((state) => state.wishlist.items);
  const { isAuthenticated } = useSelector((state) => state.auth);
  const userProfile = useSelector((state) => state.user?.profile);
  const location = useLocation();
  const dispatch = useDispatch();

  const navigate = useNavigate();

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistCount = wishlistItems.length;

  const handleLogout = async () => {
    try {
      await firebaseAuthService.logout();
      dispatch(logout());
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
    { name: 'Shop', path: '/listing' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
      isScrolled ? 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg shadow-premium py-3' : 'bg-transparent py-5'
    }`}>
      <div className="container-custom flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
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
          {/* Sell on Eatsie CTA */}
          <Link
            to="/login"
            className="hidden md:flex items-center gap-2 text-xs font-bold bg-accent-primary/10 text-accent-primary px-3 py-2 rounded-xl hover:bg-accent-primary hover:text-white transition-colors uppercase tracking-widest"
          >
            <Store size={14} /> Sell
          </Link>

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
                        <p className="text-sm font-semibold truncate">{userProfile?.email || 'User'}</p>
                      </div>

                      {/* Premium Membership Status */}
                      {userProfile?.metadata?.is_premium === true || userProfile?.metadata?.is_premium === 'true' ? (
                        <div className="px-3 py-2 mx-1 my-1 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-700/50 flex items-center gap-2">
                          <Sparkles size={14} className="text-amber-500 shrink-0" />
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-300 leading-tight">
                            ✨ Premium Member
                          </span>
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-auto font-medium whitespace-nowrap">
                            <Zap size={10} className="inline mr-0.5" />Fast Delivery
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              setIsProfileOpen(false)
                              // POST to /store/subscriptions to initiate the premium checkout session
                              const res = await apiClient.post('/store/subscriptions', {
                                product_title: 'Premium Membership',
                                plan: 'monthly',
                                amount: 1000,
                                currency: 'usd',
                              })
                              // If a Stripe Checkout URL is returned, redirect the user
                              if (res?.url) {
                                window.location.href = res.url
                              } else if (res?.subscription) {
                                navigate('/profile', { state: { premium_upgraded: true } })
                              }
                            } catch (err) {
                              console.error('[Premium Upgrade] Failed to initiate:', err)
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 mx-1 my-1 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700/50 hover:from-amber-100 hover:to-orange-100 dark:hover:from-amber-800/30 dark:hover:to-orange-800/30 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 text-sm font-semibold text-amber-800 dark:text-amber-200"
                        >
                          <Sparkles size={16} className="text-amber-500 shrink-0" />
                          <span>🚀 Upgrade to Premium</span>
                          <span className="ml-auto text-[11px] text-amber-600 dark:text-amber-400 font-medium">$10/mo</span>
                        </button>
                      )}

                      <Link to="/profile" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors">
                        <Settings size={16} /> Profile Settings
                      </Link>
                      <Link to="/orders" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-stone-50 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors">
                        <ClipboardList size={16} /> My Orders
                      </Link>
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
