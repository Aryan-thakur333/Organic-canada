import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { parseBoolean, parseCsvLine, readApprovedCsv, splitIds } from "../approved-pos-csv"

describe("approved POS CSV helpers", () => {
  it("parses quoted CSV cells and escaped quotes", () => {
    expect(parseCsvLine('ca,on,"Tax, approved","A ""reference"""')).toEqual(["ca", "on", "Tax, approved", 'A "reference"'])
  })

  it("requires every approval header", () => {
    const file = path.join(os.tmpdir(), `pos-approval-${Date.now()}.csv`)
    fs.writeFileSync(file, "country_code,approved_by\nca,merchant\n")
    expect(() => readApprovedCsv(file, ["country_code", "approval_reference"] as const)).toThrow("approval_reference")
    fs.unlinkSync(file)
  })

  it("normalizes booleans and selector lists", () => {
    expect(parseBoolean("YES")).toBe(true)
    expect(parseBoolean("off")).toBeNull()
    expect(splitIds("prod_1|prod_2;prod_1")).toEqual(["prod_1", "prod_2"])
  })
})
