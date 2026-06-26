import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows"

const usage = () => {
  console.log("Admin user utility")
  console.log("  list")
  console.log("  create <email> <password> [first-name] [last-name]")
  console.log("  reset-password <email> <new-password>")
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const isValidPassword = (value: string) =>
  value.length >= 8 &&
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value)

function getCommandArgs() {
  const scriptIndex = process.argv.findIndex((arg) =>
    /admin-users\.(?:ts|js)$/i.test(arg.replace(/\\/g, "/"))
  )
  const args = scriptIndex >= 0
    ? process.argv.slice(scriptIndex + 1)
    : process.argv.slice(2)

  // `medusa exec script -- command` preserves the separator in process.argv,
  // while `medusa exec script command` does not. Accept both forms.
  while (args[0] === "--") args.shift()
  return args
}

export default async function adminUsers({ container }: ExecArgs) {
  const authService = container.resolve(Modules.AUTH) as any
  const userService = container.resolve(Modules.USER) as any
  const argv = getCommandArgs()
  const [mode = "list", rawEmail, password, firstName = "Admin", lastName = "User"] = argv

  if (mode === "list") {
    const users = await userService.listUsers({}, { select: ["id", "email", "first_name", "last_name"] })
    if (!users.length) {
      console.log("No Medusa admin users found.")
      return
    }
    console.table(users.map((user: any) => ({
      id: user.id,
      email: user.email,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
    })))
    return
  }

  if (mode !== "create" && mode !== "reset-password") {
    usage()
    throw new Error(`Unknown mode: ${mode}`)
  }

  if (!rawEmail || !isValidEmail(normalizeEmail(rawEmail))) {
    throw new Error("A valid email address is required")
  }

  if (!password || !isValidPassword(password)) {
    throw new Error(
      "Password must be at least 8 characters and include uppercase, lowercase, number, and special characters"
    )
  }

  const email = normalizeEmail(rawEmail)

  if (mode === "reset-password") {
    const result = await authService.updateProvider("emailpass", {
      entity_id: email,
      password,
    })
    if (!result.success) throw new Error(result.error || "Password reset failed")
    console.log(`Successfully reset password for Medusa admin ${email}.`)
    return
  }

  const existingUsers = await userService.listUsers({ email })
  if (existingUsers.length) {
    throw new Error(`Admin user ${email} already exists; use reset-password if needed`)
  }

  // Use the configured provider so password hashing stays compatible with the
  // installed Medusa version. Directly writing bcrypt hashes caused the 401s.
  const registration = await authService.register("emailpass", {
    body: { email, password },
  })
  if (!registration.success || !registration.authIdentity) {
    throw new Error(registration.error || "Unable to create admin auth identity")
  }

  const { result: user } = await createUserAccountWorkflow(container).run({
    input: {
      authIdentityId: registration.authIdentity.id,
      userData: { email, first_name: firstName, last_name: lastName },
    },
  })
  console.log(`Successfully created linked Medusa admin ${user.email} (${user.id}).`)
  console.log("Admin login URL: http://localhost:9000/app")
}
