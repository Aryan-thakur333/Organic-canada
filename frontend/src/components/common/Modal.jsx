import { useState } from "react";
import { minLength, validateAuthForm } from "../../utils/validators";

export default function Modal({
  isOpen,
  onClose,
  onSubmit,
  title = "Login or Sign Up",
  isSubmitting = false,
}) {
  const [mode, setMode] = useState("login");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({});

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { isValid, errors: authErrors } = validateAuthForm(formData);
    const nextErrors = { ...authErrors };

    if (mode === "signup") {
      if (!minLength(formData.name || "", 2)) {
        nextErrors.name = "Name must be at least 2 characters";
      }
    }

    if (Object.keys(nextErrors).length > 0 || !isValid) {
      setErrors(nextErrors);
      return;
    }

    const payload =
      mode === "signup"
        ? formData
        : { email: formData.email, password: formData.password };

    if (onSubmit) {
      await onSubmit({ mode, data: payload });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-red-500 transition"
            aria-label="Close authentication modal"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-md py-2 text-sm font-medium transition ${
                mode === "login"
                  ? "bg-white text-black shadow"
                  : "text-gray-600 hover:text-black"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-md py-2 text-sm font-medium transition ${
                mode === "signup"
                  ? "bg-white text-black shadow"
                  : "text-gray-600 hover:text-black"
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {mode === "signup" ? (
            <div>
              <label className="text-sm text-gray-700" htmlFor="name">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your name"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
              />
              {errors.name ? (
                <p className="mt-1 text-xs text-red-500">{errors.name}</p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="text-sm text-gray-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
            />
            {errors.email ? (
              <p className="mt-1 text-xs text-red-500">{errors.email}</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm text-gray-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your password"
              minLength={6}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
            />
            {errors.password ? (
              <p className="mt-1 text-xs text-red-500">{errors.password}</p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-black py-2.5 text-white hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSubmitting
              ? "Please wait..."
              : mode === "login"
                ? "Login"
                : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
