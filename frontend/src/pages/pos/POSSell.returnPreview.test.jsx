import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import POSSell from "./POSSell";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  navigate: vi.fn(),
  previewReturn: vi.fn(),
  runtime: { status: "READY_SESSION", operator: { id: "operator_1" }, session: { id: "session_1", operator_id: "operator_1", register_id: "register_us" }, activeRegister: { id: "register_us", currency_code: "usd" } },
  state: {
    pos: {
      staff: { id: "operator_1" },
      register: { id: "register_us", currency_code: "usd" },
      session: { id: "session_1", operator_id: "operator_1", register_id: "register_us" },
      items: [],
      customer: null,
      paymentMethod: "CASH",
      discountCode: "",
      note: "",
      lastReceipt: null,
      lastOrder: null,
    },
  },
}));

vi.mock("react-redux", () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (selector) => selector(mocks.state),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ registerId: "register_us" }),
}));
vi.mock("../../contexts/usePOS", () => ({ usePOS: () => mocks.runtime }));
vi.mock("../../components/pos/POSShell", () => ({ default: ({ children }) => <>{children}</> }));
vi.mock("../../components/pos/POSBarcodeInput", () => ({ default: ({ loading }) => <div data-loading={String(loading)}>barcode input</div> }));
vi.mock("../../components/pos/POSProductSearch", () => ({ default: () => null }));
vi.mock("../../components/pos/POSCart", () => ({ default: () => null }));
vi.mock("../../components/pos/POSCustomerSelector", () => ({ default: () => null }));
vi.mock("../../components/pos/POSPaymentPanel", () => ({ default: () => null }));
vi.mock("../../components/pos/POSReceipt", () => ({ default: () => null }));
vi.mock("../../components/pos/BarcodeScannerModal", () => ({ default: () => null }));
vi.mock("../../services/posApi", () => ({
  getPosRegister: () => null,
  getPosStaff: () => null,
  posApi: { previewReturn: mocks.previewReturn, getCurrentSession: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../../services/posOfflineDrafts", () => ({
  listPosOfflineDrafts: () => [],
  savePosOfflineDraft: vi.fn(),
  validateAndUploadPosOfflineDraft: vi.fn(),
}));

describe("clean POS sell route", () => {
  it("never issues a return-preview request", () => {
    render(<POSSell />);
    expect(screen.getByText("Register session ready")).toBeVisible();
    expect(mocks.previewReturn).not.toHaveBeenCalled();
  });
  it("blocks scanning when the selected register has no valid session", () => {
    const validSession = mocks.state.pos.session;
    const validRuntime = mocks.runtime;
    mocks.state.pos.session = null;
    mocks.runtime = { ...mocks.runtime, status: "READY_NO_SESSION", session: null, activeRegister: null };
    render(<POSSell />);
    expect(screen.getByRole("alert")).toHaveTextContent("Register closed");
    expect(screen.getByText("barcode input")).toHaveAttribute("data-loading", "true");
    expect(mocks.previewReturn).not.toHaveBeenCalled();
    mocks.state.pos.session = validSession;
    mocks.runtime = validRuntime;
  });
});
