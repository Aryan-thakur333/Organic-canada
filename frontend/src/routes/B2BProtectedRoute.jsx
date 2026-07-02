import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { b2bApi } from "../services/b2bApi";

const B2B_SESSION_TIMEOUT_MS = 10_000;

function getStatusPath(status) {
  if (status === "pending") return "/b2b/pending";
  if (status === "rejected") return "/b2b/rejected";
  if (status === "suspended") return "/b2b/suspended";
  return "/b2b/register-company";
}

function isCanceled(error) {
  return Boolean(
    error?.name === "AbortError" ||
    error?.name === "CanceledError" ||
    error?.code === "ERR_CANCELED" ||
    error?.message === "canceled" ||
    String(error?.message || "").toLowerCase().includes("aborted")
  );
}

function getAuthFailurePath(error) {
  const status = error?.response?.status;
  if (status === 401 || status === 403 || error?.code === "B2B_SESSION_TIMEOUT") {
    return "/b2b/login";
  }
  return "/b2b/register-company";
}

function withTimeout(promise, controller) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const error = new Error("B2B session verification timed out.");
      error.code = "B2B_SESSION_TIMEOUT";
      controller.abort();
      reject(error);
    }, B2B_SESSION_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

export default function B2BProtectedRoute({ children }) {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const authResolved = useSelector((state) => state.auth.authResolved);
  const location = useLocation();
  const [state, setState] = useState({
    loading: true,
    allowed: false,
    redirectTo: null,
  });

  useEffect(() => {
    if (!authResolved) {
      setState({ loading: true, allowed: false, redirectTo: null });
      return undefined;
    }

    if (!isAuthenticated) {
      setState({ loading: false, allowed: false, redirectTo: "/b2b/login" });
      return undefined;
    }

    const controller = new AbortController();
    let mounted = true;

    const verifyB2BSession = async () => {
      setState({ loading: true, allowed: false, redirectTo: null });

      try {
        const session = await withTimeout(
          b2bApi.hydrateB2BSession({
            signal: controller.signal,
            forceRefresh: true,
          }),
          controller
        );

        if (!mounted) return;

        if (session?.hasApprovedB2BAccess) {
          setState({ loading: false, allowed: true, redirectTo: null });
          return;
        }

        setState({
          loading: false,
          allowed: false,
          redirectTo: getStatusPath(session?.status),
        });
      } catch (error) {
        if (!mounted) return;

        if (isCanceled(error) && error?.code !== "B2B_SESSION_TIMEOUT") {
          setState({ loading: false, allowed: false, redirectTo: "/b2b/login" });
          return;
        }

        console.warn("[B2BProtectedRoute] Session verification failed:", error?.message || error);
        setState({
          loading: false,
          allowed: false,
          redirectTo: getAuthFailurePath(error),
        });
      }
    };

    verifyB2BSession();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authResolved, isAuthenticated]);

  if (!authResolved || state.loading) {
    return <LoadingSpinner fullScreen label="Checking your session..." />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={state.redirectTo || "/b2b/login"}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (!state.allowed) {
    return (
      <Navigate
        to={state.redirectTo || "/b2b/register-company"}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return children;
}
