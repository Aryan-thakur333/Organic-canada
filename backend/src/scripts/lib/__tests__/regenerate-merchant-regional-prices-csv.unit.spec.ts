import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { APPROVAL_HEADERS } from "../merchant-regional-prices"
import { parseRegenerationSource, prepareRegeneratedRows, regenerateMerchantRegionalPricesCsv, validateGeneratedCsv } from "../regenerate-merchant-regional-prices-csv"

const header = APPROVAL_HEADERS.join(",")
const targets = [
  ["prod_01KXJNH57CMPRBEVGSAMB30EMF", "chocolate-mrly26sk", "chocolate", "variant_01KXJNH5ASR8XNZ9QSW29B8SJ7", "Standard"],
  ["prod_01KVSFB71XDNGFJN01RH3C2G1M", "organic-apples", "Organic Apples", "variant_01KVSFB75GZJ4N0B9SY6BXDTZC", "Standard"],
  ["prod_01KWW11N9K4XYTK17K7DKTSBX0", "organic-oil-mr9drod0", "Organic OIL", "variant_01KWW11NCJY9SGGGPJ5D7WB4FR", "Standard"],
]
const line = (row: string[], delimiter = ",") => [...row, "2200", "", "", "", "pending"].join(delimiter)
const source = (delimiter = ",") => [header.split(",").filter((value) => value !== "merchant_note").join(delimiter), ...targets.map((row) => line(row, delimiter)), ...Array.from({ length: 144 }, (_, index) => line([`prod_${index}`, `handle-${index}`, `Product ${index}`, `variant_${index}`, "Standard"], delimiter))].join("\n") + "\n"
const tempFile = (content: string) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "regen-price-csv-")); const file = path.join(dir, "merchant-approved-regional-prices.csv"); fs.writeFileSync(file, content, "utf8"); return file }

describe("regional price CSV regeneration", () => {
  it("parses tab-delimited source", () => expect(parseRegenerationSource(source("\t")).delimiter).toBe("tab"))
  it("parses comma-delimited source", () => expect(parseRegenerationSource(source()).delimiter).toBe("comma"))
  it("adds missing merchant_note", () => expect(parseRegenerationSource(source()).rows[0].merchant_note).toBe(""))
  it("removes UTF-8 BOM", () => expect(parseRegenerationSource(`\uFEFF${source()}`).headers[0]).toBe("product_id"))
  it("preserves blank cells", () => expect(parseRegenerationSource(source()).rows[0].current_usd_price).toBe(""))
  it("preserves quoted commas", () => expect(parseRegenerationSource(`${header}\nprod,handle,"Title, comma",variant,Standard,1,,,,pending,"note, comma"\n`).rows[0].merchant_note).toBe("note, comma"))
  it("preserves quoted double quotes", () => expect(parseRegenerationSource(`${header}\nprod,handle,"Title ""quote""",variant,Standard,1,,,,pending,""\n`).rows[0].product_title).toBe('Title "quote"'))
  it("supports Windows CRLF", () => expect(parseRegenerationSource(source().replaceAll("\n", "\r\n")).rows).toHaveLength(147))
  it("rejects missing source headers", () => expect(() => parseRegenerationSource("product_id,variant_id\nprod,var\n")).toThrow("Missing required source headers"))
  it("rejects invalid approval status", () => { const parsed = parseRegenerationSource(source()); parsed.rows[4].approval_status = "bad"; expect(() => prepareRegeneratedRows(parsed.rows)).toThrow("Invalid approval_status") })
  it("rejects duplicate variant IDs", () => { const parsed = parseRegenerationSource(source()); parsed.rows[4].variant_id = parsed.rows[3].variant_id; expect(() => prepareRegeneratedRows(parsed.rows)).toThrow("Duplicate variant_id") })
  it("produces the exact final header order", () => { const file = tempFile(source()); regenerateMerchantRegionalPricesCsv(file); expect(fs.readFileSync(file, "utf8").split("\n")[0]).toBe(header) })
  it("preserves the total row count", () => expect(prepareRegeneratedRows(parseRegenerationSource(source()).rows)).toHaveLength(147))
  it("approves exactly the three target variants", () => expect(prepareRegeneratedRows(parseRegenerationSource(source()).rows).filter((row) => row.approval_status === "approved")).toHaveLength(3))
  it("leaves all other rows pending", () => expect(prepareRegeneratedRows(parseRegenerationSource(source()).rows).filter((row) => row.approval_status === "pending")).toHaveLength(144))
  it("reparses generated CSV successfully", () => { const file = tempFile(source()); regenerateMerchantRegionalPricesCsv(file); expect(validateGeneratedCsv(fs.readFileSync(file, "utf8"))).toHaveLength(147) })
  it("does not replace the original file when validation fails", () => { const file = tempFile(source()); const original = fs.readFileSync(file, "utf8"); expect(() => regenerateMerchantRegionalPricesCsv(tempFile("bad\n"))).toThrow(); expect(fs.readFileSync(file, "utf8")).toBe(original) })
  it("creates a backup before replacement", () => { const file = tempFile(source()); const result = regenerateMerchantRegionalPricesCsv(file); expect(fs.existsSync(result.backupPath)).toBe(true) })
})
