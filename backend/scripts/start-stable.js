/**
 * Stable Admin start script for Eatsie / Organic Canada Medusa v2.
 *
 * Mode: STABLE (no Vite HMR, no ephemeral ports)
 *   - Runs: medusa build  (if not already built or if --rebuild is passed)
 *   - Runs: medusa start
 *
 * Admin is served through the built assets at:
 *   http://localhost:9000/app
 *
 * No ephemeral Vite HMR port is used. Preferred for:
 *   - Normal Admin usage
 *   - USA price approval workflow
 *   - Live import operations
 *
 * Usage:
 *   node scripts/start-stable.js
 *   node scripts/start-stable.js --local
 *   node scripts/start-stable.js --rebuild
 *   node scripts/start-stable.js --rebuild --clean
 */

const { execSync, execFileSync, spawn } = require("child_process")
const fs = require("fs")
const path = require("path")
const net = require("net")
const url = require("url")
const http = require("http")

const projectRoot = path.resolve(__dirname, "..")
const medusaBuildDir = path.join(projectRoot, ".medusa")
const serverDir = path.join(projectRoot, ".medusa", "server")
const packageJson = path.join(serverDir, "package.json")
const configJs = path.join(serverDir, "medusa-config.js")
const adminIndexHtml = path.join(serverDir, "public", "admin", "index.html")

const packageJsonPath = path.join(projectRoot, "package.json")
const dotEnvPath = path.join(projectRoot, ".env")

const PORT = parseInt(process.env.PORT || "9000", 10)
const REBUILD = process.argv.includes("--rebuild")
const CLEAN = process.argv.includes("--clean")
const IS_LOCAL = process.argv.includes("--local")
const HEALTH_URL = `http://localhost:${PORT}/health`

let buildId = ""

// ── Helpers ──────────────────────────────────────────────────────────────────

function header(text) {
  console.log("\n══════════════════════════════════════════════════════")
  console.log(`  ${text}`)
  console.log("══════════════════════════════════════════════════════")
}

function step(text) { console.log(`  ▶  ${text}`) }
function ok(text)   { console.log(`  ✅  ${text}`) }
function warn(text) { console.log(`  ⚠️   ${text}`) }
function fail(text) { console.error(`  ❌  ${text}`); process.exit(1) }

// ── Load .env ────────────────────────────────────────────────────────────────

function loadDotEnv() {
  try {
    if (!fs.existsSync(dotEnvPath)) return
    const content = fs.readFileSync(dotEnvPath, "utf8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      // Strip surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch (e) {
    // Non-blocking
  }
}

// ── Copy .env to Build ────────────────────────────────────────────────────────

function copyEnvToBuild() {
  const destEnv = path.join(serverDir, ".env")
  if (fs.existsSync(dotEnvPath)) {
    step("Copying .env to .medusa/server/.env...")
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true })
    }
    fs.copyFileSync(dotEnvPath, destEnv)
    const sourceSecrets = ["JWT_SECRET", "COOKIE_SECRET"].map((key) => `${key}=${process.env[key] || ""}`).join("\n")
    const copiedEnv = fs.readFileSync(destEnv, "utf8")
    for (const entry of sourceSecrets.split("\n")) {
      if (!copiedEnv.split(/\r?\n/).includes(entry)) {
        fail("Auth secret copy verification failed. Refusing to start because sessions may not survive restart.")
      }
    }
    ok(".env copied")
  }
}

// ── Extract Host & Port for Redis ───────────────────────────────────────────

function extractHostPort(redisUrlString) {
  let hostname = "127.0.0.1"
  let port = 6379
  try {
    let cleanUrl = redisUrlString.trim()
    if (!cleanUrl.includes("://")) {
      cleanUrl = "redis://" + cleanUrl
    }
    const parsed = url.parse(cleanUrl)
    if (parsed.hostname) {
      hostname = parsed.hostname
    }
    if (parsed.port) {
      port = parseInt(parsed.port, 10)
    }
  } catch (e) {
    // Fallback
  }
  return { hostname, port }
}

// ── Test Redis Reachability ──────────────────────────────────────────────────

function checkRedisReachable(redisUrlString) {
  return new Promise((resolve) => {
    try {
      const { hostname, port } = extractHostPort(redisUrlString)
      
      const socket = new net.Socket()
      socket.setTimeout(2500)
      
      socket.on("connect", () => {
        socket.destroy()
        resolve(true)
      })
      
      socket.on("error", () => {
        socket.destroy()
        resolve(false)
      })
      
      socket.on("timeout", () => {
        socket.destroy()
        resolve(false)
      })
      
      socket.connect(port, hostname)
    } catch (e) {
      resolve(false)
    }
  })
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateProject() {
  if (!fs.existsSync(packageJsonPath)) fail("package.json not found in: " + projectRoot)
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
  if (pkg.name !== "backend") fail(`Wrong directory — package.json name is '${pkg.name}', expected 'backend'`)
  if (!fs.existsSync(dotEnvPath)) fail(".env file not found at: " + dotEnvPath)
  ok("Project validated: " + projectRoot)
}

// Auth cookies/JWTs are signed with these values. They must come from the
// project .env and must never be generated as part of a restart.
function validateAuthSecrets() {
  const missing = ["JWT_SECRET", "COOKIE_SECRET"].filter((key) => !process.env[key] || !process.env[key].trim())
  if (missing.length) fail(`Missing required auth secret(s) in .env: ${missing.join(", ")}. Refusing to start because sessions would be unsafe.`)
  const tooShort = ["JWT_SECRET", "COOKIE_SECRET"].filter((key) => process.env[key].trim().length < 32)
  if (tooShort.length) fail(`Auth secret(s) must be at least 32 characters: ${tooShort.join(", ")}.`)
  ok("Auth secrets loaded from project .env (values not logged)")
}

function validateAdminRuntimeConfiguration() {
  const requiredOrigin = `http://localhost:${PORT}`
  for (const key of ["ADMIN_CORS", "AUTH_CORS"]) {
    const origins = (process.env[key] || "").split(",").map((value) => value.trim())
    if (!origins.includes(requiredOrigin)) {
      fail(`${key} must include ${requiredOrigin} for the stable local Admin session.`)
    }
  }
  if (process.env.MEDUSA_BACKEND_URL !== requiredOrigin) {
    fail(`MEDUSA_BACKEND_URL must be ${requiredOrigin} for the stable local Admin.`)
  }
  if (process.env.ADMIN_AUTH_TYPE && process.env.ADMIN_AUTH_TYPE !== "session") {
    fail("ADMIN_AUTH_TYPE must be session when configured for the stable Admin.")
  }
  ok("Admin session runtime configuration validated (values not logged)")
}

function validateBuildCompleteness() {
  const missing = []
  if (!fs.existsSync(serverDir)) missing.push(".medusa/server directory")
  if (!fs.existsSync(packageJson)) missing.push(".medusa/server/package.json")
  if (!fs.existsSync(configJs)) missing.push(".medusa/server/medusa-config.js")
  if (!fs.existsSync(adminIndexHtml)) missing.push(".medusa/server/public/admin/index.html")

  return missing
}

function validateAdminIndexIsProduction(htmlContent) {
  if (htmlContent.includes("@vite/client")) return false
  if (htmlContent.includes("react-refresh")) return false
  if (htmlContent.includes("localhost:") && !htmlContent.includes("localhost:9000")) {
    return false
  }
  return true
}

function adminAssetReferences(htmlContent) {
  return Array.from(htmlContent.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g))
    .map((match) => match[1])
    .sort()
}

function isPortListening(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host })
    socket.setTimeout(750)
    socket.once("connect", () => { socket.destroy(); resolve(true) })
    socket.once("error", () => { socket.destroy(); resolve(false) })
    socket.once("timeout", () => { socket.destroy(); resolve(false) })
  })
}

async function isPortAvailable(port) {
  const [ipv4Listening, ipv6Listening] = await Promise.all([
    isPortListening(port, "127.0.0.1"),
    isPortListening(port, "::1"),
  ])
  if (ipv4Listening || ipv6Listening) return false

  return new Promise((resolve) => {
    const server = net.createServer()
    server.once("error", () => resolve(false))
    server.once("listening", () => { server.close(); resolve(true) })
    server.listen(port, "0.0.0.0")
  })
}

function describePortOwner(port) {
  if (process.platform !== "win32") return null
  try {
    const command = `$c=Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){$p=Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; [PSCustomObject]@{pid=$c.OwningProcess;name=$p.ProcessName} | ConvertTo-Json -Compress}`
    const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    }).trim()
    return output ? JSON.parse(output) : null
  } catch {
    return null
  }
}

// ── Clean ─────────────────────────────────────────────────────────────────────

function cleanBuildOutput() {
  if (fs.existsSync(medusaBuildDir)) {
    step("Removing .medusa build directory...")
    fs.rmSync(medusaBuildDir, { recursive: true, force: true })
    ok(".medusa removed")
  } else {
    ok(".medusa not present — nothing to clean")
  }
}

// ── Build ─────────────────────────────────────────────────────────────────────

function runBuild() {
  header("BUILDING MEDUSA BACKEND + ADMIN")
  step("Running: npm.cmd run build (medusa build)")
  step("This compiles TypeScript and bundles Admin assets.")
  step("Admin will be served from .medusa/server/public — no Vite HMR port.")
  console.log("")

  try {
    execSync("npm.cmd run build", {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        MEDUSA_SKIP_ENV_CHECK: "true",
        NODE_ENV: "production",
      },
    })
    ok("Build completed")
  } catch (e) {
    fail(`Build failed (exit code ${e.status}). Fix errors and retry.`)
  }
}

// ── HTTP Request Helper ───────────────────────────────────────────────────────

function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = url.parse(urlStr)
      const options = {
        hostname: parsed.hostname || "localhost",
        port: parsed.port || PORT,
        path: parsed.path || "/",
        method: "GET",
        timeout: 2500,
      }
      const req = http.request(options, (res) => {
        let data = ""
        res.on("data", (chunk) => { data += chunk })
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, body: data })
        })
      })
      req.on("error", (err) => reject(err))
      req.on("timeout", () => {
        req.destroy()
        reject(new Error("Timeout requesting " + urlStr))
      })
      req.end()
    } catch (e) {
      reject(e)
    }
  })
}

// ── Wait & Verify served HTML ────────────────────────────────────────────────

async function waitForHealthAndVerifyApp(childProcess) {
  const healthUrl = `http://localhost:${PORT}/health`
  const appUrl = `http://localhost:${PORT}/app/`
  
  step(`Waiting for backend health check at ${healthUrl}...`)
  
  let attempts = 0
  const maxAttempts = 30 // 30 * 2s = 60s
  let healthy = false
  while (attempts < maxAttempts) {
    attempts++
    try {
      const res = await fetchUrl(healthUrl)
      if (res.statusCode === 200) {
        ok(`Backend is healthy! (attempt ${attempts})`)
        healthy = true
        break
      }
    } catch (e) {
      // Waiting
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  
  if (!healthy) {
    childProcess.kill("SIGTERM")
    fail("Medusa backend did not become healthy in time.")
  }
  
  step(`Verifying served Admin HTML at ${appUrl}...`)
  try {
    const res = await fetchUrl(appUrl)
    const html = res.body

    if (res.statusCode !== 200) {
      childProcess.kill("SIGTERM")
      fail(`Served Admin HTML returned HTTP ${res.statusCode}; expected 200.`)
    }
    
    if (html.includes("@vite/client") || html.includes("localhost:21445")) {
      childProcess.kill("SIGTERM")
      fail(
        "Served Admin HTML contains Vite development references!\n" +
        "   The browser may be loading a cached dev bundle or the server was improperly built.\n" +
        "   Aborting startup."
      )
    }

    const builtHtml = fs.readFileSync(adminIndexHtml, "utf8")
    const expectedAssets = adminAssetReferences(builtHtml)
    const servedAssets = adminAssetReferences(html)
    if (!expectedAssets.length || JSON.stringify(servedAssets) !== JSON.stringify(expectedAssets)) {
      childProcess.kill("SIGTERM")
      fail("Served Admin HTML asset references do not match the current built Admin index.")
    }

    ok("Stable Admin production assets verified successfully (no Vite HMR runtime detected)")
    ok("Served Admin HTML references current built asset hash(es)")
  } catch (e) {
    childProcess.kill("SIGTERM")
    fail("Failed to request Admin URL for verification: " + e.message)
  }

  const buildMetadataUrl = `http://localhost:${PORT}/app/eatsie-build.json`
  step(`Verifying served Build Metadata at ${buildMetadataUrl}...`)
  try {
    const res = await fetchUrl(buildMetadataUrl)
    if (res.statusCode === 200) {
      const data = JSON.parse(res.body)
      if (data.buildId === buildId) {
        ok(`Served Build ID matches derived Build ID: ${data.buildId}`)
      } else {
        childProcess.kill("SIGTERM")
        fail("Served Build ID does not match the current derived Build ID.")
      }
    } else {
      childProcess.kill("SIGTERM")
      fail(`Served Build Metadata returned HTTP status: ${res.statusCode}`)
    }
  } catch (e) {
    childProcess.kill("SIGTERM")
    fail(`Failed to request Build Metadata for verification: ${e.message}`)
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

async function startMedusa() {
  header("STARTING MEDUSA (STABLE MODE — NO VITE HMR)")
  step(`Running: medusa start on port ${PORT}`)
  step("Admin URL: http://localhost:" + PORT + "/app")
  step("Health:    " + HEALTH_URL)
  console.log("")
  console.log("  ℹ️  STABLE MODE: Admin assets are pre-built.")
  console.log("     No ephemeral Vite HMR port is used.")
  console.log("     Preferred for pricing approvals and live import operations.")
  console.log("")

  // Copy .env to .medusa/server/
  copyEnvToBuild()

  const medusaCliPath = require.resolve("@medusajs/cli/cli.js")
  const child = spawn(process.execPath, [medusaCliPath, "start"], {
    stdio: "inherit",
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      EATSIE_ADMIN_RUNTIME: "stable",
      EATSIE_PROJECT_ROOT: projectRoot,
    },
    shell: false,
    windowsHide: true,
  })

  // Start background health & served asset verification
  waitForHealthAndVerifyApp(child).catch((err) => {
    console.error("Verification error:", err)
    child.kill("SIGTERM")
    process.exit(1)
  })

  child.on("error", (error) => {
    console.error("Failed to launch Medusa start:", error)
    process.exit(1)
  })

  child.on("exit", (code, signal) => {
    if (signal) console.error(`Medusa exited on signal ${signal}`)
    process.exit(code ?? 1)
  })

  process.on("SIGINT",  () => child.kill("SIGINT"))
  process.on("SIGTERM", () => child.kill("SIGTERM"))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadDotEnv()
  
  if (IS_LOCAL) {
    process.env.EATSIE_LOCAL_STABLE = "true"
    process.env.EATSIE_ALLOW_FAKE_REDIS = "true"
    process.env.EATSIE_RUNTIME_MODE = "local-stable"
  }

  header("EATSIE MEDUSA v2 — STABLE ADMIN START")
  console.log(`  Mode: ${IS_LOCAL ? "LOCAL STABLE (fake Redis allowed)" : "PRODUCTION STABLE (real Redis required)"}`)
  console.log("  Admin: http://localhost:" + PORT + "/app")
  console.log("  Flags: " + (REBUILD ? "--rebuild " : "") + (CLEAN ? "--clean " : "") + (IS_LOCAL ? "--local" : "(none)"))
  console.log("")

  validateProject()
  validateAuthSecrets()
  validateAdminRuntimeConfiguration()

  const portFree = await isPortAvailable(PORT)
  if (!portFree) {
    const owner = describePortOwner(PORT)
    const ownerText = owner ? ` PID ${owner.pid}${owner.name ? ` (${owner.name})` : ""}` : " an unknown process"
    warn(`Port ${PORT} is already occupied by${ownerText}.`)
    warn("Identify and stop that process, or run 'npm.cmd run kill:9000' after confirming it belongs to this project.")
    fail(`Port ${PORT} conflict. Stable Admin was not started.`)
  }

  // Redis configuration checking
  const redisUrl = process.env.REDIS_URL?.trim()
  if (IS_LOCAL) {
    warn("LOCAL ONLY: fake Redis is enabled. Do not use this mode in production.")
  } else {
    // Real stable mode requires Redis
    if (!redisUrl) {
      fail(
        "REDIS_URL is required for stable mode.\n" +
        "   Configure Redis in .env or use 'npm run admin:stable:local' for local UI testing."
      )
    }
    
    // Check reachability
    const { hostname, port } = extractHostPort(redisUrl)
    step(`Redis preflight check: connecting to ${hostname}:${port}...`)
    
    const reachable = await checkRedisReachable(redisUrl)
    if (!reachable) {
      fail(
        `Redis is unreachable at ${hostname}:${port}.\n` +
        "   Ensure your Redis server is running or use 'npm run admin:stable:local' for local UI testing."
      )
    }
    
    ok("Redis connection verified successfully (preflight)")
  }

  // Check build completeness and auto-rebuild if needed
  let missingArtifacts = validateBuildCompleteness()
  let hasRebuilt = false

  if (missingArtifacts.length > 0) {
    warn("Missing build artifacts: " + missingArtifacts.join(", "))
    if (CLEAN || REBUILD) {
      // Let standard flow handle clean & build below
    } else {
      warn("Admin pre-built assets or config is missing. Rebuilding automatically...")
      runBuild()
      hasRebuilt = true
      missingArtifacts = validateBuildCompleteness()
      if (missingArtifacts.length > 0) {
        fail("Rebuild completed but these artifacts are still missing: " + missingArtifacts.join(", "))
      }
    }
  }

  if (CLEAN || REBUILD) {
    if (CLEAN) cleanBuildOutput()
    runBuild()
    hasRebuilt = true
  }

  // Validate Admin index content is production bundle (not dev)
  let htmlContent = fs.readFileSync(adminIndexHtml, "utf8")
  if (!validateAdminIndexIsProduction(htmlContent)) {
    warn("Warning: Admin index contains development content or Vite HMR references.")
    if (!hasRebuilt) {
      warn("Initiating clean rebuild...")
      cleanBuildOutput()
      runBuild()
      htmlContent = fs.readFileSync(adminIndexHtml, "utf8")
      if (!validateAdminIndexIsProduction(htmlContent)) {
        fail("Rebuild completed but Admin index still contains development/Vite references. Startup aborted.")
      }
    } else {
      fail("Admin index contains development/Vite references even after rebuild. Startup aborted.")
    }
  }

  // Read existing validated pre-built Build Metadata
  const eatsieBuildPath = path.join(serverDir, "public", "admin", "eatsie-build.json")
  const repoBuildPath = path.join(projectRoot, ".eatsie-admin-build.json")

  if (!fs.existsSync(eatsieBuildPath)) {
    if (fs.existsSync(repoBuildPath)) {
      fs.mkdirSync(path.dirname(eatsieBuildPath), { recursive: true })
      fs.copyFileSync(repoBuildPath, eatsieBuildPath)
    } else {
      fail("Stable Admin metadata is missing. Run npm run build first.")
    }
  }

  let buildMetadata
  try {
    buildMetadata = JSON.parse(fs.readFileSync(eatsieBuildPath, "utf8"))
  } catch (e) {
    fail("Failed to parse Stable Admin metadata in " + eatsieBuildPath + ". Run npm run build first.")
  }

  buildId = buildMetadata.buildId
  if (!buildId) {
    fail("Build ID is missing in Stable Admin metadata. Run npm run build first.")
  }

  ok(`Loaded existing validated Admin Build ID: ${buildId}`)

  await startMedusa()
}

main().catch((err) => {
  console.error("Stable start error:", err)
  process.exit(1)
})
