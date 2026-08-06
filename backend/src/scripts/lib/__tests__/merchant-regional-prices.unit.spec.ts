import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { formatRowValidation, readMerchantApprovalCsv, RowIssue } from "../merchant-regional-prices"

const header = "product_id,product_handle,product_title,variant_id,variant_title,current_cad_price,approved_cad_price,current_usd_price,approved_usd_price,approval_status,merchant_note"
const approved = "prod_01KXJNH57CMPRBEVGSAMB30EMF,chocolate-mrly26sk,chocolate,variant_01KXJNH5ASR8XNZ9QSW29B8SJ7,Standard,2200,22,,16.99,approved,Testing approved CAD and USD price"

function fixture(content: string) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "merchant-price-csv-")), "prices.csv")
  fs.writeFileSync(file, content, "utf8")
  return file
}

describe("merchant regional price CSV parser", () => {
  it("maps a normal pending row and preserves blank price cells", () => {
    const { rows } = readMerchantApprovalCsv(fixture(`${header}\nprod,pending-product,Pending,variant,Standard,2200,,,,pending,\n`))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ approvalStatus: "pending", currentCadPrice: "2200", approvedCadPrice: "", currentUsdPrice: "", approvedUsdPrice: "", merchantNote: "" })
  })

  it("keeps a present CAD amount aligned when current USD is blank", () => {
    const { rows } = readMerchantApprovalCsv(fixture(`${header}\nprod,handle,Title,variant,Standard,2200,,,16.99,pending,\n`))
    expect(rows[0]).toMatchObject({ currentCadPrice: "2200", currentUsdPrice: "", approvedUsdPrice: "16.99" })
  })

  it("maps an empty merchant_note to an empty string", () => {
    const { rows } = readMerchantApprovalCsv(fixture(`${header}\nprod,handle,Title,variant,Standard,2200,,,,review,\n`))
    expect(rows[0].merchantNote).toBe("")
  })

  it("maps the approved sample using snake_case CSV headers", () => {
    const { rows } = readMerchantApprovalCsv(fixture(`${header}\n${approved}\n`))
    expect(rows[0]).toMatchObject({ approvalStatus: "approved", currentCadPrice: "2200", approvedCadPrice: "22", currentUsdPrice: "", approvedUsdPrice: "16.99" })
  })

  it("returns exactly one typed object per nonempty data row", () => {
    const { rows } = readMerchantApprovalCsv(fixture(`${header}\n${approved}\n\n${approved}\n`))
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.rowNumber)).toEqual([2, 3])
  })

  it("accepts a UTF-8 BOM and CRLF without shifting columns", () => {
    const { headers, rows } = readMerchantApprovalCsv(fixture(`\uFEFF${header}\r\n${approved}\r\n`))
    expect(headers).toContain("approval_status")
    expect(rows[0].merchantNote).toBe("Testing approved CAD and USD price")
  })

  it("supports CRLF input without a BOM", () => {
    const { rows } = readMerchantApprovalCsv(fixture(`${header}\r\n${approved}\r\n`))
    expect(rows[0].approvalStatus).toBe("approved")
  })

  it("rejects a missing approval_status header before processing rows", () => {
    const invalidHeader = header.replace(",approval_status", "")
    expect(() => readMerchantApprovalCsv(fixture(`${invalidHeader}\n${approved}\n`))).toThrow("Missing required CSV headers: approval_status")
  })

  it("rejects an invalid approval status without changing its column alignment", () => {
    const { rows } = readMerchantApprovalCsv(fixture(`${header}\nprod,handle,Title,variant,Standard,2200,22,,16.99,not-approved,\n`))
    expect(rows[0]).toMatchObject({ approvalStatus: "not-approved", currentUsdPrice: "", approvedUsdPrice: "16.99" })
  })

  it("reports tab-delimited input and a missing merchant_note header once", () => {
    const tabHeader = header.replace(",merchant_note", "").replaceAll(",", "\t")
    expect(() => readMerchantApprovalCsv(fixture(`${tabHeader}\n`))).toThrow("Missing required CSV headers: merchant_note")
  })

  it("does not silently turn a blank approval status into pending", () => {
    const { rows } = readMerchantApprovalCsv(fixture(`${header}\nprod,handle,Title,variant,Standard,2200,,,,,\n`))
    expect(rows[0].approvalStatus).toBe("")
  })

  it("keeps validation output row-specific instead of repeating global issues", () => {
    const first: RowIssue[] = [{ rowNumber: 2, productId: "prod_a", productHandle: "a", variantId: "variant_a", reason: "Invalid approval status" }]
    const second: RowIssue[] = [{ rowNumber: 3, productId: "prod_b", productHandle: "b", variantId: "variant_b", reason: "Stale CAD value" }]
    expect(formatRowValidation(first, false)).toBe("Invalid approval status")
    expect(formatRowValidation(second, false)).toBe("Stale CAD value")
    expect(formatRowValidation([], true)).toBe("VALID")
  })
})
