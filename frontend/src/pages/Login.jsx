import React, { useState, useEffect, useRef } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Leaf, ArrowLeft, Store, User, AlertCircle, Building2 } from "lucide-react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import Button from "../components/common/Button";
import Input from "../components/common/Input";

import {
  loginSuccess,
  loginFailure,
  authStart,
  authResolved,
  logout
} from "../redux/authSlice";

import { setUserProfile } from "../redux/userSlice";

import useToast from "../hooks/useToast";

import { authService } from "../services/medusa/authService";
import { firebaseAuthService, syncWithMedusa } from "../services/firebaseAuthService";
import { accountService } from "../services/accountService";
import { mapCustomerToProfile } from "../utils/customerProfile";

const Login = () => {
  const location = useLocation();
  const [mode, setMode] = useState(() => {
    if (location.pathname === "/login/customer") return "login";
    if (location.pathname === "/register/customer") return "register";
    return location.state?.mode || "select";
  });
  const [isSignUpMode, setIsSignUpMode] = useState(mode === "register");

  useEffect(() => {
    if (location.pathname === "/login/customer") {
      setMode("login");
      setIsSignUpMode(false);
    } else if (location.pathname === "/register/customer") {
      setMode("register");
      setIsSignUpMode(true);
    } else if (location.pathname === "/login") {
      setMode("select");
      setIsSignUpMode(false);
    }
  }, [location.pathname]);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirm_password: "",
    first_name: "",
    last_name: "",
    phone: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const navigate = useNavigate();

  const dispatch = useDispatch();

  const { isAuthenticated } = useSelector((state) => state.auth);

  const { showToast } = useToast();

  const navigationCompletedRef = useRef(false);
  const googleLoginInFlightRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated && mode !== "select" && !isGoogleLoading && !navigationCompletedRef.current) {
      navigationCompletedRef.current = true;
      navigate(location.state?.from || "/profile", { replace: true });
    }
  }, [isAuthenticated, navigate, location, mode, isGoogleLoading]);

  const handleLogout = async () => {
    try {
      await firebaseAuthService.logout();
      dispatch(logout());
      showToast("Logged out successfully", "success");
    } catch (error) {
      console.error("Logout error", error);
    }
  };

  useEffect(() => {
    setIsSignUpMode(mode === "register");
  }, [mode]);

  const setCustomerAuthMode = (signUp) => {
    navigate(signUp ? "/register/customer" : "/login/customer");
  };

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  /* -------------------------------------------------------------------------- */
  /*                               EMAIL AUTH                                   */
  /* -------------------------------------------------------------------------- */

  const handleAuth = async (e) => {
    e.preventDefault();

    setIsLoading(true);
    setFormError("");

    dispatch(authStart());

    try {
      if (mode === "login") {
        const accountType = await accountService.getAccountType(formData.email);
        if (accountType === "vendor") {
          const error = new Error("This email belongs to a seller account. Use Login as Seller.");
          error.code = "SELLER_ACCOUNT";
          throw error;
        }
        const authResponse = await authService.login(formData.email, formData.password);

        const profileData = await authService.getCurrentCustomer();
        const customer = profileData.customer;

        // Clean up stale legacy keys on fresh login
        ['b2b_company', 'b2b_company_id', 'b2b_customer', 'b2b_status', 'b2b_auth_mode', 'b2b_registration_draft', 'selected_account_type'].forEach(key => localStorage.removeItem(key));

        dispatch(loginSuccess({ token: authResponse?.token, user: customer }));

        dispatch(
          setUserProfile(mapCustomerToProfile(customer))
        );

        dispatch(authResolved());

        showToast("Welcome back 🌿", "success");
      }

      if (mode === "register") {
        if (formData.password.length < 8) {
          throw new Error("Password must be at least 8 characters long");
        }
        if (formData.password !== formData.confirm_password) {
          throw new Error("Passwords do not match");
        }
        
        const { token, customer } = await authService.register({
          email: formData.email,
          password: formData.password,
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
        });

        // Auto-login: update Redux state so the user is immediately authenticated
        ['b2b_company', 'b2b_company_id', 'b2b_customer', 'b2b_status', 'b2b_auth_mode', 'b2b_registration_draft', 'selected_account_type'].forEach(key => localStorage.removeItem(key));
        dispatch(loginSuccess({ token, user: customer }));

        dispatch(
          setUserProfile(mapCustomerToProfile(customer))
        );

        dispatch(authResolved());

        showToast("Account created! Welcome 🌿", "success");
        navigate("/profile");
      }

      if (mode === "forgot") {
        await authService.requestPasswordReset(formData.email);
        showToast(
          "If that account exists, a password reset link has been sent.",
          "info"
        );
      }
    } catch (error) {
      let message =
        error?.response?.data?.message ||
        error?.message ||
        "Authentication failed";

      const status = error?.response?.status;
      
      if (status === 401) {
        message = "Invalid email or password";
      } else if (status === 429 || error?.code === "ERR_TOO_MANY_REQUESTS" || message.includes("Too many requests")) {
        message = "Too many attempts. Please wait a few minutes and try again.";
      } else if (error?.code === "BACKEND_OFFLINE" || message.includes("Backend offline") || error?.code === "ERR_NETWORK") {
        message = "Backend is not reachable. Please start the server.";
      } else if (status === 409 || message.toLowerCase().includes("already exists") || message.toLowerCase().includes("already registered")) {
        message = "This email is already registered. Please login.";
      }

      dispatch(loginFailure(message));
      setFormError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                              GOOGLE AUTH                                   */
  /* -------------------------------------------------------------------------- */

  const handleGoogleSignIn = async () => {
    if (googleLoginInFlightRef.current) return;
    googleLoginInFlightRef.current = true;

    try {
      setIsGoogleLoading(true);
      setFormError("");

      dispatch(authStart());

      const result = await firebaseAuthService.signInWithGooglePopup();
      
      const medusaUser = await syncWithMedusa(result.firebaseUser);

      // Clean up stale legacy keys on fresh login
      ['b2b_company', 'b2b_company_id', 'b2b_customer', 'b2b_status', 'b2b_auth_mode', 'b2b_registration_draft', 'selected_account_type'].forEach(key => localStorage.removeItem(key));

      // Token should now be present after syncWithMedusa
      const { getCustomerToken } = await import("../services/medusa/tokenStorage");
      const token = getCustomerToken();

      dispatch(loginSuccess({ user: medusaUser, token }));
      dispatch(setUserProfile(mapCustomerToProfile(medusaUser)));
      dispatch(authResolved());

      showToast("Google Login Success 🌿", "success");

      if (!navigationCompletedRef.current) {
        navigationCompletedRef.current = true;
        navigate(location.state?.from || "/profile", { replace: true });
      }

    } catch (error) {
      console.error('[Login] Google sign-in failed:', error);

      firebaseAuthService.handleGoogleAuthError(error, (msg) => {
        setFormError(msg);
        dispatch(loginFailure(msg));
        
        // Don't show toast for user cancellations or duplicate requests
        if (!msg.includes("cancelled") && !msg.includes("open") && !msg.includes("cancel")) {
          showToast(msg, "error");
        }
      });
    } finally {
      googleLoginInFlightRef.current = false;
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background Blur */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-rose-700/5 rounded-full blur-3xl" />
      </div>

      <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[480px] relative z-10"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 justify-center mb-10 group">
          <div className="bg-[#594236] p-2.5 rounded-[14px] text-white shadow-lg group-hover:rotate-12 transition-transform duration-300">
            <Leaf className="w-6 h-6" />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-2xl font-black tracking-tighter text-[#594236] uppercase md:text-3xl">
              Organic <span className="text-[#C16D45]">Canada</span>
            </span>
            <span className="text-[10px] font-bold tracking-[0.2em] text-[#8C7A70] uppercase">
              Fresh Grocery
            </span>
          </div>
        </Link>

        {/* Card */}
        <div className="bg-white rounded-[32px] shadow-[0_8px_40px_rgb(0,0,0,0.04)] sm:p-10 p-7 border border-stone-100">
          {/* Heading */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black mb-2">
              {mode === "select"
                ? "Choose your account."
                : mode === "login"
                ? "Welcome Back."
                : mode === "register"
                ? "Create Account."
                : "Reset Password"}
            </h1>

            <p className="text-text-secondary text-sm">
              {mode === "select"
                ? "How would you like to continue?"
                : mode === "login"
                ? "Sign in to continue"
                : mode === "register"
                ? "Start your organic journey"
                : "Enter your email"}
            </p>
          </div>

          {formError && mode !== "select" && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Form */}
          {mode === "select" ? (
            isAuthenticated ? (
              <div className="flex flex-col gap-3">
                <div className="bg-stone-50 rounded-2xl p-5 text-center mb-2 border border-stone-100">
                  <p className="font-bold text-lg text-stone-800">Welcome back!</p>
                  <p className="text-sm text-stone-500">You are already logged in.</p>
                </div>
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-white bg-[#594236] hover:bg-[#4A372D] shadow-lg shadow-[#594236]/20 transition-all duration-200"
                  onClick={() => navigate("/profile")}
                >
                  Continue to Profile
                </button>
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-[#594236] bg-white border-2 border-stone-200 hover:bg-stone-50 transition-all duration-200"
                  onClick={() => navigate("/orders")}
                >
                  View Orders
                </button>
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-red-600 bg-white border-2 border-stone-200 hover:border-red-200 hover:bg-red-50 transition-all duration-200"
                  onClick={handleLogout}
                >
                  Logout
                </button>
                
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-100"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-widest">
                    <span className="bg-white px-4 text-stone-400 font-black">
                      Partner Access
                    </span>
                  </div>
                </div>
                
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-[#C16D45] bg-white border-2 border-[#C16D45]/30 hover:border-[#C16D45] hover:bg-[#C16D45]/5 transition-all duration-200"
                  onClick={() => navigate("/login/seller")}
                >
                   <Store size={18} /> Login as Seller
                </button>
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-[#8B2635] bg-white border-2 border-[#8B2635]/30 hover:border-[#8B2635] hover:bg-[#8B2635]/5 transition-all duration-200"
                  onClick={() => navigate("/login/b2b")}
                >
                   <Building2 size={18} /> Login as B2B Buyer
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-white bg-[#594236] hover:bg-[#4A372D] shadow-lg shadow-[#594236]/20 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#594236]/20"
                  onClick={() => navigate("/login/customer")}
                >
                   <User size={18} /> Login as Customer
                </button>
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-[#594236] bg-white border-2 border-stone-200 hover:bg-stone-50 hover:border-stone-300 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-stone-200"
                  onClick={() => navigate("/register/customer")}
                >
                   <User size={18} /> Create Customer Account
                </button>
                
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-[#C16D45] bg-white border-2 border-[#C16D45]/30 hover:border-[#C16D45] hover:bg-[#C16D45]/5 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#C16D45]/20 mt-2"
                  onClick={() => navigate("/login/seller")}
                >
                   <Store size={18} /> Login as Seller
                </button>
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-[#8B2635] bg-white border-2 border-[#8B2635]/30 hover:border-[#8B2635] hover:bg-[#8B2635]/5 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#8B2635]/20"
                  onClick={() => navigate("/login/b2b")}
                >
                   <Building2 size={18} /> Login as B2B Buyer
                </button>
                
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-100"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-widest">
                    <span className="bg-white px-4 text-stone-400 font-black">
                      New partner?
                    </span>
                  </div>
                </div>
                
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-stone-700 bg-stone-50 hover:bg-stone-100 transition-all duration-200"
                  onClick={() => navigate("/register/seller")}
                >
                   <Leaf size={18} /> Become a Seller
                </button>
                <button 
                  className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-stone-700 bg-stone-50 hover:bg-stone-100 transition-all duration-200"
                  onClick={() => navigate("/register/b2b")}
                >
                   <Building2 size={18} /> Register B2B Company
                </button>
              </div>
            )
          ) : (
            <form
              onSubmit={handleAuth}
              className="flex flex-col gap-5"
            >
            <AnimatePresence mode="wait">
              {isSignUpMode && (
                <Motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{
                    opacity: 1,
                    height: "auto",
                  }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-5"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="First Name"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleChange}
                      placeholder="John"
                      required
                    />

                    <Input
                      label="Last Name"
                      name="last_name"
                      value={formData.last_name}
                      onChange={handleChange}
                      placeholder="Doe"
                      required
                    />
                  </div>
                  <Input
                    label="Phone Number (Optional)"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 000-0000"
                  />
                </Motion.div>
              )}
            </AnimatePresence>

            <Input
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="hello@example.com"
              required
            />

            {mode !== "forgot" && (
              <div className="relative">
                <Input
                  label="Password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-[34px] text-xs font-bold text-text-secondary hover:text-accent-primary"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            )}
            
            {mode === "register" && (
              <div className="relative">
                <Input
                  label="Confirm Password"
                  name="confirm_password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirm_password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-[34px] text-xs font-bold text-text-secondary hover:text-accent-primary"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            )}

            {mode === "login" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-xs font-bold text-accent-primary hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 h-[56px] rounded-full font-bold text-white bg-[#594236] hover:bg-[#4A372D] shadow-lg shadow-[#594236]/20 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-[#594236]/20 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading && (
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              )}
              {mode === "login"
                ? "Sign In"
                : mode === "register"
                ? "Create Account"
                : "Send Reset Link"}

              {!isLoading && <ArrowRight size={18} />}
            </button>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-100 dark:border-slate-700"></div>
              </div>

              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-800 px-4 text-text-secondary font-bold">
                  Or continue with
                </span>
              </div>
            </div>

            {/* Google Button */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="gap-3 border-stone-200"
              onClick={handleGoogleSignIn}
              isLoading={isGoogleLoading}
              disabled={isGoogleLoading || isLoading}
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
                className="w-5 h-5"
              />

              {isGoogleLoading ? "Connecting Google account…" : "Continue with Google"}
            </Button>

            {mode !== "forgot" && (
              <div className="rounded-2xl border border-stone-100 dark:border-slate-700 bg-stone-50/70 dark:bg-slate-900/40 p-4 text-center">
                <p className="text-sm text-text-secondary font-medium">
                  {isSignUpMode ? "Already have a customer account?" : "New to Organic Canada?"}
                </p>
                <button
                  type="button"
                  onClick={() => setCustomerAuthMode(!isSignUpMode)}
                  className="mt-1 text-sm font-black text-accent-primary hover:text-accent-secondary hover:underline"
                >
                  {isSignUpMode ? "Switch to Sign In" : "Create a Customer Account"}
                </button>
              </div>
            )}

            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => setCustomerAuthMode(false)}
                className="text-sm font-black text-accent-primary hover:text-accent-secondary hover:underline"
              >
                Back to Sign In
              </button>
            )}
          </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center flex flex-col gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-secondary hover:text-accent-primary mx-auto transition-colors"
          >
            <ArrowLeft size={14} />
            Back Home
          </Link>
        </div>
      </Motion.div>
    </div>
  );
};

export default Login;
