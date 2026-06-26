/**
 * Development startup script with automatic port fallback.
 *
 * Detects if the default port (9000) is in use and automatically falls
 * back to 9001 or 9002. Shows diagnostic info about the process
 * occupying the port.
 *
 * Usage:
 *   node scripts/start-dev.js
 *
 * Environment variables:
 *   PORT              Default port to try (default: 9000)
 *   MEDUSA_BACKEND_URL  Updated automatically when port changes
 */

const net = require("net")
const { execSync, spawn } = require("child_process")
const path = require("path")
const fs = require("fs")
const { Client } = require("pg")

const DEFAULT_PORT = parseInt(process.env.PORT || "9000", 10)
const MAX_FALLBACK_ATTEMPTS = 3
const MIN_SECRET_LENGTH = 32

/**
 * Load environment variables from .env file into process.env.
 * This is a simple inline loader that avoids needing the dotenv dependency.
 */
function loadDotEnv() {
  const envPath = path.resolve(__dirname, "..", ".env")
  try {
    const content = fs.readFileSync(envPath, "utf8")
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
  } catch {
    // .env file not found — will be caught by validateSecrets()
  }
}

/**
 * Validate that JWT_SECRET and COOKIE_SECRET meet minimum length requirements.
 * Exits with a helpful error message if they are too short or missing.
 */
function validateSecrets() {
  const secrets = [
    { key: "JWT_SECRET", value: process.env.JWT_SECRET },
    { key: "COOKIE_SECRET", value: process.env.COOKIE_SECRET },
  ]

  let ok = true
  for (const { key, value } of secrets) {
    if (!value) {
      console.error(`\n❌  ${key} is not set. Add it to your .env file.`)
      ok = false
    } else if (value.length < MIN_SECRET_LENGTH) {
      console.error(`\n❌  ${key} is only ${value.length} characters long (minimum ${MIN_SECRET_LENGTH} required).`)
      console.error(`    Generate a secure secret with:`)
      console.error(`    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
      ok = false
    }
  }

  if (!ok) {
    console.error("\nSee .env.template for all required environment variables.\n")
    process.exit(1)
  }

  console.log(`   🔐  JWT_SECRET: ${process.env.JWT_SECRET.length} characters (minimum ${MIN_SECRET_LENGTH})`)
  console.log(`   🔐  COOKIE_SECRET: ${process.env.COOKIE_SECRET.length} characters`)
}

/**
 * Fail fast when PostgreSQL is unreachable or DATABASE_URL is invalid.
 * Without a connection timeout, the Medusa module loader can appear to stop
 * after its Redis message while the database driver is still retrying.
 */
async function verifyDatabaseConnection() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in backend/.env")
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  })

  try {
    await client.connect()
    await client.query("select 1")
    console.log("   PostgreSQL connection verified")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`PostgreSQL preflight failed: ${message}`)
  } finally {
    await client.end().catch(() => undefined)
  }
}

/**
 * Check if a port is available by attempting a TCP connection.
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once("error", (err) => {
      if ((err).code === "EADDRINUSE") {
        resolve(false)
      } else {
        // Permission denied, etc. — treat as unavailable
        resolve(false)
      }
    })
    server.once("listening", () => {
      server.close()
      resolve(true)
    })
    server.listen(port, "0.0.0.0")
  })
}

/**
 * Get diagnostic info about the process using a port (Windows).
 */
function getProcessInfo(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      timeout: 3000,
    })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("LISTENING"))

    if (output.length === 0) return null

    // Extract PIDs from lines like:
    //   TCP    0.0.0.0:9000   0.0.0.0:0   LISTENING    4536
    const pids = output
      .map((line) => {
        const parts = line.trim().split(/\s+/)
        return parts[parts.length - 1]
      })
      .filter(Boolean)

    if (pids.length === 0) return null

    const uniquePids = [...new Set(pids)]
    const processes = uniquePids.map((pid) => {
      let name = "unknown"
      try {
        const taskOutput = execSync(
          `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
          { encoding: "utf8", timeout: 3000 }
        )
        const match = taskOutput.match(/"([^"]+)"/)
        if (match) name = match[1]
      } catch {
        // Could not get process name
      }
      return { pid: parseInt(pid, 10), name }
    })

    return processes
  } catch {
    return null
  }
}

/**
 * Print formatted diagnostics about the port conflict.
 */
function printDiagnostics(port, processes) {
  console.error("\n══════════════════════════════════════════════════════")
  console.error("  ⚠️  PORT CONFLICT DETECTED")
  console.error(`  Port ${port} is already in use.`)
  console.error("══════════════════════════════════════════════════════")

  if (processes && processes.length > 0) {
    console.error("\n  Process(es) using this port:")
    for (const proc of processes) {
      console.error(`    • PID ${proc.pid} — ${proc.name}`)
    }
    console.error("\n  To free the port, run:")
    for (const proc of processes) {
      console.error(`    taskkill /PID ${proc.pid} /F`)
    }
  } else {
    console.error("\n  (Could not identify the owning process.)")
  }

  console.error("\n  Attempting automatic fallback to next available port...")
  console.error("══════════════════════════════════════════════════════\n")
}

/**
 * Start the Medusa dev server with the given port.
 */
function startMedusa(port) {
  // Set the PORT for the Medusa process
  process.env.PORT = String(port)

  // Update MEDUSA_BACKEND_URL to reflect the actual port
  const baseUrl = process.env.MEDUSA_BACKEND_URL || `http://localhost:${port}`
  const updatedUrl = baseUrl.replace(/:\d+/, `:${port}`)
  process.env.MEDUSA_BACKEND_URL = updatedUrl

  // Persist the chosen port so frontend dev server can discover it
  const portFile = path.resolve(__dirname, "..", ".backend-port")
  try {
    fs.writeFileSync(portFile, String(port), "utf8")
  } catch {
    // Non-critical — frontend will auto-detect via runtime probing
  }

  console.log(`\n🚀  Starting Medusa on http://localhost:${port}`)
  console.log(`📡  MEDUSA_BACKEND_URL=${updatedUrl}`)
  console.log(`📝  Port saved to .backend-port\n`)

  // Spawn the Medusa CLI
  const medusaCliPath = require.resolve("@medusajs/cli/cli.js")
  const child = spawn(process.execPath, [medusaCliPath, "develop"], {
    stdio: "inherit",
    env: process.env,
    shell: false,
    windowsHide: true,
  })

  child.on("error", (error) => {
    console.error("Failed to launch Medusa CLI:", error)
    process.exit(1)
  })

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`Medusa exited after receiving ${signal}`)
    }
    process.exit(code ?? 1)
  })

  // Handle SIGINT/SIGTERM gracefully
  process.on("SIGINT", () => {
    child.kill("SIGINT")
  })
  process.on("SIGTERM", () => {
    child.kill("SIGTERM")
  })
}

/**
 * Main: try ports sequentially, fall back if occupied.
 */
async function main() {
  // Load .env file so secret validation can find the values
  loadDotEnv()

  // Validate secrets before attempting to start
  validateSecrets()
  await verifyDatabaseConnection()

  let chosenPort = DEFAULT_PORT
  let foundPort = false

  for (let attempt = 0; attempt < MAX_FALLBACK_ATTEMPTS; attempt++) {
    const port = DEFAULT_PORT + attempt
    const available = await isPortAvailable(port)

    if (available) {
      chosenPort = port
      foundPort = true
      break
    }

    if (port !== DEFAULT_PORT) {
      // Already warned about the first conflict
      console.error(`  ⚠️  Port ${port} is also in use, trying next...`)
    } else {
      const processes = getProcessInfo(port)
      printDiagnostics(port, processes)
    }
  }

  if (!foundPort) {
    console.error(
      `\n❌  Could not find an available port after ${MAX_FALLBACK_ATTEMPTS} attempts.`
    )
    console.error(
      `   Tried ports ${DEFAULT_PORT}–${DEFAULT_PORT + MAX_FALLBACK_ATTEMPTS - 1}.\n`
    )
    process.exit(1)
  }

  if (chosenPort !== DEFAULT_PORT) {
    console.log(`   ✅  Using port ${chosenPort} instead.`)
    console.error(`   ⚠️  Update Stripe webhook URLs in Dashboard if they point to port ${DEFAULT_PORT}`)
    console.error(`   ⚠️  Navigate to http://localhost:${chosenPort}/app for Admin panel\n`)
  }

  startMedusa(chosenPort)
}

main().catch((err) => {
  console.error("Startup script error:", err)
  process.exit(1)
})
