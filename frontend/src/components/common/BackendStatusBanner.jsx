import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { checkBackendHealth } from "../../services/apiClient";

export default function BackendStatusBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = (event) => setOffline(event.detail?.online === false);
    window.addEventListener("organic-backend-status", update);

    const check = () => checkBackendHealth().catch(() => undefined);
    check();
    const timer = window.setInterval(check, 15000);

    return () => {
      window.removeEventListener("organic-backend-status", update);
      window.clearInterval(timer);
    };
  }, []);

  if (!offline) return null;

  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[1000] flex items-center justify-center gap-2 bg-red-700 px-4 py-2 text-sm font-bold text-white shadow-lg">
      <WifiOff size={16} />
      Backend Offline
    </div>
  );
}
