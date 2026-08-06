import * as fs from "fs"
import * as path from "path"

export function resolveProjectReportsDir(cwd = process.cwd()) {
  const configured = process.env.EATSIE_PROJECT_ROOT?.trim()
  if (configured && path.isAbsolute(configured)) return path.join(configured, "reports")
  const root = path.basename(cwd).toLowerCase() === "backend" ? path.dirname(cwd) : cwd
  return path.join(root, "reports")
}

export function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let value = ""
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index++
      } else {
        quoted = !quoted
      }
    } else if (character === "," && !quoted) {
      cells.push(value.trim())
      value = ""
    } else {
      value += character
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value")
  cells.push(value.trim())
  return cells
}

export function readApprovedCsv<THeader extends string>(filePath: string, requiredHeaders: readonly THeader[]) {
  if (!fs.existsSync(filePath)) throw new Error(`Approval CSV not found: ${filePath}`)
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) throw new Error(`Approval CSV is empty: ${filePath}`)
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().trim())
  const missing = requiredHeaders.filter((header) => !headers.includes(header))
  if (missing.length) throw new Error(`Missing required CSV headers: ${missing.join(", ")}`)
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line)
    return {
      rowNumber: rowIndex + 2,
      values: Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()])) as Record<THeader | string, string>,
    }
  })
}

export function splitIds(value: string) {
  return [...new Set(value.split(/[|;]/).map((item) => item.trim()).filter(Boolean))]
}

export function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase()
  if (["true", "yes", "1"].includes(normalized)) return true
  if (["false", "no", "0"].includes(normalized)) return false
  return null
}
