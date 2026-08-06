import * as fs from "fs"
import * as path from "path"

const pagePath = path.resolve(process.cwd(), "src/admin/routes/usa-price-approval/page.tsx")
const generatedBuildPath = path.resolve(process.cwd(), "src/admin/generated/eatsie-build.ts")
const pageSource = fs.readFileSync(pagePath, "utf8")
const generatedBuildSource = fs.readFileSync(generatedBuildPath, "utf8")

describe("USA Price Approval build identity", () => {
  it("uses the generated module as the browser bundle identity", () => {
    expect(pageSource).toContain('import { EATSIE_ADMIN_BUILD_ID } from "../../generated/eatsie-build"')
    expect(generatedBuildSource).toMatch(/EATSIE_ADMIN_BUILD_ID = "eatsie_build_[^"]+"/)
  })

  it("ignores legacy window build IDs", () => {
    expect(pageSource).not.toMatch(/window\.EATSIE_BUILD_ID/)
  })

  it("does not use local or session storage as bundle identity", () => {
    expect(pageSource).not.toMatch(/(?:localStorage|sessionStorage)\.getItem\(["'](?:eatsie_admin_build|eatsie_stale_bundle)["']\)/)
    expect(pageSource).toContain('sessionStorage.getItem("eatsie_reload_attempted")')
  })

  it("does not use a query parameter as bundle identity", () => {
    expect(pageSource).not.toMatch(/searchParams\.get\(["']admin_build["']\)/)
    expect(pageSource).toContain('urlObj.searchParams.delete("admin_build")')
  })

  it("classifies absent metadata as metadata-unavailable, not outdated", () => {
    expect(pageSource).toContain('if (!currentServerBuildId)')
    expect(pageSource).toContain('setBuildIdentityState("metadata-unavailable")')
  })

  it("uses the exact non-empty ID mismatch condition", () => {
    expect(pageSource).toContain('Boolean(bundleBuildId) && Boolean(currentServerBuildId) && bundleBuildId !== currentServerBuildId')
    expect(pageSource).toContain('setBuildIdentityState("ready")')
    expect(pageSource).toContain('setBuildIdentityState(alreadyAttempted === currentServerBuildId ? "persistent-mismatch" : "outdated")')
  })

  it("uses the reload marker only after an actual mismatch", () => {
    const mismatchIndex = pageSource.indexOf("const hasMismatch")
    const markerIndex = pageSource.indexOf('sessionStorage.getItem("eatsie_reload_attempted")')
    expect(mismatchIndex).toBeGreaterThan(-1)
    expect(markerIndex).toBeGreaterThan(mismatchIndex)
  })

  it("cleans only obsolete build-related storage keys", () => {
    expect(pageSource).toContain('const deprecated = ["eatsie_stale_bundle", "eatsie_admin_build", "eatsie_reload_count"]')
    expect(pageSource).not.toContain("localStorage.clear()")
    expect(pageSource).not.toContain("sessionStorage.clear()")
  })

  it("does not make an import or business-data write while checking identity", () => {
    const identityEffect = pageSource.slice(pageSource.indexOf("useEffect(() => {"), pageSource.indexOf("const loadData = useCallback"))
    expect(identityEffect).toContain('fetch("/app/eatsie-build.json?t=" + Date.now()')
    expect(identityEffect).not.toMatch(/method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/)
    expect(identityEffect).not.toContain("/admin/usa-price-review")
  })
})
