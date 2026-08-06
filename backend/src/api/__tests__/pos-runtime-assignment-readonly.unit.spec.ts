import fs from "fs"
import path from "path"

const root = path.resolve(__dirname, "..", "pos")
const runtimeRoutes = [
  "bootstrap/route.ts",
  "carts/route.ts",
  "carts/[id]/checkout/route.ts",
  "scan/route.ts",
  "registers/[id]/open/route.ts",
  "registers/[id]/close/route.ts",
  "auth/session/route.ts",
]
const assignmentWriteMethods = /(?:create|update|delete|softDelete|restore)PosOperatorAssignments/

describe("POS runtime assignment configuration safety", () => {
  test("normal POS runtime routes do not mutate register assignments", () => {
    for (const relativePath of runtimeRoutes) {
      const source = fs.readFileSync(path.join(root, relativePath), "utf8")
      expect(source).not.toMatch(assignmentWriteMethods)
    }
  })
})
