import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import POSLogin from "./POSLogin";
import { POSProvider } from "../../contexts/POSContext";

const mocks = vi.hoisted(() => ({ login: vi.fn(), bootstrap: vi.fn(), navigate: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("react-hot-toast", () => ({ default: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("../../services/posApi", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loginPosStaff: mocks.login,
    posApi: {
      ...actual.posApi,
      bootstrap: mocks.bootstrap,
    },
  };
});

describe("POSLogin integration with POSContext", () => {
  beforeEach(() => { 
    // POSContext.refreshBootstrap is intentionally isolated to /pos routes.
    // jsdom defaults to "/", which would skip bootstrap entirely.
    window.history.pushState({}, "", "/pos/login");
    sessionStorage.clear();
    localStorage.clear();
    vi.clearAllMocks();
    mocks.login.mockReset();
    mocks.bootstrap.mockReset();
  });

  const makeRegister = (overrides = {}) => ({
    id: "reg_ca",
    name: "Canada POS Register",
    code: "CAD_REG",
    status: "active",
    currency_code: "cad",
    ...overrides,
  });

  const makeBootstrap = (overrides = {}) => {
    const { operator, ...rest } = overrides;
    return {
      authenticated: true,
      operator: {
        id: "internal_operator_123",
        actor_id: "user_123",
        email: "admin@eatsie.com",
        role: "ADMIN",
        ...operator,
      },
      assignment_state: "ready",
      registers: [makeRegister()],
      ...rest,
    };
  };

  const renderWithContext = () => {
    const store = configureStore({ reducer: (state = {}) => state });
    render(
      <Provider store={store}>
        <POSProvider>
          <POSLogin />
        </POSProvider>
      </Provider>
    );
  };

  const submit = async () => {
    const user = userEvent.setup();
    renderWithContext();
    const emailInput = screen.getByLabelText(/Staff email/i);
    const passwordInput = screen.getByLabelText(/Password/i);
    
    await user.clear(emailInput);
    await user.type(emailInput, "admin@eatsie.com");
    await user.clear(passwordInput);
    await user.type(passwordInput, "password");
    await user.click(screen.getByRole("button", { name: /Sign in/i }));
  };

  it("clears old runtime before authentication and does not bootstrap invalid credentials", async () => {
    mocks.login.mockRejectedValue({ response: { status: 401 } });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it("bootstraps exactly once after a successful new POS login", async () => {
    mocks.login.mockImplementation(async () => {
      localStorage.setItem("eatsie_pos_actor_id", "user_current");
      localStorage.setItem("eatsie_pos_token", "fake_token");
      localStorage.setItem("eatsie_pos_auth_scope", "POS_STAFF");
      return { authenticated: true, actorId: "user_current" };
    });
    mocks.bootstrap.mockResolvedValue(makeBootstrap({
      operator: { actor_id: "user_current" }
    }));
    await submit();
    expect(await screen.findByRole("button", { name: /Sign in/i })).toBeInTheDocument();
    expect(mocks.bootstrap).toHaveBeenCalledTimes(1);
  });

  it("shows one classified error for a missing bootstrap actor identity", async () => {
    mocks.login.mockImplementation(async () => {
      localStorage.setItem("eatsie_pos_actor_id", "user_123");
      localStorage.setItem("eatsie_pos_token", "fake_token");
      localStorage.setItem("eatsie_pos_auth_scope", "POS_STAFF");
      return { authenticated: true, actorId: "user_123" };
    });
    mocks.bootstrap.mockResolvedValue(makeBootstrap({
      operator: { actor_id: "" } // Missing actor_id
    }));
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("POS configuration is incomplete: Missing actor identity.");
  });

  it("Regression A: auth actor = user_123, bootstrap.operator.actor_id = user_123 -> login succeeds", async () => {
    mocks.login.mockImplementation(async () => {
      localStorage.setItem("eatsie_pos_actor_id", "user_123");
      localStorage.setItem("eatsie_pos_token", "fake_token");
      localStorage.setItem("eatsie_pos_auth_scope", "POS_STAFF");
      return { authenticated: true, actorId: "user_123" };
    });
    mocks.bootstrap.mockResolvedValue(makeBootstrap({
      operator: { actor_id: "user_123" }
    }));
    await submit();
    expect(await screen.findByRole("button", { name: /Sign in/i })).toBeInTheDocument();
  });

  it("Regression B: ignores sub, relies on actor_id -> login succeeds", async () => {
    mocks.login.mockImplementation(async () => {
      localStorage.setItem("eatsie_pos_actor_id", "user_123");
      localStorage.setItem("eatsie_pos_token", "fake_token");
      localStorage.setItem("eatsie_pos_auth_scope", "POS_STAFF");
      return { authenticated: true, actorId: "user_123" };
    });
    mocks.bootstrap.mockResolvedValue(makeBootstrap({
      operator: { actor_id: "user_123" }
    }));
    await submit();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Regression C: exact mismatch error", async () => {
    mocks.login.mockImplementation(async () => {
      localStorage.setItem("eatsie_pos_actor_id", "user_123");
      localStorage.setItem("eatsie_pos_token", "fake_token");
      localStorage.setItem("eatsie_pos_auth_scope", "POS_STAFF");
      return { authenticated: true, actorId: "user_123" };
    });
    mocks.bootstrap.mockResolvedValue(makeBootstrap({
      operator: { actor_id: "user_456" }
    }));
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("This account is not linked to the configured POS operator.");
  });

  it("Regression D: never show 'No active register assignments' when ready", async () => {
    mocks.login.mockImplementation(async () => {
      localStorage.setItem("eatsie_pos_actor_id", "user_123");
      localStorage.setItem("eatsie_pos_token", "fake_token");
      localStorage.setItem("eatsie_pos_auth_scope", "POS_STAFF");
      return { authenticated: true, actorId: "user_123" };
    });
    mocks.bootstrap.mockResolvedValue(makeBootstrap({
      operator: { actor_id: "user_123" }
    }));
    await submit();
    const alerts = screen.queryAllByRole("alert").map(el => el.textContent);
    expect(alerts).not.toContain("No active register assignments");
  });

  it("Regression E: fresh login replaces stale previous actor before comparison", async () => {
    localStorage.setItem("eatsie_pos_actor_id", "user_OLD_STALE_ACTOR");
    
    mocks.login.mockImplementation(async () => {
      localStorage.setItem("eatsie_pos_actor_id", "user_01KWPV0WK7J0KN2A8FZ0AD3T16");
      localStorage.setItem("eatsie_pos_token", "fake_token");
      localStorage.setItem("eatsie_pos_auth_scope", "POS_STAFF");
      return { authenticated: true, actorId: "user_01KWPV0WK7J0KN2A8FZ0AD3T16" };
    });

    mocks.bootstrap.mockResolvedValue(makeBootstrap({
      operator: { actor_id: "user_01KWPV0WK7J0KN2A8FZ0AD3T16" }
    }));

    await submit();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(localStorage.getItem("eatsie_pos_actor_id")).toBe("user_01KWPV0WK7J0KN2A8FZ0AD3T16");
  });
});
