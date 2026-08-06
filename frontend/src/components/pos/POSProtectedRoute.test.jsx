import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import POSProtectedRoute from "./POSProtectedRoute";

const mocks = vi.hoisted(() => ({ runtime: {}, routeRegisterId: "register_ca" }));
vi.mock("../../contexts/usePOS", () => ({ usePOS: () => mocks.runtime }));
vi.mock("react-router-dom", () => ({
  Navigate: ({ to }) => <div>redirect:{to}</div>,
  useLocation: () => ({ pathname: `/pos/register/${mocks.routeRegisterId}` }),
  useParams: () => ({ registerId: mocks.routeRegisterId }),
}));

describe("POSProtectedRoute bootstrap authority", () => {
  beforeEach(() => { mocks.routeRegisterId = "register_ca"; mocks.runtime = { status: "READY_SESSION", session: { register_id: "register_ca" }, refreshBootstrap: vi.fn() }; });
  it("waits for the canonical bootstrap request", () => { mocks.runtime.status = "BOOTSTRAP_LOADING"; render(<POSProtectedRoute><div>sell page</div></POSProtectedRoute>); expect(screen.getByText("Loading POS registers...")).toBeVisible(); });
  it("allows register select with no active session", () => { mocks.runtime = { status: "READY_NO_SESSION", session: null, refreshBootstrap: vi.fn() }; mocks.routeRegisterId = undefined; render(<POSProtectedRoute><div>sell page</div></POSProtectedRoute>); expect(screen.getByText("redirect:/pos/register-select")).toBeVisible(); });
  it("renders only when the bootstrap session matches the route", () => { render(<POSProtectedRoute><div>sell page</div></POSProtectedRoute>); expect(screen.getByText("sell page")).toBeVisible(); });
  it("corrects a stale register URL from bootstrap state", () => { mocks.routeRegisterId = "register_us"; render(<POSProtectedRoute><div>sell page</div></POSProtectedRoute>); expect(screen.getByText("redirect:/pos/register/register_ca")).toBeVisible(); });
});
