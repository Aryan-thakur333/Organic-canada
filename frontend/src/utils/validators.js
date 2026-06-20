export function isValidEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPhone(phone = "") {
  return /^\d{10}$/.test(phone.trim());
}

export function isValidPincode(pincode = "") {
  return /^\d{5,6}$/.test(pincode.trim());
}

export function minLength(value = "", length = 1) {
  return value.trim().length >= length;
}

export function isRequired(value) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

export function validateAuthForm({ email = "", password = "" }) {
  const errors = {};

  if (!isRequired(email)) {
    errors.email = "Email is required";
  } else if (!isValidEmail(email)) {
    errors.email = "Enter a valid email address";
  }

  if (!isRequired(password)) {
    errors.password = "Password is required";
  } else if (!minLength(password, 6)) {
    errors.password = "Password must be at least 6 characters";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
