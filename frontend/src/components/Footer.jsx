import { Link } from "react-router-dom";
import { BRAND } from "../config/branding";
import { ROUTES } from "../utils/constants";

export default function Footer() {
  const quickLinks = [
    { label: "All products", to: "/listing" },
    { label: "Wishlist", to: ROUTES.WISHLIST },
    { label: "About", to: "/about" },
    { label: "Contact", to: "/contact" },
    { label: "FAQ", to: "/faq" },
  ];
  const deliveryAreas = ["Toronto", "Vancouver", "Calgary", "Montreal", "Ottawa"];
  const socialLinks = ["Instagram", "Facebook", "Twitter", "LinkedIn"];

  return (
    <footer className="mt-10 bg-organic-primary px-6 py-12 text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 className="font-logo text-2xl font-bold">{BRAND.name}</h2>
          <p className="mt-3 text-sm leading-6 text-white/85">
            {BRAND.tagline}. Fast delivery, curated groceries, and local favourites — one
            simple checkout.
          </p>
          <p className="mt-4 text-sm text-white/70">
            Serving neighbourhoods across Canada.
          </p>
          <p className="text-sm text-white/70">support@{BRAND.domain.toLowerCase()}</p>
        </div>

        <div className="lg:col-span-3">
          <h3 className="text-lg font-semibold">Quick links</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            {quickLinks.map((link) => (
              <li key={link.label}>
                <Link to={link.to} className="transition hover:text-organic-terracotta">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-4">
          <h3 className="text-lg font-semibold">Delivery areas</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            {deliveryAreas.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>

          <h3 className="mt-8 text-lg font-semibold">Connect</h3>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/85">
            {socialLinks.map((social) => (
              <li key={social}>
                <a href="#" className="transition hover:text-organic-terracotta">
                  {social}
                </a>
              </li>
            ))}
          </ul>

          <h3 className="mt-6 text-lg font-semibold">Download app</h3>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a
              href="#"
              className="rounded-xl border border-white/30 px-4 py-2 text-center text-sm transition hover:border-organic-terracotta hover:text-organic-terracotta"
            >
              Google Play
            </a>
            <a
              href="#"
              className="rounded-xl border border-white/30 px-4 py-2 text-center text-sm transition hover:border-organic-terracotta hover:text-organic-terracotta"
            >
              App Store
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-7xl border-t border-white/20 pt-6 text-center text-xs text-white/60">
        © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
      </div>
    </footer>
  );
}
