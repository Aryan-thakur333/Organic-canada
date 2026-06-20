import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import LoadingSpinner from "../components/common/LoadingSpinner";
import ProtectedRoute from "./ProtectedRoute";
import VendorProtectedRoute from "./VendorProtectedRoute";

// Premium Pages
const Home = lazy(() => import("../pages/Home"));
const Cart = lazy(() => import("../pages/Cart"));
const ProductDetails = lazy(() => import("../pages/ProductDetails"));
const Checkout = lazy(() => import("../pages/Checkout"));
const Listing = lazy(() => import("../pages/Listing"));
const Login = lazy(() => import("../pages/Login"));
const Wishlist = lazy(() => import("../pages/Wishlist"));
const Orders = lazy(() => import("../pages/Orders"));
const Profile = lazy(() => import("../pages/Profile"));
const Search = lazy(() => import("../pages/Search"));
const OrderSuccess = lazy(() => import("../pages/OrderSuccess"));
const CategoryDetail = lazy(() => import("../pages/CategoryDetail"));
const AdminDashboard = lazy(() => import("../pages/AdminDashboard"));
const DeliveryTracking = lazy(() => import("../pages/DeliveryTracking"));
const Coupons = lazy(() => import("../pages/Coupons"));
const CustomerSubscriptions = lazy(() => import("../pages/CustomerSubscriptions"));
const AdminSubscriptions = lazy(() => import("../pages/AdminSubscriptions"));
const B2BQuoteRequest = lazy(() => import("../pages/B2BQuoteRequest"));
const B2BQuoteHistory = lazy(() => import("../pages/B2BQuoteHistory"));
const AdminB2BQuotes = lazy(() => import("../pages/AdminB2BQuotes"));
const B2BCompanyRegistration = lazy(() => import("../pages/B2BCompanyRegistration"));
const B2BManageCompany = lazy(() => import("../pages/B2BManageCompany"));
const AdminB2BCompanies = lazy(() => import("../pages/AdminB2BCompanies"));

// Vendor Pages
const VendorLogin = lazy(() => import("../pages/vendor/Login"));
const VendorRegister = lazy(() => import("../pages/vendor/Register"));
const VendorOverview = lazy(() => import("../pages/vendor/Overview"));
const VendorProducts = lazy(() => import("../pages/vendor/Products"));
const VendorOrders = lazy(() => import("../pages/vendor/Orders"));

function AppRoutes() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<LoadingSpinner fullScreen label="Preparing your garden..." />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/listing" element={<Listing />} />
          <Route path="/category/:id" element={<CategoryDetail />} />
          <Route path="/product/:id" element={<ProductDetails />} />
          <Route path="/search" element={<Search />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/coupons" element={<Coupons />} />
          <Route path="/login" element={<Login />} />
          
          {/* Protected Routes */}
          <Route
            path="/checkout"
            element={
              <ProtectedRoute>
                <Checkout />
              </ProtectedRoute>
            }
          />
          <Route
            path="/order-success"
            element={
              <ProtectedRoute>
                <OrderSuccess />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wishlist"
            element={
              <ProtectedRoute>
                <Wishlist />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/track/:id"
            element={
              <ProtectedRoute>
                <DeliveryTracking />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/subscriptions"
            element={
              <ProtectedRoute>
                <CustomerSubscriptions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/b2b/quotes"
            element={
              <ProtectedRoute>
                <B2BQuoteRequest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/b2b/history"
            element={
              <ProtectedRoute>
                <B2BQuoteHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/b2b/register"
            element={
              <ProtectedRoute>
                <B2BCompanyRegistration />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/b2b/manage"
            element={
              <ProtectedRoute>
                <B2BManageCompany />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/subscriptions"
            element={
              <ProtectedRoute>
                <AdminSubscriptions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/b2b-quotes"
            element={
              <ProtectedRoute>
                <AdminB2BQuotes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/b2b/companies"
            element={
              <ProtectedRoute>
                <AdminB2BCompanies />
              </ProtectedRoute>
            }
          />
          {/* Vendor Auth Routes */}
          <Route path="/vendor/login" element={<VendorLogin />} />
          <Route path="/vendor/register" element={<VendorRegister />} />

          {/* Vendor Dashboard Protected Routes */}
          <Route
            path="/vendor/dashboard"
            element={
              <VendorProtectedRoute>
                <VendorOverview />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="/vendor/products"
            element={
              <VendorProtectedRoute>
                <VendorProducts />
              </VendorProtectedRoute>
            }
          />
          <Route
            path="/vendor/orders"
            element={
              <VendorProtectedRoute>
                <VendorOrders />
              </VendorProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default AppRoutes;
