import fs from "fs"
import path from "path"

const root = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8")

describe("POS scan authorization and session contract", () => {
  test("scan route validates active assignments through the canonical current-context resolver", () => {
    const source = read("src/api/pos/scan/route.ts")
    expect(source).toContain("resolveCurrentPosContext")
    expect(source).toContain("assignedRegisters")
    expect(source).not.toContain("requirePosRegisterAssignment")
  })

  test("scan delegates stale-register mismatch handling to the canonical context resolver", () => {
    const source = read("src/api/pos/scan/route.ts")
    expect(source).toContain("currentSession")
    expect(source).toContain("resolveCurrentPosContext(req, registerId)")
  })

  test("scan route preserves current-session enforcement before product lookup", () => {
    const source = read("src/api/pos/scan/route.ts")
    const sessionCallIndex = source.indexOf("resolveCurrentPosContext(req, registerId)")
    const lookupCallIndex = source.indexOf("resolvePosVariant(req")
    expect(sessionCallIndex).toBeLessThan(lookupCallIndex)
  })

  test("development auth debug logs IDs without token or credential fields", () => {
    const source = read("src/api/pos/scan/route.ts")
    expect(source).toContain("[POS_REGISTER_AUTH_DEBUG]")
    for (const text of ["actorId", "operatorId", "requestedRegisterId", "sessionRegisterId", "assignedRegisterIds"]) {
      expect(source).toContain(text)
    }
    expect(source).not.toMatch(/password|token|authorization/i)
  })
})
