import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import POSRegisterSelect from "./POSRegisterSelect";

const mocks = vi.hoisted(() => ({ runtime: {}, navigate: vi.fn(), openRegister: vi.fn(), closeRegister: vi.fn(), toastError: vi.fn() }));
vi.mock("../../contexts/usePOS", () => ({ usePOS: () => mocks.runtime }));
vi.mock("react-router-dom", () => ({ useLocation: () => ({ state: null }), useNavigate: () => mocks.navigate }));
vi.mock("react-hot-toast", () => ({ default: { error: mocks.toastError } }));
vi.mock("../../services/posApi", () => ({ posApi: { openRegister: mocks.openRegister, closeRegister: mocks.closeRegister } }));

const canada = { id: "register_ca", name: "Canada POS Register", code: "CA-POS-01", currency_code: "cad", status: "active" };
const usa = { id: "register_us", name: "USA POS Register", code: "US-POS-01", currency_code: "usd", status: "active" };
describe("POS register selection bootstrap authority", () => {
  beforeEach(() => { mocks.navigate.mockReset(); mocks.openRegister.mockReset(); mocks.closeRegister.mockReset(); mocks.runtime = { status: "READY_NO_SESSION", registers: [canada, usa], session: null, activeRegister: null, refreshBootstrap: vi.fn().mockResolvedValue({ session: null }), clearRuntime: vi.fn() }; });
  it("renders only the bootstrap assignment list", () => { mocks.runtime.registers = [usa]; render(<POSRegisterSelect />); expect(screen.getByRole("button", { name: /USA POS Register/i })).toBeVisible(); expect(screen.queryByText(/Canada POS Register/i)).not.toBeInTheDocument(); });
  it("uses refreshBootstrap for Refresh assignments", () => { render(<POSRegisterSelect />); fireEvent.click(screen.getByRole("button", { name: "Refresh assignments" })); expect(mocks.runtime.refreshBootstrap).toHaveBeenCalledTimes(1); });
  it("does not show an empty assignment message while bootstrap is loading", () => { mocks.runtime = { ...mocks.runtime, status: "BOOTSTRAP_LOADING", registers: [] }; render(<POSRegisterSelect />); expect(screen.getByText("Loading POS registers...")).toBeVisible(); expect(screen.queryByText(/No active register assignments/i)).not.toBeInTheDocument(); });
  it("marks the active bootstrap session as resumable", () => { mocks.runtime = { ...mocks.runtime, status: "READY_SESSION", session: { id: "session_us", register_id: usa.id, expected_cash_minor: 0 }, activeRegister: usa }; render(<POSRegisterSelect />); expect(screen.getByText("CURRENT SESSION")).toBeVisible(); expect(screen.getByText("Resume Register")).toBeVisible(); });
});
