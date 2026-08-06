import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POSProvider } from "./POSContext";
import { usePOS } from "./usePOS";

const mocks = vi.hoisted(() => ({ bootstrap: vi.fn(), dispatch: vi.fn(), token: "token_1", actorId: "operator_1" }));
vi.mock("react-redux", () => ({ useDispatch: () => mocks.dispatch }));
vi.mock("../services/apiClient", () => ({ getCurrentPosToken: () => mocks.token, getPosAuthActorId: () => mocks.actorId, isRequestCanceled: (error) => error?.name === "AbortError" || error?.code === "ERR_CANCELED" }));
vi.mock("../services/posApi", () => ({ posApi: { bootstrap: mocks.bootstrap }, clearPosStaff: vi.fn(), setPosStaff: vi.fn(), setStoredPosRegister: vi.fn(), getPosStaff: () => null, getPosRegister: () => null }));

const ca = { id: "register_ca", name: "Canada", code: "CA", status: "active", currency_code: "cad" };
const us = { id: "register_us", name: "USA", code: "US", status: "active", currency_code: "usd" };
const payload = (registers) => ({ authenticated: true, operator: { actor_id: "operator_1", id: "operator_1", user_id: "user_1" }, registers, assignment_state: registers.length ? "ready" : "empty", session: null });
const deferred = () => { let resolve; let reject; return { promise: new Promise((ok, fail) => { resolve = ok; reject = fail; }), resolve, reject }; };
function Harness() { const pos = usePOS(); return <><div data-testid="status">{pos.status}</div><div data-testid="registers">{pos.registers.map((register) => register.id).join(",")}</div><div data-testid="warning">{pos.warning || ""}</div><button onClick={() => pos.refreshBootstrap().catch(() => undefined)}>refresh</button><button onClick={() => pos.clearRuntime({ clearToken: true })}>logout</button></>; }

describe("POSContext latest bootstrap authority", () => {
  beforeEach(() => { 
    // refreshBootstrap only runs on /pos routes (production isolation guard).
    window.history.pushState({}, "", "/pos/login");
    mocks.token = "token_1"; mocks.actorId = "operator_1"; mocks.bootstrap.mockReset(); mocks.dispatch.mockReset();
  });
  it("keeps the latest successful register response when an older empty request resolves later", async () => {
    const first = deferred(); const second = deferred(); mocks.bootstrap.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<POSProvider><Harness /></POSProvider>);
    fireEvent.click(screen.getByText("refresh"));
    await act(async () => second.resolve(payload([ca, us])));
    await waitFor(() => expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us"));
    await act(async () => first.resolve(payload([])));
    expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us");
    expect(screen.getByTestId("status")).toHaveTextContent("READY_NO_SESSION");
  });
  it("commits only the newest of rapid refresh responses", async () => {
    const initial = deferred(); const first = deferred(); const second = deferred(); const latest = deferred();
    mocks.bootstrap.mockReturnValueOnce(initial.promise).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(latest.promise);
    render(<POSProvider><Harness /></POSProvider>);
    fireEvent.click(screen.getByText("refresh")); fireEvent.click(screen.getByText("refresh")); fireEvent.click(screen.getByText("refresh"));
    await act(async () => latest.resolve(payload([ca, us])));
    await waitFor(() => expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us"));
    await act(async () => { second.resolve(payload([])); first.resolve(payload([])); initial.resolve(payload([])); });
    expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us");
  });
  it("does not clear confirmed registers for an aborted request", async () => {
    const first = deferred(); mocks.bootstrap.mockResolvedValueOnce(payload([ca, us])).mockReturnValueOnce(first.promise);
    render(<POSProvider><Harness /></POSProvider>);
    await waitFor(() => expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us"));
    fireEvent.click(screen.getByText("refresh"));
    await act(async () => first.reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us");
    expect(screen.getByTestId("status")).toHaveTextContent("READY_NO_SESSION");
  });
  it("preserves last confirmed registers after a network failure", async () => {
    mocks.bootstrap.mockResolvedValueOnce(payload([ca, us])).mockRejectedValueOnce(Object.assign(new Error("network"), { code: "ERR_NETWORK" }));
    render(<POSProvider><Harness /></POSProvider>);
    await waitFor(() => expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us"));
    fireEvent.click(screen.getByText("refresh"));
    await waitFor(() => expect(screen.getByTestId("warning")).toHaveTextContent("Could not refresh POS data"));
    expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us");
  });
  it("is stable under StrictMode delayed bootstrap cleanup", async () => {
    mocks.bootstrap.mockResolvedValue(payload([ca, us]));
    render(<StrictMode><POSProvider><Harness /></POSProvider></StrictMode>);
    expect(await screen.findByTestId("registers")).toHaveTextContent("register_ca,register_us");
    expect(screen.getByTestId("status")).toHaveTextContent("READY_NO_SESSION");
  });
  it("never lets an old account bootstrap response overwrite the account logged in after logout", async () => {
    const oldRequest = deferred();
    mocks.bootstrap.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce({ ...payload([ca, us]), operator: { id: "operator_current", actor_id: "operator_current" } });
    render(<POSProvider><Harness /></POSProvider>);
    fireEvent.click(screen.getByText("logout"));
    mocks.token = "token_current";
    mocks.actorId = "operator_current";
    fireEvent.click(screen.getByText("refresh"));
    await waitFor(() => expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us"));
    await act(async () => oldRequest.resolve(payload([])));
    expect(screen.getByTestId("registers")).toHaveTextContent("register_ca,register_us");
  });
  it("rejects a token/bootstrap actor mismatch and clears the runtime", async () => {
    mocks.actorId = "actor_from_token";
    mocks.bootstrap.mockResolvedValueOnce(payload([ca, us]));
    render(<POSProvider><Harness /></POSProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("AUTH_REQUIRED"));
  });
});
