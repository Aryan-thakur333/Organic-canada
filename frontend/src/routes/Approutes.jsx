import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import LoadingSpinner from "../components/common/LoadingSpinner";
import ProtectedRoute from "./ProtectedRoute";
import B2BProtectedRoute from "./B2BProtectedRoute";
import VendorProtectedRoute from "./VendorProtectedRoute";

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
const B2BCompanyRegistration = lazy(() => import("../pages/B2BCompanyRegistration"));
const B2BManageCompany = lazy(() => import("../pages/B2BManageCompany"));
const B2BLogin = lazy(() => import("../pages/B2BLogin"));
const B2BDashboard = lazy(() => import("../pages/B2BDashboard"));
const B2BProducts = lazy(() => import("../pages/B2BProducts"));
const B2BPending = lazy(() => import("../pages/B2BPending"));
const B2BRejected = lazy(() => import("../pages/B2BRejected"));
const B2BSuspended = lazy(() => import("../pages/B2BSuspended"));

// Vendor Pages
const VendorLogin = lazy(() => import("../pages/vendor/Login"));
const VendorRegister = lazy(() => import("../pages/vendor/Register"));
const VendorOverview = lazy(() => import("../pages/vendor/Overview"));
const VendorProducts = lazy(() => import("../pages/vendor/Products"));
const VendorOrders = lazy(() => import("../pages/vendor/Orders"));
const VendorInventory = lazy(() => import("../pages/vendor/Inventory"));
const VendorEarnings = lazy(() => import("../pages/vendor/Earnings"));
const VendorProfile = lazy(() => import("../pages/vendor/Profile"));

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
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/shop" element={<Listing />} />
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
              <ProtectedRoute>
                <CustomerSubscriptions />
              </ProtectedRoute>
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
            element={
              <ProtectedRoute>
                <B2BCompanyRegistration />
              </ProtectedRoute>
            }
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
          <Route path="/b2b/login" element={<B2BLogin />} />
          <Route path="/b2b/register-company" element={<B2BCompanyRegistration />} />
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
                <B2BQuoteHistory />
              </B2BProtectedRoute>
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

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default AppRoutes;
