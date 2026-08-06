import * as fs from "fs"
import * as path from "path"

const projectRoot = path.resolve(process.cwd())

describe("stable launcher and port cleanup safety", () => {
  const killPortSource = fs.readFileSync(path.join(projectRoot, "scripts", "kill-port-9000.ps1"), "utf8")
  const stableLauncherSource = fs.readFileSync(path.join(projectRoot, "scripts", "start-stable.js"), "utf8")

  it("never stops PID 0 and refuses unrelated listeners", () => {
    expect(killPortSource).toContain("if ($ownerPid -le 0)")
    expect(killPortSource).toContain("Refusing to stop unrelated PID")
    expect(killPortSource).toContain("$normalizedCommand.Contains($normalizedRoot)")
  })

  it("reports success only after the listener is gone and fails otherwise", () => {
    const successIndex = killPortSource.indexOf('Write-Host "Port $Port is free')
    const listenerCheckIndex = killPortSource.lastIndexOf("(Get-PortListeners).Count -eq 0", successIndex)
    expect(listenerCheckIndex).toBeGreaterThanOrEqual(0)
    expect(successIndex).toBeGreaterThan(listenerCheckIndex)
    expect(killPortSource).toContain('Write-Error "Failed to stop confirmed project PID')
    expect(killPortSource).toContain('Write-Error "Confirmed project process stop did not free port')
    expect(killPortSource).toContain("exit 1")
    expect(killPortSource).not.toContain("-> Stopped")
  })

  it("requires served build metadata and Admin asset references to match", () => {
    expect(stableLauncherSource).toContain("adminAssetReferences")
    expect(stableLauncherSource).toContain("Served Admin HTML asset references do not match")
    expect(stableLauncherSource).toContain("Served Build ID does not match")
    expect(stableLauncherSource).not.toContain("does not match derived Build ID (${buildId})")
  })
})
