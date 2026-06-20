/**
 * Medusa v2 Admin User Management Utility
 *
 * A comprehensive script to manage admin (actor_type: "user") accounts.
 * Provides five modes:
 *
 *   list       – List all registered admin users
 *   create     – Create a new admin user via the auth module service
 *   reset-pwd  – Reset an existing admin user's password
 *   verify     – Verify login works via HTTP (requires running server)
 *   auto       – Ensure admin@gmail.com / Admin@123 exists and verify login
 *
 * Usage:
 *   npx medusa exec ./src/scripts/admin-users.ts -- list
 *   npx medusa exec ./src/scripts/admin-users.ts -- create admin@example.com MyP@ss1
 *   npx medusa exec ./src/scripts/admin-users.ts -- reset-pwd admin@example.com NewP@ss1
 *   npx medusa exec ./src/scripts/admin-users.ts -- verify admin@example.com MyP@ss1
 *   npx medusa exec ./src/scripts/admin-users.ts -- auto
 *
 * IMPORTANT: Passwords are pre-hashed with bcrypt before being stored in
 * provider_metadata because Medusa's auth-emailpass provider uses
 * bcrypt.compare() during login verification. Raw passwords stored
 * directly would cause "Invalid email or password" errors.
 */

import { Modules } from "@medusajs/framework/utils"
import type { ExecArgs } from "@medusajs/framework/types"
import bcrypt from "bcryptjs"

// ── Constants ────────────────────────────────────────────────────────────────

const SALT_ROUNDS = 10

// ── Helpers ─────────────────────────────────────────────────────────────────

function divider(title: string) {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`  ${title}`)
  console.log("=".repeat(60))
}

function green(msg: string) { console.log(`  ✅ ${msg}`) }
function red(msg: string)   { console.log(`  ❌ ${msg}`) }
function info(msg: string)  { console.log(`  ℹ️  ${msg}`) }

/**
 * Pre-hash the password so that the auth-emailpass provider's
 * bcrypt.compare() call succeeds during login.
 */
function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS)
}

// ── Auth Identity Query Helper ──────────────────────────────────────────────
//
// IMPORTANT: We use authModuleService.listAuthIdentities() instead of
// query.graph() because provider_identities is an internal MikroORM relation
// within the auth module, NOT a cross-module link. query.graph() only
// traverses links defined by defineLink().
//
// The filter { provider_identities: { entity_id, provider } } works because
// MikroORM natively supports filtering on related entities via the service.

async function findIdentityByEmail(
  authModuleService: any,
  email: string
): Promise<any | null> {
  const identities = await authModuleService.listAuthIdentities({
    provider_identities: { entity_id: email, provider: "emailpass" },
  })

  if (!identities || identities.length === 0) return null
  return identities[0]
}

async function listAllIdentities(authModuleService: any): Promise<any[]> {
  return (await authModuleService.listAuthIdentities({})) || []
}

// ── Modes ────────────────────────────────────────────────────────────────────

async function listAdmins(authModuleService: any) {
  divider("Listing Admin Users")

  const identities = await listAllIdentities(authModuleService)

  if (identities.length === 0) {
    info("No admin users found.")
    return
  }

  for (const identity of identities) {
    const pis = identity.provider_identities || []
    const providerIdentity = Array.isArray(pis) ? pis[0] : pis

    if (!providerIdentity) continue

    console.log(`  • ID:       ${identity.id}`)
    console.log(`    Email:    ${providerIdentity.entity_id || "N/A"}`)
    console.log(`    Provider: ${providerIdentity.provider || "N/A"}`)
    console.log(`    Created:  ${identity.created_at || "N/A"}`)
    console.log()
  }

  green(`Found ${identities.length} admin user(s)`)
}

async function createAdmin(
  authModuleService: any,
  email: string,
  password: string
) {
  divider(`Creating Admin User: ${email}`)

  // Check if already exists
  const existing = await findIdentityByEmail(authModuleService, email)
  if (existing) {
    info(`User ${email} already exists (ID: ${existing.id}). Use 'reset-pwd' to change password.`)
    return
  }

  // Pre-hash the password so the auth-emailpass provider's bcrypt.compare works
  const hashed = hashPassword(password)

  const identity = await authModuleService.createAuthIdentities({
    provider_identities: [
      {
        provider: "emailpass",
        entity_id: email,
        provider_metadata: {
          password: hashed,
        },
      },
    ],
  })

  if (identity) {
    green(`Admin user created: ${email}`)
  } else {
    red("Failed to create admin user.")
  }
}

async function resetPassword(
  authModuleService: any,
  email: string,
  newPassword: string
) {
  divider(`Resetting Password for: ${email}`)

  const identity = await findIdentityByEmail(authModuleService, email)

  if (!identity) {
    red(`No admin user found with email: ${email}`)
    info("Use the 'create' command to create one first.")
    return
  }

  // Pre-hash the new password
  const hashed = hashPassword(newPassword)

  await authModuleService.updateAuthIdentities({
    id: identity.id,
    provider_metadata: {
      password: hashed,
    },
  })

  green(`Password updated successfully for ${email}`)
}

async function verifyLogin(email: string, password: string) {
  divider(`Verifying Login: ${email}`)

  const baseUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

  try {
    const res = await fetch(`${baseUrl}/auth/user/emailpass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json()

    if (res.ok && data.token) {
      green(`Login successful! Token received (${data.token.length} chars)`)
      return true
    } else {
      red(`Login failed: ${data.message || res.statusText} (HTTP ${res.status})`)
      if (data.message) info(`Server says: ${data.message}`)
      return false
    }
  } catch (err: any) {
    red(`Connection error: ${err.message}`)
    info(`Make sure the server is running at ${baseUrl}`)
    return false
  }
}

// ── Auto Mode ────────────────────────────────────────────────────────────────

async function autoMode(authModuleService: any) {
  divider("Auto Mode – Ensuring Admin User Exists")

  const email = "admin@gmail.com"
  const password = "Admin@123"
  const hashed = hashPassword(password)

  // 1. Check if exists, create if not
  const existing = await findIdentityByEmail(authModuleService, email)

  if (existing) {
    green(`Admin user ${email} already exists (ID: ${existing.id}). Ensuring password is correct...`)

    // Re-apply the desired password hash to be safe
    await authModuleService.updateAuthIdentities({
      id: existing.id,
      provider_metadata: { password: hashed },
    })
    green(`Password hash refreshed for ${email}`)
  } else {
    info(`Creating admin user: ${email}`)
    await authModuleService.createAuthIdentities({
      provider_identities: [
        {
          provider: "emailpass",
          entity_id: email,
          provider_metadata: { password: hashed },
        },
      ],
    })
    green(`Admin user created: ${email}`)
  }

  // 2. Verify login via HTTP (requires running server)
  const loginOk = await verifyLogin(email, password)

  if (loginOk) {
    console.log(`\n  ──────────────────────────────────────────────`)
    console.log(`  Login credentials:`)
    console.log(`    Email:    ${email}`)
    console.log(`    Password: ${password}`)
    console.log(`  ──────────────────────────────────────────────`)
  }
}

// ── Entry Point ──────────────────────────────────────────────────────────────

export default async function adminUsers({ container }: ExecArgs) {
  const authModuleService = container.resolve(Modules.AUTH)

  const args = process.argv.slice(2)
  const mode = args[0] || "auto"

  switch (mode) {
    case "list":
      await listAdmins(authModuleService)
      break

    case "create":
      if (!args[1] || !args[2]) {
        red("Usage: npx medusa exec ./src/scripts/admin-users.ts -- create <email> <password>")
        return
      }
      await createAdmin(authModuleService, args[1], args[2])
      break

    case "reset-pwd":
      if (!args[1] || !args[2]) {
        red("Usage: npx medusa exec ./src/scripts/admin-users.ts -- reset-pwd <email> <new-password>")
        return
      }
      await resetPassword(authModuleService, args[1], args[2])
      break

    case "verify":
      if (!args[1] || !args[2]) {
        red("Usage: npx medusa exec ./src/scripts/admin-users.ts -- verify <email> <password>")
        return
      }
      await verifyLogin(args[1], args[2])
      break

    case "auto":
    default:
      await autoMode(authModuleService)
      break
  }
}
