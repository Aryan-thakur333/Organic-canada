import { Button, Container, Heading, Input, Label, Text, Textarea, Badge, toast } from "@medusajs/ui"
import { FormEvent, useState, useEffect } from "react"

interface PriceField {
  currency_code: string
  label: string
  value: string
}

const CreateDigitalProductPage = () => {
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [prices, setPrices] = useState<PriceField[]>([])
  const [version, setVersion] = useState("1.0.0")
  const [downloadLimit, setDownloadLimit] = useState("5")
  const [downloadExpiryDays, setDownloadExpiryDays] = useState("365")
  const [licenseRequired, setLicenseRequired] = useState(false)
  const [handle, setHandle] = useState("")
  const [autoGenerateHandle, setAutoGenerateHandle] = useState(true)
  const [releaseNotes, setReleaseNotes] = useState("")

  // Load active regions/currencies from Medusa
  useEffect(() => {
    const loadCurrencies = async () => {
      try {
        const response = await fetch("/admin/regions", {
          credentials: "include",
        })
        const data = await response.json()
        if (data?.regions) {
          // Collect unique currency codes from all regions
          const currencySet = new Set<string>()
          const currencyLabels: Record<string, string> = {}
          for (const region of data.regions) {
            if (region.currency_code) {
              currencySet.add(region.currency_code.toLowerCase())
              currencyLabels[region.currency_code.toLowerCase()] = region.name || region.currency_code.toUpperCase()
            }
          }
          // Also check if "usd" or "eur" exist, add if not
          if (!currencySet.has("cad")) {
            currencySet.add("cad")
            currencyLabels["cad"] = "Canada (CAD)"
          }
          // Create price fields from discovered currencies
          const priceFields: PriceField[] = Array.from(currencySet).map((code) => ({
            currency_code: code,
            label: currencyLabels[code] || code.toUpperCase(),
            value: "",
          }))
          setPrices(priceFields)
        }
      } catch (err) {
        console.error("Failed to load regions for currencies", err)
        // Fallback to common currencies
        setPrices([
          { currency_code: "cad", label: "Canada (CAD)", value: "" },
          { currency_code: "usd", label: "United States (USD)", value: "" },
          { currency_code: "eur", label: "Europe (EUR)", value: "" },
        ])
      }
    }
    loadCurrencies()
  }, [])

  // Auto-generate handle from title
  const generateHandle = (val: string) => {
    return val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  }

  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (autoGenerateHandle) {
      setHandle(generateHandle(val))
    }
  }

  const updatePrice = (code: string, value: string) => {
    setPrices(prices.map(p => p.currency_code === code ? { ...p, value } : p))
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const f = event.target.files?.[0] || null
    setFile(f)
  }

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(2) : "0"
  const isOverLimit = file && file.size > 50 * 1024 * 1024

  // Validation
  const getValidationErrors = (): string[] => {
    const errors: string[] = []
    if (!title.trim()) errors.push("Product title is required.")
    if (!file) errors.push("A digital asset file is required.")
    if (isOverLimit) errors.push("File exceeds 50 MB limit.")
    // Check if at least one price is set
    const hasPrice = prices.some(p => p.value && parseFloat(p.value) > 0)
    if (!hasPrice) errors.push("At least one price is required (e.g. CAD).")
    // CAD specifically
    const cadPrice = prices.find(p => p.currency_code === "cad")
    if (!cadPrice || !cadPrice.value || parseFloat(cadPrice.value) <= 0) {
      errors.push("CAD price is required (primary store currency).")
    }
    return errors
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const errors = getValidationErrors()
    if (errors.length > 0) {
      toast.error("Validation errors", {
        description: errors.join(". "),
      })
      return
    }

    if (!file) {
      toast.error("Validation error", { description: "A digital asset file is required." })
      return
    }

    setLoading(true)

    try {
      // ── Step 1: Upload file to Medusa Admin Upload API ──
      const uploadForm = new FormData()
      uploadForm.set("file", file)

      const uploadRes = await fetch("/admin/uploads", {
        method: "POST",
        credentials: "include",
        body: uploadForm,
      })

      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) {
        throw new Error(uploadData.message || "Failed to upload file")
      }

      // Medusa returns an array of uploaded files
      const uploadedFile = Array.isArray(uploadData.uploads) ? uploadData.uploads[0] : uploadData
      const storageKey = uploadedFile?.url || uploadedFile?.key || uploadedFile?.path
      if (!storageKey) {
        throw new Error("File uploaded but no storage key returned")
      }

      // ── Step 2: Build multi-currency prices array ──
      const pricesPayload = prices
        .filter(p => p.value && parseFloat(p.value) > 0)
        .map(p => ({
          currency_code: p.currency_code,
          amount: Math.round(parseFloat(p.value) * 100), // convert to cents
        }))

      if (!pricesPayload.length) {
        throw new Error("At least one price is required")
      }

      // ── Step 3: Create product with digital asset metadata ──
      const productPayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        handle: handle.trim() || undefined,
        is_digital_product: true,
        variants: [
          {
            title: "Default",
            manage_inventory: false,
            prices: pricesPayload,
            metadata: {
              digital_asset_key: storageKey,
              file_name: file.name,
              mime_type: file.type || "application/octet-stream",
              file_size: file.size,
              version: version || "1.0.0",
              download_limit: parseInt(downloadLimit, 10) || 5,
              download_expiry_days: parseInt(downloadExpiryDays, 10) || 365,
              license_required: Boolean(licenseRequired),
              release_notes: releaseNotes.trim() || undefined,
            },
          },
        ],
      }

      const productRes = await fetch("/admin/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productPayload),
      })

      const productData = await productRes.json()
      if (!productRes.ok) {
        throw new Error(productData.message || "Failed to create digital product")
      }

      toast.success("Digital product published", {
        description: productData.product?.title || title,
      })

      // Reset form
      setTitle("")
      setDescription("")
      setHandle("")
      setPrices(prices.map(p => ({ ...p, value: "" })))
      setVersion("1.0.0")
      setDownloadLimit("5")
      setDownloadExpiryDays("365")
      setLicenseRequired(false)
      setReleaseNotes("")
      setFile(null)
    } catch (error: any) {
      toast.error("Upload failed", { description: error.message })
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

        {/* ── Basic Info ─────────────────────────────────────────── */}
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

        {/* ── Dynamic Pricing ──────────────────────────────────────── */}
        <div className="flex flex-col gap-4 border rounded-lg p-5">
          <div>
            <Heading level="h2" className="text-base">Pricing</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Set prices for active currencies. CAD is required (primary store currency).
            </Text>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {prices.map((price) => (
              <div key={price.currency_code} className="flex flex-col gap-2">
                <Label htmlFor={`price-${price.currency_code}`}>
                  {price.label}
                  {price.currency_code === "cad" && " *"}
                </Label>
                <div className="relative">
                  <Input
                    id={`price-${price.currency_code}`}
                    value={price.value}
                    onChange={(e) => updatePrice(price.currency_code, e.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={`0.00 ${price.currency_code.toUpperCase()}`}
                    required={price.currency_code === "cad"}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Digital Settings ────────────────────────────────────── */}
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

        {/* ── File Upload ─────────────────────────────────────────── */}
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

        {/* ── Form Actions ─────────────────────────────────────────── */}
        {getValidationErrors().length > 0 && (
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

        <Button type="submit" isLoading={loading} disabled={isOverLimit || !file}>
          {loading ? "Uploading & publishing..." : "Upload & Publish Digital Product"}
        </Button>
      </form>
    </Container>
  )
}

export default CreateDigitalProductPage