import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useState } from "react";
import { BRAND } from "../../config/branding";
import { ROUTES } from "../../utils/constants";

const DELIVERY_LINE = "Delivery in 15 minutes";
const ADDRESS_PREVIEW = "Sant Pura, Industrial Area…";

const NAV_GROUPS = [
  {
    label: "Shop pages",
    items: [
      { label: "All products", to: "/listing" },
      { label: "Search", to: ROUTES.SEARCH },
      { label: "Wishlist", to: ROUTES.WISHLIST },
      { label: "Cart", to: ROUTES.CART },
    ],
  },
  {
    label: "Profile",
    items: [
      { label: "My profile", to: ROUTES.PROFILE },
      { label: "My orders", to: "/orders" },
      { label: "Login", to: ROUTES.LOGIN },
    ],
  },
  {
    label: "Pick up & drop",
    items: [
      { label: "Packages", to: "/packages" },
      { label: "Jobs", to: "/jobs" },
    ],
  },
  {
    label: "Extra page",
    items: [
      { label: "FAQ", to: "/faq" },
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
    ],
  },
];

export default function OrganicHeader({
  onOpenAddress,
  onOpenAuth,
  isAuthenticated,
  onSignOut,
}) {
  const { items } = useSelector((state) => state.cart);
  const wishlistItems = useSelector((state) => state.wishlist.items);
  const navigate = useNavigate();
  const [openMenu, setOpenMenu] = useState(null);

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const wishlistCount = wishlistItems.length;

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/90 bg-organic-headerBg shadow-[0_1px_0_rgba(255,255,255,0.85)]">
      <div className="container flex flex-wrap items-center justify-between gap-4 py-3 md:flex-nowrap md:py-4">
        <Link to="/" className="flex shrink-0 items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-organic-primary text-white shadow-sm"
            aria-hidden
          >
            <LeafIcon className="h-6 w-6" />
          </span>
          <span className="leading-tight">
            <span className="font-logo text-xl font-bold tracking-tight text-organic-primary md:text-2xl">
              {BRAND.name}
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-gray-600 md:text-[11px]">
              {BRAND.domain}
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => onOpenAddress?.()}
          className="hidden max-w-[220px] flex-1 text-left text-sm text-gray-800 transition hover:text-organic-primary lg:block xl:max-w-xs"
        >
          <span className="flex items-start gap-2">
            <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <span>
              <span className="block font-bold text-gray-900">
                {DELIVERY_LINE}
              </span>
              <span className="text-xs font-medium text-gray-600">{ADDRESS_PREVIEW}</span>
            </span>
          </span>
        </button>

        <nav
          className="order-last hidden w-full items-center justify-center gap-1 lg:order-none lg:flex lg:w-auto"
          onMouseLeave={() => setOpenMenu(null)}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="relative">
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-900 transition hover:bg-white/80 hover:text-organic-primary lg:px-3 lg:text-xs"
                onMouseEnter={() => setOpenMenu(group.label)}
                onFocus={() => setOpenMenu(group.label)}
                aria-expanded={openMenu === group.label}
                aria-haspopup="true"
              >
                {group.label}
                <ChevronDown />
              </button>
              {openMenu === group.label ? (
                <div
                  className="absolute left-0 top-full z-50 min-w-[200px] pt-1"
                  onMouseEnter={() => setOpenMenu(group.label)}
                >
                  <div className="rounded-2xl border border-stone-200 bg-white py-2 shadow-xl ring-1 ring-black/5">
                    {group.items.map((item) => (
                      <Link
                        key={item.to + item.label}
                        to={item.to}
                        className="block px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-organic-headerBg hover:text-organic-primary"
                        onClick={() => setOpenMenu(null)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to={ROUTES.SEARCH}
            className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-organic-skyRing bg-white text-organic-primary shadow-md transition hover:border-organic-teal/50 hover:shadow-lg"
            aria-label="Search"
          >
            <SearchIcon />
          </Link>

          <Link
            to={ROUTES.WISHLIST}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-organic-skyRing bg-white text-organic-primary shadow-md transition hover:border-organic-teal/50 hover:shadow-lg"
            aria-label="Wishlist"
          >
            <WishlistNavIcon />
            {wishlistCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-organic-primary px-1 text-[10px] font-bold text-white">
                {wishlistCount > 99 ? "99+" : wishlistCount}
              </span>
            ) : null}
          </Link>

          <Link
            to={ROUTES.CART}
            className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-organic-skyRing bg-white text-organic-primary shadow-md transition hover:border-organic-teal/50 hover:shadow-lg"
            aria-label="Cart"
          >
            <CartIcon />
            {totalCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-organic-terracotta px-1 text-[10px] font-bold text-white">
                {totalCount > 99 ? "99+" : totalCount}
              </span>
            ) : null}
          </Link>

          {isAuthenticated ? (
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-full bg-organic-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-organic-brownMuted"
            >
              Sign out
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenAuth?.()}
                className="hidden rounded-full border-2 border-organic-primary/35 bg-white px-3 py-2 text-xs font-bold text-organic-primary shadow-sm transition hover:border-organic-primary hover:bg-organic-headerBg sm:inline"
              >
                Phone OTP
              </button>
              <button
                type="button"
                onClick={() => navigate(ROUTES.LOGIN)}
                className="rounded-full bg-organic-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-organic-brownMuted"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onOpenAddress?.()}
        className="container -mt-1 mb-2 flex w-full items-start gap-2 border-t border-stone-200/80 bg-organic-headerBg pt-2.5 text-left text-xs text-gray-800 lg:hidden"
      >
        <PinIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
        <span>
          <span className="font-bold text-gray-900">{DELIVERY_LINE}</span>
          <span className="block text-[11px] font-medium text-gray-600">{ADDRESS_PREVIEW}</span>
        </span>
      </button>
    </header>
  );
}

function ChevronDown() {
  return (
    <svg className="h-3.5 w-3.5 text-organic-primary" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
    </svg>
  );
}

function WishlistNavIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l3-7H5.4M7 13L5.4 5M7 13l-1.293 2.293c-.63.63-.184 1.707.707 1.707H19M17 17a1 1 0 102 0 1 1 0 00-2 0zM9 17a1 1 0 102 0 1 1 0 00-2 0z" />
    </svg>
  );
}

function PinIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z" />
    </svg>
  );
}

function LeafIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 008 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5a6.22 6.22 0 002.89 3.67A18 42 42 0 0117 8z" />
    </svg>
  );
}
