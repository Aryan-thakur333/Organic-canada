import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector, useStore } from "react-redux";
import {
  addOrder,
  clearOrderError,
  setOrderError,
  setOrderLoading,
  setOrders,
  updateOrderStatus,
} from "../../redux/orderSlice";
import { updateUserProfile } from "../../redux/userSlice";
import { cancelOrder } from "../../services/api";
import { cancelCheckoutOrder, listCheckoutOrders } from "../../services/checkoutApi";
import useToast from "../../hooks/useToast";
import useAuth from "../../hooks/useAuth";
import Navbar from "../Navbar";
import Footer from "../Footer";
import MobileNav from "../MobileNav";
import { ROUTES } from "../../utils/constants";

export default function Profile() {
  const dispatch = useDispatch();
  const store = useStore();
  const { showToast } = useToast();
  const { signOut } = useAuth();
  const profileData = useSelector((state) => state.user.profile);
  const orders = useSelector((state) => state.order.orders);
  const ordersLoading = useSelector((state) => state.order.loading);
  const ordersError = useSelector((state) => state.order.error);
  const [profile, setProfile] = useState(() => ({
    name: profileData?.name ?? "",
    email: profileData?.email ?? "",
    phone: profileData?.phone ?? "",
    avatar: profileData?.avatar ?? "",
  }));
  const [wishlist] = useState(["Classic Cheeseburger", "Margherita Pizza"]);
  const [savedAddresses] = useState([
    "Home - Sector 12, Mumbai",
    "Office - IT Park, Pune",
  ]);
  const [savedPayments] = useState(["UPI - aryan@upi", "Card ending 1024"]);

  useEffect(() => {
    const tid = window.setTimeout(() => {
      setProfile({
        name: profileData?.name ?? "",
        email: profileData?.email ?? "",
        phone: profileData?.phone ?? "",
        avatar: profileData?.avatar ?? "",
      });
    }, 0);
    return () => window.clearTimeout(tid);
  }, [profileData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    dispatch(
      updateUserProfile({
        name: profile.name.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
      })
    );
    showToast("Profile saved", "success");
  };

  useEffect(() => {
    const digits = String(profile.phone || "").replace(/\D/g, "");
    if (digits.length < 10) return undefined;

    let cancelled = false;
    (async () => {
      try {
        dispatch(setOrderLoading(true));
        dispatch(clearOrderError());
        const { orders: remote } = await listCheckoutOrders({ phone: digits });
        if (cancelled) return;
        const local = store.getState().order.orders;
        const byId = new Map();
        for (const o of remote) {
          if (o?.id) byId.set(o.id, o);
        }
        for (const o of local) {
          if (o?.id && !byId.has(o.id)) byId.set(o.id, o);
        }
        const merged = [...byId.values()].sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
        dispatch(setOrders(merged));
      } catch (e) {
        if (!cancelled) {
          dispatch(setOrderError(e?.message || "Failed to load orders"));
        }
      } finally {
        if (!cancelled) dispatch(setOrderLoading(false));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile.phone, dispatch, store]);

  useEffect(() => {
    if (orders.length === 0) return undefined;

    const interval = setInterval(() => {
      const active = orders.find(
        (order) =>
          order.status === "confirmed" ||
          order.status === "paid" ||
          order.status === "preparing" ||
          order.status === "out_for_delivery"
      );
      if (!active) return;

      const nextStatus =
        active.status === "confirmed" || active.status === "paid"
          ? "preparing"
          : active.status === "preparing"
            ? "out_for_delivery"
            : "delivered";
      dispatch(updateOrderStatus({ id: active.id, status: nextStatus }));
    }, 15000);

    return () => clearInterval(interval);
  }, [orders, dispatch]);

  const canReorder = useMemo(
    () => orders.filter((order) => order.status === "delivered"),
    [orders]
  );

  const handleCancelOrder = async (orderId) => {
    try {
      if (String(orderId).startsWith("ord_")) {
        await cancelCheckoutOrder(orderId);
      } else {
        const response = await cancelOrder(orderId);
        if (!response?.success) throw new Error("Cancel failed");
      }
      dispatch(updateOrderStatus({ id: orderId, status: "cancelled" }));
      showToast("Order cancelled", "warning");
    } catch {
      showToast("Unable to cancel this order", "error");
    }
  };

  const handleReorder = (order) => {
    dispatch(
      addOrder({
        ...order,
        id: `reorder-${Date.now()}`,
        status: "confirmed",
        createdAt: new Date().toISOString(),
      })
    );
    showToast("Reorder created", "success");
  };

  const initials =
    profile.name?.trim()?.charAt(0)?.toUpperCase() ||
    profile.email?.trim()?.charAt(0)?.toUpperCase() ||
    "?";

  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100vh-8rem)] max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-28 md:pb-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              My profile
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage your details, addresses, and orders.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={ROUTES.HOME}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Continue shopping
            </Link>
            <button
              type="button"
              onClick={() => {
                signOut();
                showToast("Signed out", "success");
              }}
              className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 sm:hidden"
            >
              Log out
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSaveProfile}
          className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-gray-900">
            Account details
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Updates are stored in this session (name, email, phone).
          </p>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex shrink-0 justify-center sm:justify-start">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt=""
                  className="h-20 w-20 rounded-full border border-gray-200 object-cover"
                />
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-2xl font-semibold text-gray-600"
                  aria-hidden
                >
                  {initials}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Name
                </label>
                <input
                  id="profile-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={profile.name}
                  onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email
                </label>
                <input
                  id="profile-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={profile.email}
                  onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-phone"
                  className="block text-sm font-medium text-gray-700"
                >
                  Phone
                </label>
                <input
                  id="profile-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="Phone number"
                  value={profile.phone}
                  onChange={handleChange}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition"
              >
                Save profile
              </button>
            </div>
          </div>
        </form>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900">Saved addresses</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              {savedAddresses.map((address) => (
                <li key={address}>{address}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900">Payment methods</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              {savedPayments.map((payment) => (
                <li key={payment}>{payment}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Wishlist</h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            {wishlist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Order history</h2>
          <p className="mt-1 text-xs text-gray-500">
            Orders placed with your profile phone are loaded from the checkout server.
          </p>
          {ordersError ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {ordersError}
            </p>
          ) : null}
          {ordersLoading ? (
            <p className="mt-3 text-sm text-gray-600">Loading orders…</p>
          ) : orders.length === 0 ? (
            <p className="mt-3 text-sm text-gray-600">No orders yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {orders.map((order) => (
                <article
                  key={order.id}
                  className="rounded-lg border border-gray-100 bg-gray-50/50 p-4"
                >
                  <p className="text-sm font-medium text-gray-900">
                    Order ID: {order.id}
                  </p>
                  <p className="text-sm text-gray-600">
                    Status: {order.status || "confirmed"}
                  </p>
                  <p className="text-sm text-gray-600">
                    Total: ${Number(order.total ?? 0).toFixed(2)}
                    {order.fulfillment ? (
                      <span className="text-gray-500"> · {order.fulfillment}</span>
                    ) : null}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(order.status === "confirmed" ||
                      order.status === "paid" ||
                      order.status === "preparing") && (
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(order.id)}
                        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    )}
                    {order.status === "delivered" && (
                      <button
                        type="button"
                        onClick={() => handleReorder(order)}
                        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-100"
                      >
                        Reorder
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {canReorder.length > 0 ? (
            <p className="mt-3 text-xs text-gray-500">
              Delivered orders can be reordered instantly.
            </p>
          ) : null}
        </div>
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
