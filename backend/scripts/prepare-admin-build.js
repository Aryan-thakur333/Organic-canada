const fs = require("fs")
const path = require("path")

const rootDir = path.resolve(__dirname, "..")
const generatedDir = path.join(rootDir, "src", "admin", "generated")
const tsFilePath = path.join(generatedDir, "eatsie-build.ts")
const jsonFilePath = path.join(rootDir, ".eatsie-admin-build.json")

const timestamp = Date.now()
const randomStr = Math.random().toString(36).substring(2, 8)
const buildId = `eatsie_build_${timestamp}_${randomStr}`
const builtAt = new Date().toISOString()

// 1. Ensure src/admin/generated directory exists
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir, { recursive: true })
}

// 2. Write src/admin/generated/eatsie-build.ts
const tsContent = `// Auto-generated build identity before Admin compilation
export const EATSIE_ADMIN_BUILD_ID = "${buildId}"
export const EATSIE_ADMIN_BUILT_AT = "${builtAt}"
`
fs.writeFileSync(tsFilePath, tsContent, "utf8")

// 3. Write .eatsie-admin-build.json
const jsonContent = JSON.stringify(
  {
    buildId,
    builtAt,
    runtime: "stable"
  },
  null,
  2
)
fs.writeFileSync(jsonFilePath, jsonContent, "utf8")

console.log(`[prepare-admin-build] Generated canonical build identity: ${buildId}`)
