import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { vendorApi } from "../services/vendorApi";
import { vendorAuth } from "../services/vendorAuth";
import { setProfile, logout, authResolved } from "../redux/vendorSlice";
import LoadingSpinner from "../components/common/LoadingSpinner";

export default function VendorProtectedRoute({ children }) {
  const { token, profile, authResolved: isResolved } = useSelector((state) => state.vendor);
  const dispatch = useDispatch();
  const location = useLocation();
  const activeToken = token || vendorAuth.getToken();

  useEffect(() => {
    const checkSession = async () => {
      const currentToken = token || vendorAuth.getToken();

      if (currentToken && !profile) {
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

  if (!isResolved && activeToken && !profile) {
    return <LoadingSpinner fullScreen label="Checking vendor authorization..." />;
  }

  if (!activeToken || (!profile && isResolved)) {
    return (
      <Navigate
        to="/login/seller"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return children;
}
