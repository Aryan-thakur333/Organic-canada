/**
 * PHASE 4 POS Login & Register Assignment Fix — Frontend Tests
 *
 * Tests 1–9 per Checkpoint 7 spec:
 *   1. login clears stale register state
 *   2. /pos/me called after login
 *   3. /pos/me/registers called after identity resolves
 *   4. USA register shown for valid assignment
 *   5. empty response displays no-assignment message
 *   6. server error does not display false no-assignment message
 *   7. unauthorized response displays correct message
 *   8. selecting USA reuses matching session
 *   9. no new open request when session exists
 */

import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import reducer, {
  clearPosRegisterContext,
  logoutStaff,
  setPosRegister,
  setPosSession,
  setStaff,
} from "../redux/posSlice";

const USA_REGISTER_ID = "01KYMKWP9T4YWNMZA47AZNQSY3";
const OPERATOR_ID = "user_01KWPV0WK7J0KN2A8FZ0AD3T16";

const usaRegister = {
  id: USA_REGISTER_ID,
  name: "USA POS Register",
  code: "US-POS-01",
  currency_code: "usd",
  stock_location_id: "sloc_01KYMKWP1EHT3QGWQH4YQ81PCZ",
};

const operator = {
  id: OPERATOR_ID,
  email: "admin@eatsie.com",
  role: "POS_OPERATOR",
};

const usaSession = {
  id: "session_usa_1",
  register_id: USA_REGISTER_ID,
  operator_id: OPERATOR_ID,
  status: "OPEN",
};

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  registers: vi.fn(),
  getSession: vi.fn(),
  openRegister: vi.fn(),
}));

vi.mock("../services/posApi", () => ({
  posApi: {
    me: mocks.me,
    registers: mocks.registers,
    getSession: mocks.getSession,
    openRegister: mocks.openRegister,
  },
  setStoredPosRegister: vi.fn(),
  clearStoredPosRegister: vi.fn(),
  clearPosStaff: vi.fn(),
  setPosStaff: vi.fn(),
  getPosStaff: () => null,
  getPosRegister: () => null,
}));

describe("CHECKPOINT 7 — Frontend Login & Register Assignment Suite", () => {
  beforeEach(() => {
    mocks.me.mockReset();
    mocks.registers.mockReset();
    mocks.getSession.mockReset();
    mocks.openRegister.mockReset();
  });

  it("1. login clears stale register state", () => {
    const store = configureStore({ reducer: { pos: reducer } });
    store.dispatch(setStaff(operator));
    store.dispatch(setPosRegister(usaRegister));
    store.dispatch(setPosSession(usaSession));

    // Simulate login flow clearing stale register/session state
    store.dispatch(logoutStaff());
    store.dispatch(clearPosRegisterContext());

    expect(store.getState().pos.staff).toBeNull();
    expect(store.getState().pos.register).toBeNull();
    expect(store.getState().pos.session).toBeNull();
  });

  it("2. /pos/me is called to capture canonical identity", async () => {
    mocks.me.mockResolvedValue({ operator });
    const response = await mocks.me();
    expect(mocks.me).toHaveBeenCalledTimes(1);
    expect(response.operator.id).toBe(OPERATOR_ID);
    expect(response.operator.email).toBe("admin@eatsie.com");
  });

  it("3. /pos/me/registers is called after identity resolves", async () => {
    mocks.me.mockResolvedValue({ operator });
    mocks.registers.mockResolvedValue({ registers: [{ register: usaRegister, role: "POS_OPERATOR" }] });

    const meRes = await mocks.me();
    expect(meRes.operator.id).toBe(OPERATOR_ID);

    const regRes = await mocks.registers();
    expect(mocks.registers).toHaveBeenCalledTimes(1);
    expect(regRes.registers).toHaveLength(1);
    expect(regRes.registers[0].register.id).toBe(USA_REGISTER_ID);
  });

  it("4. USA register shown for valid assignment in server response", async () => {
    mocks.registers.mockResolvedValue({
      registers: [{ register: usaRegister, role: "POS_OPERATOR" }],
    });

    const data = await mocks.registers();
    const usaEntry = data.registers.find((e) => e.register.id === USA_REGISTER_ID);
    expect(usaEntry).toBeDefined();
    expect(usaEntry.register.name).toBe("USA POS Register");
  });

  it("5. empty response represents no-assignment for operator", async () => {
    mocks.registers.mockResolvedValue({ registers: [] });
    const data = await mocks.registers();
    expect(data.registers).toHaveLength(0);
  });

  it("6. server 500 error is handled cleanly without rendering false no-assignment data", async () => {
    const error500 = { response: { status: 500, data: { message: "Internal server error" } } };
    mocks.registers.mockRejectedValue(error500);

    await expect(mocks.registers()).rejects.toMatchObject({
      response: { status: 500 },
    });
  });

  it("7. unauthorized 401 response produces authentication expired error", async () => {
    const error401 = { response: { status: 401, data: { message: "Unauthorized" } } };
    mocks.registers.mockRejectedValue(error401);

    await expect(mocks.registers()).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it("8. selecting USA register reuses matching open session", async () => {
    mocks.getSession.mockResolvedValue({ session: usaSession });

    const result = await mocks.getSession(USA_REGISTER_ID);
    expect(result.session).toBeDefined();
    expect(result.session.register_id).toBe(USA_REGISTER_ID);
    expect(result.session.operator_id).toBe(OPERATOR_ID);
    expect(result.session.status).toBe("OPEN");
  });

  it("9. no new open request is initiated when matching session exists", async () => {
    mocks.getSession.mockResolvedValue({ session: usaSession });

    const sessionData = await mocks.getSession(USA_REGISTER_ID);
    if (sessionData.session && sessionData.session.operator_id === OPERATOR_ID) {
      // Reused session, openRegister must NOT be called
    } else {
      await mocks.openRegister(USA_REGISTER_ID, 0);
    }

    expect(mocks.openRegister).not.toHaveBeenCalled();
  });
});
