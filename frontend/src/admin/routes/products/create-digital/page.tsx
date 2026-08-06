import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Plus } from "@medusajs/icons"
import { Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import axios from "axios"
import React, { FormEvent, useState } from "react"

export const config = defineRouteConfig({
  label: "Add Digital Product",
  icon: Plus,
})

type Status = { type: "success" | "error"; message: string } | null

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

const hasValidDecimalFormat = (value: string): boolean => /^\d+(\.\d{1,2})?$/.test(value.trim())

export default function CreateDigitalProductPage() {
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState("")
  const [prices, setPrices] = useState({ cad: "", usd: "" })
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    setFile(f)
  }

  const updatePrice = (code: "cad" | "usd", value: string) => {
    setPrices((current) => ({ ...current, [code]: value }))
  }

  const validate = () => {
    const errors: string[] = []
    const cad = prices.cad.trim()
    const usd = prices.usd.trim()

    if (!title.trim()) errors.push("Product title is required.")
    if (!file) errors.push("A digital asset file is required.")
    if (!cad) {
      errors.push("CAD price is required.")
    } else if (!hasValidDecimalFormat(cad)) {
      errors.push("CAD price must use a maximum of 2 decimals.")
    } else if (Number(cad) <= 0) {
      errors.push("CAD price must be greater than 0.")
    }

    if (usd) {
      if (!hasValidDecimalFormat(usd)) {
        errors.push("USD price must use a maximum of 2 decimals.")
      } else if (Number(usd) <= 0) {
        errors.push("USD price must be greater than 0 when provided.")
      }
    }

    return errors
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const errors = validate()
    if (errors.length > 0) {
      toast.error("Validation errors", { description: errors.join(". ") })
      return
    }

    if (!file || loading) {
      return
    }

    const cadPriceInput = prices.cad.trim()
    const usdPriceInput = prices.usd.trim()

    const metadata = {
      source: "standalone-admin-digital-product-wizard",
      digital_product: true,
    }

    const formData = new FormData()
    formData.append("file", file)
    formData.set("title", title.trim())
    formData.set("description", "")
    formData.set("version", "1.0.0")
    formData.set("download_expiry_days", "365")
    formData.set("download_limit", "5")
    formData.set("license_required", "false")
    formData.set("release_notes", "")
    formData.set("price", cadPriceInput)
    formData.set("price_cad", cadPriceInput)
    if (usdPriceInput) {
      formData.set("price_usd", usdPriceInput)
    }
    formData.set("metadata", JSON.stringify(metadata))

    const targetUrl =
      window.location.origin.includes(":9000")
        ? window.location.origin + "/admin/products/digital"
        : "http://localhost:9000/admin/products/digital"

    setLoading(true)
    setStatus(null)

    try {
      const adminToken = getAdminBearerToken()
      const headers: Record<string, string> = {
        Accept: "application/json",
      }

      if (adminToken) {
        headers.Authorization = `Bearer ${adminToken}`
      }

      const response = await axios.post(targetUrl, formData, {
        withCredentials: true,
        headers,
      })

      const result = response.data || {}
      const debug = result.debug || {}
      if (debug.cad_price_valid !== true || (usdPriceInput && debug.usd_price_valid !== true)) {
        throw new Error(debug.cad_price_valid !== true ? "DIGITAL_PRODUCT_CAD_PRICE_NOT_LINKED" : "DIGITAL_PRODUCT_USD_PRICE_NOT_LINKED")
      }

      toast.success("Digital product published ✅", {
        description: `CAD price linked ✅ | ${usdPriceInput ? "USD price linked ✅" : "USD price skipped"} | ${debug.sales_channel_linked ? "Sales channel linked ✅" : "Sales channel pending"} | Product ID: ${debug.product_id || result?.product?.id || ""}`,
      })
      setStatus({ type: "success", message: "Upload completed." })

      setTitle("")
      setPrices({ cad: "", usd: "" })
      setFile(null)
    } catch (err: any) {
      const statusCode = err?.response?.status
      const responseMessage = err?.response?.data?.message || err?.response?.data?.error
      const message =
        statusCode === 401
          ? "Unauthorized admin session. Please log out and log back in."
          : responseMessage || err?.message || "Upload failed."
      setStatus({ type: "error", message })
      toast.error("Upload failed", { description: message })
      console.error("[CreateDigitalProductPage] Upload error:", err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container className="max-w-4xl mx-auto p-8">
      <Heading level="h1">Add Digital Product</Heading>
      <Text className="text-ui-fg-subtle" size="small">
        Upload a private file and publish it to the active sales channel.
      </Text>

      <div className="mt-8">
        <form onSubmit={submit} className="flex flex-col gap-y-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Product title *</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="file">Digital asset file * (max 50MB)</Label>
            <input id="file" type="file" onChange={handleFileChange} accept="*/*" required />
            <Text size="small" className="text-ui-fg-subtle">
              Server enforces allowed mime-types.
            </Text>
          </div>

          <Button type="submit" isLoading={loading} disabled={loading}>
            Upload & Publish Digital Product
          </Button>

          {status && (
            <div
              className={
                status.type === "success"
                  ? "rounded-lg border border-ui-border-success bg-ui-bg-success p-4 text-ui-fg-base"
                  : "rounded-lg border border-ui-border-error bg-ui-bg-error p-4 text-ui-fg-base"
              }
            >
              {status.message}
            </div>
          )}
        </form>
      </div>
    </Container>
  )
}
