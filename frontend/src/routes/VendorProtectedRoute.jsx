import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { vendorApi } from "../services/vendorApi";
import { setProfile, logout, authResolved } from "../redux/vendorSlice";
import LoadingSpinner from "../components/common/LoadingSpinner";

export default function VendorProtectedRoute({ children }) {
  const { isAuthenticated, token, profile, authResolved: isResolved } = useSelector((state) => state.vendor);
  const dispatch = useDispatch();
  const location = useLocation();

  useEffect(() => {
    const checkSession = async () => {
      if (token && !profile) {
        try {
          const res = await vendorApi.getProfile();
          dispatch(setProfile(res.vendor));
        } catch (err) {
          console.error("Vendor session restoration failed:", err);
          dispatch(logout());
        }
      } else {
        dispatch(authResolved());
      }
    };

    checkSession();
  }, [token, profile, dispatch]);

  if (!isResolved && token && !profile) {
    return <LoadingSpinner fullScreen label="Checking vendor authorization…" />;
  }

  if (!token || (!profile && isResolved)) {
    return (
      <Navigate
        to="/vendor/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return children;
}
