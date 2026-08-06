import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import LoadingSpinner from "../components/common/LoadingSpinner";
import ProtectedRoute from "./ProtectedRoute";
import B2BProtectedRoute from "./B2BProtectedRoute";
import VendorProtectedRoute from "./VendorProtectedRoute";
import POSProtectedRoute from "../components/pos/POSProtectedRoute";
import { RegionProvider, useRegion } from "../contexts/RegionContext";
import { commerceFeatures } from "../config/commerceFeatures";

// Premium Pages
const Home = lazy(() => import("../pages/Home"));
const About = lazy(() => import("../pages/About"));
const Contact = lazy(() => import("../pages/Contact"));
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
const DeliveryTracking = lazy(() => import("../pages/DeliveryTracking"));
const Coupons = lazy(() => import("../pages/Coupons"));
const CustomerSubscriptions = lazy(() => import("../pages/CustomerSubscriptions"));
const CustomerDashboard = lazy(() => import("../pages/CustomerDashboard"));
const MyDownloads = lazy(() => import("../pages/MyDownloads"));
const Addresses = lazy(() => import("../pages/Addresses"));
const B2BQuoteRequest = lazy(() => import("../pages/B2BQuoteRequest"));
const B2BQuoteHistory = lazy(() => import("../pages/B2BQuoteHistory"));
const B2BQuoteDetails = lazy(() => import("../pages/B2BQuoteDetails"));
const B2BQuotePayment = lazy(() => import("../pages/B2BQuotePayment"));
const B2BCompanyRegistration = lazy(() => import("../pages/B2BCompanyRegistration"));
const B2BManageCompany = lazy(() => import("../pages/B2BManageCompany"));
const B2BLogin = lazy(() => import("../pages/B2BLogin"));
const B2BDashboard = lazy(() => import("../pages/B2BDashboard"));
const B2BProducts = lazy(() => import("../pages/B2BProducts"));
const B2BPending = lazy(() => import("../pages/B2BPending"));
const B2BRejected = lazy(() => import("../pages/B2BRejected"));
const B2BSuspended = lazy(() => import("../pages/B2BSuspended"));
const AdminDashboard = lazy(() => import("../pages/AdminDashboard"));
const AdminB2BQuotes = lazy(() => import("../pages/AdminB2BQuotes"));
const AdminSubscriptions = lazy(() => import("../pages/AdminSubscriptions"));

// Vendor Pages
const VendorLogin = lazy(() => import("../pages/vendor/Login"));
const VendorRegister = lazy(() => import("../pages/vendor/Register"));
const VendorOverview = lazy(() => import("../pages/vendor/Overview"));
const VendorProducts = lazy(() => import("../pages/vendor/Products"));
const VendorOrders = lazy(() => import("../pages/vendor/Orders"));
const VendorInventory = lazy(() => import("../pages/vendor/Inventory"));
const VendorEarnings = lazy(() => import("../pages/vendor/Earnings"));
const VendorProfile = lazy(() => import("../pages/vendor/Profile"));
const POSLogin = lazy(() => import("../pages/pos/POSLogin"));
const POSRegisterSelect = lazy(() => import("../pages/pos/POSRegisterSelect"));
const POSRegisterClose = lazy(() => import("../pages/pos/POSRegisterClose"));
const POSDashboard = lazy(() => import("../pages/pos/POSDashboard"));
const POSSell = lazy(() => import("../pages/pos/POSSell"));
const POSOrders = lazy(() => import("../pages/pos/POSOrders"));
const POSCustomers = lazy(() => import("../pages/pos/POSCustomers"));
const POSReturns = lazy(() => import("../pages/pos/POSReturns"));

// New Auth Pages
const AuthGateway = lazy(() => import("../pages/auth/AuthGateway"));
const AuthLogin = lazy(() => import("../pages/auth/AuthLogin"));
const RegisterCustomer = lazy(() => import("../pages/auth/RegisterCustomer"));
const RegisterSeller = lazy(() => import("../pages/auth/RegisterSeller"));
const RegisterB2B = lazy(() => import("../pages/auth/RegisterB2B"));
const ForgotPassword = lazy(() => import("../pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/auth/ResetPassword"));
const VerifyOtp = lazy(() => import("../pages/auth/VerifyOtp"));
import LegacyAuthRedirect from "../components/auth/LegacyAuthRedirect";

function ShopDefaultRedirect() {
  const { defaultRegionSlug, loading } = useRegion();
  if (loading) return <LoadingSpinner fullScreen label="Resolving your region..." />;
  return <Navigate to={`/shop/${defaultRegionSlug}`} replace />;
}

function AppRoutes() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <RegionProvider>
      <Suspense fallback={<LoadingSpinner fullScreen label="Preparing your garden..." />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/shop" element={<ShopDefaultRedirect />} />
          <Route path="/shop/:regionSlug" element={<Listing />} />
          <Route path="/shop/:regionSlug/product/:id" element={<ProductDetails />} />
          <Route path="/listing" element={<Listing />} />
          <Route path="/category/:id" element={<CategoryDetail />} />
          <Route path="/product/:id" element={<ProductDetails />} />
          <Route path="/search" element={<Search />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/coupons" element={<Coupons />} />
          
          {/* New Auth Gateway Routes */}
          <Route path="/auth" element={<AuthGateway />} />
          <Route path="/auth/login" element={<AuthLogin />} />
          <Route path="/auth/register/customer" element={<RegisterCustomer />} />
          <Route path="/auth/register/seller" element={<RegisterSeller />} />
          <Route path="/auth/register/b2b" element={<RegisterB2B />} />
          <Route path="/auth/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/reset-password" element={<ResetPassword />} />
          <Route path="/auth/verify-otp" element={<VerifyOtp />} />

          {/* Legacy Auth Redirects */}
          <Route path="/login" element={<LegacyAuthRedirect to="/auth" />} />
          <Route path="/login/customer" element={<LegacyAuthRedirect to="/auth/login" role="customer" />} />
          <Route path="/register/customer" element={<LegacyAuthRedirect to="/auth/register/customer" />} />
          <Route path="/login/seller" element={<LegacyAuthRedirect to="/auth/login" role="seller" />} />
          <Route path="/register/seller" element={<LegacyAuthRedirect to="/auth/register/seller" />} />
          <Route path="/login/b2b" element={<LegacyAuthRedirect to="/auth/login" role="b2b" />} />
          <Route path="/register/b2b" element={<LegacyAuthRedirect to="/auth/register/b2b" />} />
          
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
            path="/my-downloads"
            element={
              <ProtectedRoute>
                <MyDownloads />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <CustomerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/addresses"
            element={
              <ProtectedRoute>
                <Addresses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/subscriptions"
            element={
              commerceFeatures.subscriptions ? (
                <ProtectedRoute>
                  <CustomerSubscriptions />
                </ProtectedRoute>
              ) : <Navigate to="/dashboard" replace />
            }
          />
          <Route
            path="/dashboard/b2b/quotes"
            element={
              <B2BProtectedRoute>
                <B2BQuoteRequest />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/dashboard/b2b/history"
            element={
              <B2BProtectedRoute>
                <B2BQuoteHistory />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/dashboard/b2b/register"
            element={<Navigate to="/register/b2b" replace />}
          />
          <Route
            path="/dashboard/b2b/manage"
            element={
              <B2BProtectedRoute>
                <B2BManageCompany />
              </B2BProtectedRoute>
            }
          />
          {/* ── B2B Routes ──────────────────────────────────────────── */}
          {/* B2B Login — public (no ProtectedRoute) because user isn't logged in yet */}
          <Route path="/b2b/login" element={<LegacyAuthRedirect to="/auth/login" role="b2b" />} />
          <Route path="/b2b/register-company" element={<LegacyAuthRedirect to="/auth/register/b2b" />} />
          {/* B2B Dashboard — protected, checks company status internally */}
          <Route
            path="/b2b/dashboard"
            element={
              <B2BProtectedRoute>
                <B2BDashboard />
              </B2BProtectedRoute>
            }
          />
          {/* B2B Products — protected, checks company status internally */}
          <Route
            path="/b2b/products"
            element={
              <B2BProtectedRoute>
                <B2BProducts />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/b2b/pending"
            element={
              <ProtectedRoute>
                <B2BPending />
              </ProtectedRoute>
            }
          />
          <Route
            path="/b2b/rejected"
            element={
              <ProtectedRoute>
                <B2BRejected />
              </ProtectedRoute>
            }
          />
          <Route
            path="/b2b/suspended"
            element={
              <ProtectedRoute>
                <B2BSuspended />
              </ProtectedRoute>
            }
          />
          {/* Compatibility storefront B2B routes */}
          <Route
            path="/b2b"
            element={
              <B2BProtectedRoute>
                <B2BManageCompany />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/b2b/manage-company"
            element={
              <B2BProtectedRoute>
                <B2BManageCompany />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/b2b/request-quote"
            element={
              <B2BProtectedRoute>
                <B2BQuoteRequest />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/b2b/quotes"
            element={
              <B2BProtectedRoute>
                <B2BQuoteHistory />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/b2b/quotes/:id"
            element={
              <B2BProtectedRoute>
                <B2BQuoteDetails />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/b2b/quotes/:id/checkout"
            element={
              <B2BProtectedRoute>
                <B2BQuotePayment />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/b2b/quotes/:id/pay"
            element={
              <B2BProtectedRoute>
                <B2BQuotePayment />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/account/b2b-quotes"
            element={
              <B2BProtectedRoute>
                <B2BQuoteHistory />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/account/b2b-quotes/:id"
            element={
              <B2BProtectedRoute>
                <B2BQuoteDetails />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/account/b2b-quotes/:id/checkout"
            element={
              <B2BProtectedRoute>
                <B2BQuotePayment />
              </B2BProtectedRoute>
            }
          />
          <Route
            path="/account/b2b-quotes/:id/pay"
            element={
              <B2BProtectedRoute>
                <B2BQuotePayment />
              </B2BProtectedRoute>
            }
          />
          {/* Vendor Auth Routes */}
          <Route path="/vendor/login" element={<LegacyAuthRedirect to="/auth/login" role="seller" />} />
          <Route path="/vendor/register" element={<LegacyAuthRedirect to="/auth/register/seller" />} />

          {/* POS Routes */}
          <Route path="/pos" element={<Navigate to="/pos/register-select" replace />} />
          <Route path="/pos/login" element={<POSLogin />} />
          <Route path="/pos/register-select" element={<POSProtectedRoute><POSRegisterSelect /></POSProtectedRoute>} />
          <Route path="/pos/register/:registerId" element={<POSProtectedRoute><POSSell /></POSProtectedRoute>} />
          <Route path="/pos/register/:registerId/close" element={<POSProtectedRoute><POSRegisterClose /></POSProtectedRoute>} />
          <Route
            path="/pos/dashboard"
            element={
              <POSProtectedRoute>
                <POSDashboard />
              </POSProtectedRoute>
            }
          />
          <Route
            path="/pos/sell"
            element={
              <POSProtectedRoute>
                <POSSell />
              </POSProtectedRoute>
            }
          />
          <Route
            path="/pos/orders"
            element={
              <POSProtectedRoute>
                <POSOrders />
              </POSProtectedRoute>
            }
          />
          <Route
            path="/pos/customers"
            element={
              <POSProtectedRoute>
                <POSCustomers />
              </POSProtectedRoute>
            }
          />
          <Route
            path="/pos/returns"
            element={
              <POSProtectedRoute>
                <POSReturns />
              </POSProtectedRoute>
            }
          />

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
            path="/vendor/inventory"
            element={<VendorProtectedRoute><VendorInventory /></VendorProtectedRoute>}
          />
          <Route
            path="/vendor/earnings"
            element={<VendorProtectedRoute><VendorEarnings /></VendorProtectedRoute>}
          />
          <Route
            path="/vendor/profile"
            element={<VendorProtectedRoute><VendorProfile /></VendorProtectedRoute>}
          />
          
          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
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
            path="/admin/subscriptions"
            element={
              commerceFeatures.subscriptions ? (
                <ProtectedRoute>
                  <AdminSubscriptions />
                </ProtectedRoute>
              ) : <Navigate to="/admin" replace />
            }
          />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </RegionProvider>
    </BrowserRouter>
  );
}

export default AppRoutes;
