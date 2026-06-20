import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Leaf, ArrowLeft, Store, User } from "lucide-react";
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

    dispatch(authStart());

    try {
      if (mode === "login") {
        await authService.login(formData.email, formData.password);

        const profileData = await authService.getCurrentCustomer();
        const customer = profileData.customer;

        dispatch(loginSuccess({ user: customer }));

        dispatch(
          setUserProfile({
            id: customer.id,
            email: customer.email,
            name:
              `${customer.first_name || ""} ${
                customer.last_name || ""
              }`.trim() || customer.email,
            phone: customer.phone || "",
          })
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
          setUserProfile({
            id: customer.id,
            email: customer.email,
            name:
              `${customer.first_name || ""} ${
                customer.last_name || ""
              }`.trim() || customer.email,
            phone: customer.phone || "",
          })
        );

        dispatch(authResolved());

        showToast("Account created! Welcome 🌿", "success");
        navigate("/");
      }

      if (mode === "forgot") {
        showToast(
          "Password reset link sent to your email",
          "info"
        );
      }
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Authentication failed";

      dispatch(loginFailure(message));

      showToast(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                              GOOGLE AUTH                                   */
  /* -------------------------------------------------------------------------- */

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);

      dispatch(authStart());

      const result =
        await firebaseAuthService.signInWithGoogle();

      const medusaUser = result?.medusaUser;

      dispatch(loginSuccess({ user: medusaUser }));

      dispatch(
        setUserProfile({
          id: medusaUser.id,
          email: medusaUser.email,
          name:
            `${medusaUser.first_name || ""} ${
              medusaUser.last_name || ""
            }`.trim() || medusaUser.email,
          phone: medusaUser.phone || "",
        })
      );

      dispatch(authResolved());

      showToast("Google Login Success 🌿", "success");

      navigate("/");
    } catch (error) {
      console.log(error);

      dispatch(loginFailure(error.message));

      showToast(
        error?.message || "Google Sign-In failed",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Blur */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-accent-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-accent-secondary/5 rounded-full blur-3xl" />
      </div>

      <motion.div
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

          {/* Form */}
          {mode === "select" ? (
            <div className="flex flex-col gap-4">
              <Button size="lg" className="w-full gap-3 justify-center" onClick={() => setMode("login")}>
                 <User size={18} /> Continue as Customer
              </Button>
              <Button variant="outline" size="lg" className="w-full gap-3 justify-center border-accent-primary text-accent-primary hover:bg-accent-primary hover:text-white transition-all" onClick={() => navigate("/vendor/login")}>
                 <Store size={18} /> Login as Seller
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
            </div>
          ) : (
            <form
              onSubmit={handleAuth}
              className="flex flex-col gap-5"
            >
            <AnimatePresence mode="wait">
              {mode === "register" && (
                <motion.div
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
                </motion.div>
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
              isLoading={isLoading}
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="Google"
                className="w-5 h-5"
              />

              Continue with Google
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
      </motion.div>
    </div>
  );
};

export default Login;