import React, { useState, useEffect } from "react";
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
} from "../redux/authSlice";

import { setUserProfile } from "../redux/userSlice";

import useToast from "../hooks/useToast";

import { authService } from "../services/medusa/authService";
import { firebaseAuthService } from "../services/firebaseAuthService";
import { accountService } from "../services/accountService";
import { mapCustomerToProfile } from "../utils/customerProfile";

const Login = () => {
  const location = useLocation();
  const [mode, setMode] = useState(location.state?.mode || "select");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const navigate = useNavigate();

  const dispatch = useDispatch();

  const { isAuthenticated } = useSelector((state) => state.auth);

  const { showToast } = useToast();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(location.state?.from || "/");
    }
  }, [isAuthenticated, navigate, location]);

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
        await authService.login(formData.email, formData.password);

        const profileData = await authService.getCurrentCustomer();
        const customer = profileData.customer;

        dispatch(loginSuccess({ user: customer }));

        dispatch(
          setUserProfile(mapCustomerToProfile(customer))
        );

        dispatch(authResolved());

        showToast("Welcome back 🌿", "success");
      }

      if (mode === "register") {
        const { customer } = await authService.register({
          email: formData.email,
          password: formData.password,
          first_name: formData.first_name,
          last_name: formData.last_name,
        });

        // Auto-login: update Redux state so the user is immediately authenticated
        dispatch(loginSuccess({ user: customer }));

        dispatch(
          setUserProfile(mapCustomerToProfile(customer))
        );

        dispatch(authResolved());

        showToast("Account created! Welcome 🌿", "success");
        navigate("/");
      }

      if (mode === "forgot") {
        await authService.requestPasswordReset(formData.email);
        showToast(
          "If that account exists, a password reset link has been sent.",
          "info"
        );
      }
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Authentication failed";

      dispatch(loginFailure(message));
      setFormError(message);

      showToast(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                              GOOGLE AUTH                                   */
  /* -------------------------------------------------------------------------- */

  const handleGoogleSignIn = async () => {
    if (isGoogleLoading) return;
    try {
      setIsGoogleLoading(true);
      setFormError("");

      dispatch(authStart());

      const result =
        await firebaseAuthService.signInWithGoogle();

      const medusaUser = result?.medusaUser;

      dispatch(loginSuccess({ user: medusaUser, token: result.token }));

      dispatch(
        setUserProfile(mapCustomerToProfile(medusaUser))
      );

      dispatch(authResolved());

      showToast("Google Login Success 🌿", "success");

      navigate(location.state?.from || "/");
    } catch (error) {
      console.error('[Login] Google sign-in failed:', error);

      dispatch(loginFailure(error.message));
      setFormError(error?.message || "Google Sign-In failed");

      showToast(
        error?.message || "Google Sign-In failed",
        "error"
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Blur */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-accent-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-accent-secondary/5 rounded-full blur-3xl" />
      </div>

      <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 justify-center mb-12 group">
          <div className="bg-organic-primary p-2.5 rounded-xl text-white shadow-lg group-hover:rotate-12 transition-transform">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 008 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5a6.22 6.22 0 002.89 3.67A18 42 42 0 0117 8z" />
            </svg>
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-2xl font-black tracking-tighter text-organic-primary uppercase md:text-3xl">
              Organic <span className="text-organic-terracotta">Canada</span>
            </span>
            <span className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">
              Fresh Grocery
            </span>
          </div>
        </Link>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium p-8 border border-stone-100 dark:border-slate-700">
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
            <div className="flex flex-col gap-4">
              <Button size="lg" className="w-full gap-3 justify-center" onClick={() => setMode("login")}>
                 <User size={18} /> Login as Customer
              </Button>
              <Button variant="outline" size="lg" className="w-full gap-3 justify-center border-accent-primary text-accent-primary hover:bg-accent-primary hover:text-white transition-all" onClick={() => navigate("/vendor/login")}>
                 <Store size={18} /> Login as Seller
              </Button>
              <Button variant="outline" size="lg" className="w-full gap-3 justify-center border-organic-primary text-organic-primary hover:bg-organic-primary hover:text-white transition-all" onClick={() => navigate("/b2b/login")}>
                 <Building2 size={18} /> Login as B2B Buyer
              </Button>
              
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stone-100 dark:border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-slate-800 px-4 text-text-secondary font-bold">
                    New partner?
                  </span>
                </div>
              </div>
              
              <Button variant="secondary" size="lg" className="w-full gap-3 justify-center" onClick={() => navigate("/vendor/register")}>
                 <Leaf size={18} /> Become a Seller
              </Button>
              <Button variant="secondary" size="lg" className="w-full gap-3 justify-center" onClick={() => navigate("/b2b/register-company")}>
                 <Building2 size={18} /> Register B2B Company
              </Button>
            </div>
          ) : (
            <form
              onSubmit={handleAuth}
              className="flex flex-col gap-5"
            >
            <AnimatePresence mode="wait">
              {mode === "register" && (
                <Motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{
                    opacity: 1,
                    height: "auto",
                  }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-2 gap-4"
                >
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
              <Input
                label="Password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
              />
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

            <Button
              type="submit"
              size="lg"
              className="mt-4 gap-2"
              isLoading={isLoading}
            >
              {mode === "login"
                ? "Sign In"
                : mode === "register"
                ? "Create Account"
                : "Send Reset Link"}

              {!isLoading && <ArrowRight size={18} />}
            </Button>

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
          </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center flex flex-col gap-4">
          <p className="text-sm text-text-secondary font-medium">
            {mode === "select"
              ? ""
              : mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}

            {mode !== "select" && (
              <button
                onClick={() =>
                  setMode(
                    mode === "login"
                      ? "register"
                      : "login"
                  )
                }
                className="ml-2 font-black text-accent-primary hover:underline"
              >
                {mode === "login"
                  ? "Create one"
                  : "Sign In"}
              </button>
            )}
          </p>

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
