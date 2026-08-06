import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Plus } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Text, Textarea, toast } from "@medusajs/ui"
import { FormEvent, useState } from "react"

export const config = defineRouteConfig({
  label: "Add Digital Product",
  icon: Plus,
})

const ADMIN_TOKEN_STORAGE_KEYS = [
  "medusa_admin_token",
  "medusa_admin_access_token",
  "admin_token",
  "access_token",
  "jwt",
]

const readStringFromStorage = (storage: Storage | undefined, key: string): string => {
  if (!storage) {
    return ""
  }

  try {
    const value = storage.getItem(key)
    if (!value) {
      return ""
    }

    if (value.startsWith("{")) {
      const parsed = JSON.parse(value)
      return String(parsed?.token || parsed?.access_token || parsed?.jwt || "")
    }

    return value
  } catch {
    return ""
  }
}

const getAdminBearerToken = (): string => {
  if (typeof window === "undefined") {
    return ""
  }

  for (const key of ADMIN_TOKEN_STORAGE_KEYS) {
    const localToken = readStringFromStorage(window.localStorage, key)
    if (localToken) {
      return localToken
    }

    const sessionToken = readStringFromStorage(window.sessionStorage, key)
    if (sessionToken) {
      return sessionToken
    }
  }

  return ""
}

const getUploadErrorMessage = (error: any): string => {
  if (error?.name === "TypeError" && /fetch|network|failed/i.test(String(error?.message || ""))) {
    return "Backend is not reachable. Please restart Medusa."
  }

  return error?.message || "Upload failed."
}

const hasValidDecimalFormat = (value: string): boolean => /^\d+(\.\d{1,2})?$/.test(value.trim())

const CreateDigitalProductPage = () => {
  const [loading, setLoading] = useState(false)
  const [showValidationErrors, setShowValidationErrors] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [prices, setPrices] = useState({ cad: "", usd: "" })
  const [version, setVersion] = useState("1.0.0")
  const [downloadLimit, setDownloadLimit] = useState("5")
  const [downloadExpiryDays, setDownloadExpiryDays] = useState("365")
  const [licenseRequired, setLicenseRequired] = useState(false)
  const [handle, setHandle] = useState("")
  const [autoGenerateHandle, setAutoGenerateHandle] = useState(true)
  const [releaseNotes, setReleaseNotes] = useState("")

  const generateHandle = (val: string) => {
    return val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  }

  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (autoGenerateHandle) {
      setHandle(generateHandle(val))
    }
  }

  const updatePrice = (code: "cad" | "usd", value: string) => {
    setPrices((current) => ({ ...current, [code]: value }))
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const f = event.target.files?.[0] || null
    setFile(f)
  }

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : "0"
  const isOverLimit = file && file.size > 50 * 1024 * 1024

  const getValidationErrors = (): string[] => {
    const errors: string[] = []
    const cadPrice = prices.cad.trim()
    const usdPrice = prices.usd.trim()

    if (!title.trim()) errors.push("Product title is required.")
    if (!file) errors.push("A digital asset file is required.")
    if (isOverLimit) errors.push("File exceeds 50 MB limit.")

    if (!cadPrice) {
      errors.push("CAD price is required.")
    } else if (!hasValidDecimalFormat(cadPrice)) {
      errors.push("CAD price must use a maximum of 2 decimals.")
    } else if (Number(cadPrice) <= 0) {
      errors.push("CAD price must be greater than 0.")
    }

    if (usdPrice) {
      if (!hasValidDecimalFormat(usdPrice)) {
        errors.push("USD price must use a maximum of 2 decimals.")
      } else if (Number(usdPrice) <= 0) {
        errors.push("USD price must be greater than 0 when provided.")
      }
    }

    return errors
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setShowValidationErrors(true)

    const errors = getValidationErrors()
    if (errors.length > 0) {
      toast.error("Validation errors", {
        description: errors.join(". "),
      })
      return
    }

    if (!file || loading) {
      return
    }

    setLoading(true)

    try {
      const cadPriceInput = prices.cad.trim()
      const usdPriceInput = prices.usd.trim()

      console.log("[Digital Product Admin] Raw price payload:", {
        cad: cadPriceInput,
        usd: usdPriceInput || null,
      })

      const metadata = {
        source: "medusa-admin-digital-product-wizard",
        handle: handle.trim() || undefined,
        digital_product: true,
      }

      const form = new FormData()
      form.append("file", file)
      form.set("title", title.trim())
      form.set("description", description.trim() || "")
      form.set("version", version || "1.0.0")
      form.set("download_expiry_days", downloadExpiryDays)
      form.set("download_limit", downloadLimit)
      form.set("license_required", licenseRequired ? "true" : "false")
      form.set("release_notes", releaseNotes.trim() || "")
      form.set("price", cadPriceInput)
      form.set("price_cad", cadPriceInput)
      if (usdPriceInput) {
        form.set("price_usd", usdPriceInput)
      }
      form.set("metadata", JSON.stringify(metadata))

      const adminToken = getAdminBearerToken()
      const headers: Record<string, string> = {
        Accept: "application/json",
      }

      if (adminToken) {
        headers.Authorization = `Bearer ${adminToken}`
      }

      const productRes = await fetch("/admin/products/digital", {
        method: "POST",
        credentials: "include",
        body: form,
        headers,
      })

      const productData = await productRes.json().catch(() => ({}))
      if (!productRes.ok) {
        if (productRes.status === 401) {
          throw new Error("Admin session expired. Please login again.")
        }

        if (productRes.status >= 500) {
          console.error("[Digital Product Upload] Backend error response:", productData)
          throw new Error(productData.message || "Backend failed while creating the digital product.")
        }

        throw new Error(productData.message || productData.error || "Failed to create digital product.")
      }

      const debug = productData?.debug || {}
      const cadPriceValid =
        debug.cad_price_valid === true &&
        Number(debug.cad_price_in_cents) === Number(debug.cad_stored_amount)
      const usdPriceValid =
        !usdPriceInput ||
        (
          debug.usd_price_valid === true &&
          Number(debug.usd_price_in_cents) === Number(debug.usd_stored_amount)
        )

      if (!cadPriceValid || !usdPriceValid) {
        console.error("[Digital Product Upload] Price verification failed:", debug)
        throw new Error(!cadPriceValid ? "DIGITAL_PRODUCT_CAD_PRICE_NOT_LINKED" : "DIGITAL_PRODUCT_USD_PRICE_NOT_LINKED")
      }

      console.log("[Digital Product Created Successfully]", {
        product_id: debug.product_id || productData?.product?.id,
        status: debug.status,
        sales_channel_linked: debug.sales_channel_linked,
        variant_count: debug.variant_count,
        cad_input_price: debug.cad_input_price,
        cad_price_in_cents: debug.cad_price_in_cents,
        cad_stored_amount: debug.cad_stored_amount,
        cad_price_valid: debug.cad_price_valid,
        usd_input_price: debug.usd_input_price,
        usd_price_in_cents: debug.usd_price_in_cents,
        usd_stored_amount: debug.usd_stored_amount,
        usd_price_valid: debug.usd_price_valid,
        metadata_is_digital: debug.metadata_is_digital,
      })

      const productId = debug.product_id || productData?.product?.id || ""
      const cadStatus = debug.cad_price_valid ? "CAD price linked ✅" : "CAD price missing"
      const usdStatus = usdPriceInput
        ? (debug.usd_price_valid ? "USD price linked ✅" : "USD price missing")
        : "USD price skipped"
      const salesChannelStatus = debug.sales_channel_linked ? "Sales channel linked ✅" : "Sales channel pending"

      toast.success("Digital product published ✅", {
        description: `${cadStatus} | ${usdStatus} | ${salesChannelStatus} | Product ID: ${productId}`,
      })

      setTitle("")
      setDescription("")
      setHandle("")
      setPrices({ cad: "", usd: "" })
      setVersion("1.0.0")
      setDownloadLimit("5")
      setDownloadExpiryDays("365")
      setLicenseRequired(false)
      setReleaseNotes("")
      setFile(null)

      const fileInput = document.getElementById("file") as HTMLInputElement
      if (fileInput) fileInput.value = ""

      setShowValidationErrors(false)
    } catch (error: any) {
      toast.error("Upload failed", { description: getUploadErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container className="max-w-4xl mx-auto p-8">
      <form onSubmit={submit} className="flex flex-col gap-y-6">
        <div className="mb-2">
          <Heading level="h1">Add Digital Product</Heading>
          <Text className="text-ui-fg-subtle">
            Upload a private PDF, guide, eBook, software, or any downloadable file and publish it to the active sales channel.
          </Text>
        </div>

        <div className="flex flex-col gap-4 border rounded-lg p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Product title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              required
              placeholder="e.g. Organic Beekeeper's Guide"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="handle">URL handle</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="handle"
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value)
                  setAutoGenerateHandle(false)
                }}
                placeholder="auto-generated"
                className="flex-1"
              />
              <label className="flex items-center gap-1 text-xs text-ui-fg-subtle cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={autoGenerateHandle}
                  onChange={(e) => {
                    setAutoGenerateHandle(e.target.checked)
                    if (e.target.checked) {
                      setHandle(generateHandle(title))
                    }
                  }}
                />
                Auto
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what customers will receive..."
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="release_notes">Release Notes (optional)</Label>
            <Textarea
              id="release_notes"
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              placeholder="What's new in this version?"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 border rounded-lg p-5">
          <div>
            <Heading level="h2" className="text-base">Pricing</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Set prices for active currencies. CAD is required (primary store currency).
            </Text>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="price-cad">Canada (CAD) *</Label>
              <Input
                id="price-cad"
                value={prices.cad}
                onChange={(e) => updatePrice("cad", e.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="78.00"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="price-usd">United States (USD)</Label>
              <Input
                id="price-usd"
                value={prices.usd}
                onChange={(e) => updatePrice("usd", e.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="78.00"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border rounded-lg p-5">
          <Heading level="h2" className="text-base">Download Settings</Heading>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="download_limit">Download limit (0 = unlimited)</Label>
              <Input
                id="download_limit"
                value={downloadLimit}
                onChange={(e) => setDownloadLimit(e.target.value)}
                type="number"
                min="0"
                step="1"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="download_expiry_days">Expiry (days)</Label>
              <Input
                id="download_expiry_days"
                value={downloadExpiryDays}
                onChange={(e) => setDownloadExpiryDays(e.target.value)}
                type="number"
                min="1"
                step="1"
              />
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-ui-bg-subtle transition-colors">
                <input
                  type="checkbox"
                  checked={licenseRequired}
                  onChange={(e) => setLicenseRequired(e.target.checked)}
                  className="accent-ui-primary"
                />
                <div>
                  <Text size="small" weight="plus">Generate license key</Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    Each purchase gets a unique license key
                  </Text>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border border-dashed rounded-lg p-6">
          <Label htmlFor="file">Digital asset file * (maximum 50 MB)</Label>
          <input
            id="file"
            type="file"
            required
            onChange={handleFileChange}
            accept=".pdf,.zip,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
          />
          {file && (
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-3">
                <Badge size="small" color={isOverLimit ? "red" : "green"}>
                  {file.name}
                </Badge>
                <Text size="small" className="text-ui-fg-subtle">
                  {fileSizeMB} MB
                </Text>
                <Text size="small" className="text-ui-fg-muted">
                  {file.type || "Unknown type"}
                </Text>
              </div>
              {isOverLimit && (
                <Text size="small" className="text-ui-fg-error">
                  File exceeds 50 MB limit. Please choose a smaller file.
                </Text>
              )}
            </div>
          )}
          {!file && (
            <Text size="small" className="text-ui-fg-subtle">
              Allowed: PDF, ZIP, DOCX, XLSX, PNG, JPG, TXT
            </Text>
          )}
        </div>

        {showValidationErrors && getValidationErrors().length > 0 && (
          <div className="bg-ui-bg-subtle border border-ui-border-error rounded-lg p-4">
            <Text size="small" className="text-ui-fg-error font-medium">
              Please fix the following before submitting:
            </Text>
            <ul className="list-disc ml-5 mt-2">
              {getValidationErrors().map((err, i) => (
                <li key={i} className="text-xs text-ui-fg-error">{err}</li>
              ))}
            </ul>
          </div>
        )}

        <Button type="submit" isLoading={loading} disabled={loading || Boolean(isOverLimit) || !file}>
          {loading ? "Uploading & publishing..." : "Upload & Publish Digital Product"}
        </Button>
      </form>
    </Container>
  )
}

export default CreateDigitalProductPage
