import { useEffect, useState } from "react";
import {
  isRequired,
  isValidPhone,
  isValidPincode,
} from "../../utils/validators";

export default function AddressModal({
  isOpen,
  onClose,
  onSave,
  title = "Add Delivery Location",
  isSubmitting = false,
}) {
  const [address, setAddress] = useState({
    label: "",
    fullName: "",
    phone: "",
    street: "",
    city: "",
    state: "",
    pincode: "",
    instructions: "",
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return undefined;
    const tid = window.setTimeout(() => setErrors({}), 0);
    return () => window.clearTimeout(tid);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setAddress((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateAddress = () => {
    const nextErrors = {};
    if (!isRequired(address.label)) nextErrors.label = "Address label is required";
    if (!isRequired(address.fullName)) nextErrors.fullName = "Full name is required";
    if (!isValidPhone(address.phone)) nextErrors.phone = "Enter a valid 10-digit phone";
    if (!isRequired(address.street)) nextErrors.street = "Street address is required";
    if (!isRequired(address.city)) nextErrors.city = "City is required";
    if (!isRequired(address.state)) nextErrors.state = "State is required";
    if (!isValidPincode(address.pincode)) {
      nextErrors.pincode = "Enter a valid pincode";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateAddress()) return;
    if (onSave) {
      await onSave(address);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-red-500 transition"
            aria-label="Close address modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="px-5 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="label" className="text-sm text-gray-700">
                Address Label
              </label>
              <input
                id="label"
                name="label"
                type="text"
                placeholder="Home / Work"
                value={address.label}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
              />
              {errors.label ? (
                <p className="mt-1 text-xs text-red-500">{errors.label}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="fullName" className="text-sm text-gray-700">
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Receiver name"
                value={address.fullName}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
              />
              {errors.fullName ? (
                <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="phone" className="text-sm text-gray-700">
                Phone Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="10-digit mobile number"
                value={address.phone}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
              />
              {errors.phone ? (
                <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="pincode" className="text-sm text-gray-700">
                Pincode
              </label>
              <input
                id="pincode"
                name="pincode"
                type="text"
                placeholder="Enter pincode"
                value={address.pincode}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
              />
              {errors.pincode ? (
                <p className="mt-1 text-xs text-red-500">{errors.pincode}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="street" className="text-sm text-gray-700">
              Street Address
            </label>
            <textarea
              id="street"
              name="street"
              rows={3}
              placeholder="House no, building, street, landmark"
              value={address.street}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
            />
            {errors.street ? (
              <p className="mt-1 text-xs text-red-500">{errors.street}</p>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="city" className="text-sm text-gray-700">
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                placeholder="Enter city"
                value={address.city}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
              />
              {errors.city ? (
                <p className="mt-1 text-xs text-red-500">{errors.city}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="state" className="text-sm text-gray-700">
                State
              </label>
              <input
                id="state"
                name="state"
                type="text"
                placeholder="Enter state"
                value={address.state}
                onChange={handleChange}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
              />
              {errors.state ? (
                <p className="mt-1 text-xs text-red-500">{errors.state}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="instructions" className="text-sm text-gray-700">
              Delivery Instructions (optional)
            </label>
            <textarea
              id="instructions"
              name="instructions"
              rows={2}
              placeholder="E.g., Ring the bell once"
              value={address.instructions}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-red-500"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : "Save Address"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
