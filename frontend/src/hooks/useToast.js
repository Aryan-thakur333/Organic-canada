import toast from "react-hot-toast";

const TOAST_DURATION = 2500;

export default function useToast() {
  const showToast = (message, type = "info", duration = TOAST_DURATION) => {
    if (type === "success") return toast.success(message, { duration, id: message });
    if (type === "error") return toast.error(message, { duration, id: message });
    if (type === "warning")
      return toast(message, {
        duration,
        id: message,
        icon: "⚠️",
        style: { background: "#f59e0b", color: "#111827" },
      });
    return toast(message, { duration, id: message });
  };

  return {
    showToast,
    dismiss: toast.dismiss,
    promise: toast.promise,
  };
}
