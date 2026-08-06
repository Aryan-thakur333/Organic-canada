import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect, useMemo, useState } from "react"

type ProductVariant = {
  id: string
  title?: string | null
  sku?: string | null
}

type ProductLike = {
  id: string
  title?: string | null
  variants?: ProductVariant[]
}

type PosChannelAvailability = {
  key: "canada" | "usa"
  label: string
  register_id: string
  register_name: string
  sales_channel_id: string
  stock_location_id: string
  currency_code: string
  register_found: boolean
  available: boolean
}

const DEFAULT_POS_AVAILABILITY: PosChannelAvailability[] = [
  { key: "canada", label: "Canada POS", register_id: "", register_name: "Canada POS", sales_channel_id: "", stock_location_id: "", currency_code: "cad", register_found: false, available: false },
  { key: "usa", label: "USA POS", register_id: "", register_name: "USA POS", sales_channel_id: "", stock_location_id: "", currency_code: "usd", register_found: false, available: false },
]

function posQrPayload(variantId: string) {
  return `EATSIE-POS:${variantId}`
}

function qrLabelUrl(variantId: string) {
  const params = new URLSearchParams({
    format: "svg",
    label_mode: "POS_QR",
    include_text: "true",
    include_sku: "true",
    width: "50",
    height: "35",
  })
  return `/admin/barcodes/variants/${encodeURIComponent(variantId)}/label?${params.toString()}`
}

const ProductPosQrWidget = (props: { product?: ProductLike; data?: ProductLike }) => {
  const sourceProduct = props.product || props.data
  const [product, setProduct] = useState<ProductLike | null>(sourceProduct || null)
  const [loading, setLoading] = useState(false)
  const [availability, setAvailability] = useState<PosChannelAvailability[]>(DEFAULT_POS_AVAILABILITY)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [bulkPending, setBulkPending] = useState<string | null>(null)
  const [removePending, setRemovePending] = useState<string | null>(null)
  const [testStatusByVariant, setTestStatusByVariant] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    const hydrateProduct = async () => {
      if (!sourceProduct?.id) return
      if (Array.isArray(sourceProduct.variants)) {
        setProduct(sourceProduct)
        return
      }

      setLoading(true)
      try {
        const response = await fetch(`/admin/products/${sourceProduct.id}?fields=id,title,variants.id,variants.title,variants.sku`, {
          credentials: "include",
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json()
        if (active) setProduct(payload.product || sourceProduct)
      } catch {
        if (active) setProduct(sourceProduct)
      } finally {
        if (active) setLoading(false)
      }
    }

    hydrateProduct()
    return () => {
      active = false
    }
  }, [sourceProduct])

  const refreshAvailability = async () => {
    if (!sourceProduct?.id) return
    setAvailabilityLoading(true)
    try {
      const response = await fetch(`/admin/pos/product-availability?product_id=${encodeURIComponent(sourceProduct.id)}`, {
        credentials: "include",
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      setAvailability(payload.pos_channels || [])
    } catch {
      setAvailability(DEFAULT_POS_AVAILABILITY)
    } finally {
      setAvailabilityLoading(false)
    }
  }

  useEffect(() => {
    refreshAvailability()
  }, [sourceProduct?.id])

  const variants = useMemo(() => {
    return (product?.variants || []).filter((variant) => Boolean(variant?.id))
  }, [product])

  const copyCode = async (variant: ProductVariant) => {
    await navigator.clipboard.writeText(posQrPayload(variant.id))
    toast.success("POS QR code copied")
  }

  const printQr = (variant: ProductVariant) => {
    const payload = posQrPayload(variant.id)
    const labelUrl = qrLabelUrl(variant.id)
    const printWindow = window.open("", "_blank", "width=520,height=720")
    if (!printWindow) {
      toast.error("Print window was blocked")
      return
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>POS QR - ${variant.id}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            .label { border: 1px solid #d1d5db; display: inline-block; padding: 16px; text-align: center; }
            img { width: 280px; max-width: 100%; display: block; margin: 0 auto 12px; }
            .payload { font-family: monospace; font-size: 12px; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="label">
            <h1>${product?.title || "Product"}</h1>
            <p>${variant.title || "Default variant"} · SKU ${variant.sku || "No SKU"}</p>
            <img src="${labelUrl}" alt="POS QR code" />
            <p class="payload">${payload}</p>
          </div>
          <script>
            window.addEventListener("load", () => {
              window.print();
            });
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  const testScan = async (variant: ProductVariant) => {
    const payload = posQrPayload(variant.id)
    if (!payload.startsWith("EATSIE-POS:") || payload !== `EATSIE-POS:${variant.id}`) {
      setTestStatusByVariant((current) => ({ ...current, [variant.id]: "FAILED" }))
      toast.error("POS QR payload failed validation")
      return
    }

    const response = await fetch(qrLabelUrl(variant.id), { credentials: "include" })
    if (!response.ok) {
      setTestStatusByVariant((current) => ({ ...current, [variant.id]: `FAILED HTTP ${response.status}` }))
      toast.error("POS QR render test failed")
      return
    }
    setTestStatusByVariant((current) => ({ ...current, [variant.id]: "PASS" }))
    toast.success("POS QR payload and render test passed")
  }

  const addToPosChannel = async (channel: PosChannelAvailability) => {
    if (!sourceProduct?.id || !channel.register_found) return
    setActionPending(channel.key)
    try {
      const response = await fetch("/admin/pos/product-availability", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: sourceProduct.id, channel: channel.key }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`)
      setAvailability(payload.availability?.pos_channels || [])
      toast.success(`${product?.title || "Product"} is available in ${channel.label}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to add product to ${channel.label}`)
    } finally {
      setActionPending(null)
    }
  }

  const removeFromPosChannel = async (channel: PosChannelAvailability) => {
    if (!sourceProduct?.id || !channel.register_found || !channel.available) return
    const confirmed = window.confirm(`Remove this product from ${channel.label}? This only removes the POS sales-channel association and will not remove Default, online, or marketplace channels.`)
    if (!confirmed) return
    setRemovePending(channel.key)
    try {
      const response = await fetch("/admin/pos/product-availability", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: sourceProduct.id, channel: channel.key, action: "remove", confirm: true }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`)
      setAvailability(payload.availability?.pos_channels || [])
      toast.success(`${product?.title || "Product"} was removed from ${channel.label}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to remove product from ${channel.label}`)
    } finally {
      setRemovePending(null)
    }
  }

  const bulkAddToPosChannel = async (channel: PosChannelAvailability) => {
    if (!channel.register_found) return
    const confirmed = window.confirm(`Add all active sellable products to ${channel.label}? Draft, deleted, and unsupported products will be skipped.`)
    if (!confirmed) return
    setBulkPending(channel.key)
    try {
      const response = await fetch("/admin/pos/product-availability/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channel.key, confirm: true }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`)
      await refreshAvailability()
      toast.success(`${channel.label} bulk update: ${payload.linked || 0} linked, ${payload.alreadyLinked || 0} already linked, ${(payload.skipped || []).length} skipped`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to bulk add products to ${channel.label}`)
    } finally {
      setBulkPending(null)
    }
  }

  if (!sourceProduct?.id) return null

  return (
    <Container className="mt-4 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <Heading level="h2" className="text-base">POS QR Codes</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Variant QR payloads are register-safe pointers only. They do not include price, inventory, customer, token, or region data.
          </Text>
        </div>
        <Badge size="small" color="green">
          {variants.length} variant{variants.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="mb-6 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
        <div className="flex flex-col gap-1">
          <Heading level="h3" className="text-sm">Manage POS Availability</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Product-level Sales Channel Availability. Adding a POS channel is additive and preserves Default, online, and marketplace channels.
          </Text>
        </div>

        {availabilityLoading ? (
          <Text size="small" className="mt-4 text-ui-fg-subtle">Loading POS availability...</Text>
        ) : availability.length === 0 ? (
          <Text size="small" className="mt-4 text-ui-fg-subtle">No active Canada or USA POS registers were found.</Text>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {availability.map((channel) => (
              <div key={channel.key} className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Text className="font-medium">{channel.label}</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {channel.register_name} · {channel.currency_code.toUpperCase()} · {channel.sales_channel_id || "No sales channel"}
                    </Text>
                  </div>
                  <Badge size="small" color={channel.available ? "green" : "red"}>
                    {channel.available ? "Available" : "Not Available"}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {channel.available ? (
                    <>
                      <Button size="small" variant="secondary" type="button" disabled>
                        Available
                      </Button>
                      <Button
                        size="small"
                        variant="transparent"
                        type="button"
                        disabled={!channel.register_found || removePending === channel.key}
                        onClick={() => removeFromPosChannel(channel)}
                      >
                        {removePending === channel.key ? "Removing..." : `Remove from ${channel.label}`}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="small"
                      variant="secondary"
                      type="button"
                      disabled={!channel.register_found || actionPending === channel.key}
                      onClick={() => addToPosChannel(channel)}
                    >
                      {actionPending === channel.key ? "Adding..." : `Add to ${channel.label}`}
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="transparent"
                    type="button"
                    disabled={!channel.register_found || bulkPending === channel.key}
                    onClick={() => bulkAddToPosChannel(channel)}
                  >
                    {bulkPending === channel.key ? "Bulk adding..." : `Add all active sellable products to ${channel.label}`}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <Text size="small" className="text-ui-fg-subtle">Loading POS QR codes...</Text>
      ) : variants.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">No variants are available for POS QR generation.</Text>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {variants.map((variant) => {
            const payload = posQrPayload(variant.id)
            return (
              <div key={variant.id} className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
                <div className="grid grid-cols-[120px_1fr] gap-4">
                  <img
                    src={qrLabelUrl(variant.id)}
                    alt={`POS QR code for ${variant.title || variant.id}`}
                    className="h-[120px] w-[120px] rounded border border-ui-border-base bg-white object-contain p-2"
                  />
                  <div className="min-w-0">
                    <Text size="small" className="text-ui-fg-subtle font-medium">Product</Text>
                    <Text className="truncate">{product?.title || sourceProduct.title || "Product"}</Text>

                    <Text size="small" className="mt-3 text-ui-fg-subtle font-medium">Variant</Text>
                    <Text className="truncate">{variant.title || "Default variant"}</Text>

                    <Text size="small" className="mt-3 text-ui-fg-subtle font-medium">SKU</Text>
                    <Text className="truncate">{variant.sku || "No SKU"}</Text>
                  </div>
                </div>

                <div className="mt-4">
                  <Text size="small" className="text-ui-fg-subtle font-medium">Payload</Text>
                  <code className="mt-1 block rounded bg-ui-bg-subtle px-2 py-2 text-xs text-ui-fg-base break-all">
                    {payload}
                  </code>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="small" variant="secondary" type="button" onClick={() => printQr(variant)}>
                    Print QR
                  </Button>
                  <Button size="small" variant="secondary" type="button" onClick={() => copyCode(variant)}>
                    Copy Code
                  </Button>
                  <Button size="small" variant="secondary" type="button" onClick={() => testScan(variant)}>
                    Test Scan
                  </Button>
                  {testStatusByVariant[variant.id] ? (
                    <Badge size="small" color={testStatusByVariant[variant.id] === "PASS" ? "green" : "red"}>
                      {testStatusByVariant[variant.id]}
                    </Badge>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductPosQrWidget
