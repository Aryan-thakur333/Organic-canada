const fs = require("fs")
const path = require("path")

const rootDir = path.resolve(__dirname, "..")
const jsonFilePath = path.join(rootDir, ".eatsie-admin-build.json")
const serverAdminDir = path.join(rootDir, ".medusa", "server", "public", "admin")
const targetJsonPath = path.join(serverAdminDir, "eatsie-build.json")
const targetLegacyJsonPath = path.join(serverAdminDir, "build-id.json")

if (!fs.existsSync(jsonFilePath)) {
  console.error("[finalize-admin-build] Error: .eatsie-admin-build.json not found! Run npm run admin:prepare-build first.")
  process.exit(1)
}

const metadataContent = fs.readFileSync(jsonFilePath, "utf8")
const metadata = JSON.parse(metadataContent)

if (!fs.existsSync(serverAdminDir)) {
  fs.mkdirSync(serverAdminDir, { recursive: true })
}

fs.writeFileSync(targetJsonPath, metadataContent, "utf8")
fs.writeFileSync(targetLegacyJsonPath, JSON.stringify({ buildId: metadata.buildId }, null, 2), "utf8")

console.log(`[finalize-admin-build] Finalized build metadata in .medusa/server/public/admin/eatsie-build.json: ${metadata.buildId}`)
