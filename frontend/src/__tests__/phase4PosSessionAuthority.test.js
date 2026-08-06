import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

describe("PHASE 4 POS session authority", () => {
  it("sell page uses POSContext and redirects stale route IDs", () => {
    const source = read("src/pages/pos/POSSell.jsx");
    expect(source).toContain("const posRuntime = usePOS()");
    expect(source).not.toContain("posApi.getMyRegisters()");
    expect(source).toContain("registerId !== posRuntime.session.register_id");
    expect(source).toContain("navigate(`/pos/register/${posRuntime.session.register_id}`");
    expect(source).toContain("Your active POS session belongs to another register.");
  });

  it("scanner request uses active session register instead of route-provided register", () => {
    const source = read("src/pages/pos/POSSell.jsx");
    expect(source).toContain("const activeSessionRegisterId = posRuntime.session?.register_id || \"\"");
    expect(source).toContain("let regId = activeSessionRegisterId");
    expect(source).toContain("posApi.scan(code, regId");
    expect(source).not.toContain("sourceOrOptions.registerId");
    expect(source).not.toContain("maybeOptions.registerId");
  });

  it("cart, search, and customer calls use active session register", () => {
    const source = read("src/pages/pos/POSSell.jsx");
    expect(source).toContain("posApi.createCart({ register_id: activeRegisterId");
    expect(source).toContain("<POSProductSearch registerId={activeSessionRegisterId}");
    expect(source).toContain("<POSCustomerSelector registerId={activeSessionRegisterId}");
  });

  it("register switch navigation uses backend response session register ID", () => {
    const source = read("src/pages/pos/POSRegisterSelect.jsx");
    expect(source).toContain("const currentRegister = useMemo(() => registers.find((register) => register.id === session?.register_id) || activeRegister || null");
    expect(source).toContain("navigate(`/pos/register/${registerId}`)");
    expect(source).not.toContain("navigate(`/pos/register/${register.id}`)");
  });

  it("frontend displays register assignment and session mismatch distinctly", () => {
    const errors = read("src/lib/pos/errors.js");
    const modal = read("src/components/pos/BarcodeScannerModal.jsx");
    expect(errors).toContain("POS_REGISTER_NOT_ASSIGNED");
    expect(errors).toContain("POS_REGISTER_SESSION_MISMATCH");
    expect(modal).toContain("POS_REGISTER_NOT_ASSIGNED");
    expect(modal).toContain("POS_REGISTER_SESSION_MISMATCH");
  });
});
