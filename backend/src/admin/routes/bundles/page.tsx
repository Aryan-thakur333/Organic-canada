import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Tag } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Select, Table, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

const emptyComponents = () => [{ variant_id: "", quantity: 1 }, { variant_id: "", quantity: 1 }]

function validateMajorUnitPrice(value: string): string | null {
  const num = Number(value)
  if (!Number.isFinite(num)) return "Price must be a number"
  if (num <= 0) return "Price must be greater than zero"
  if (!/^\d+(\.\d{1,2})?$/.test(String(num.toFixed(2)))) return "Price must have at most 2 decimal places"
  return null
}

function formatPreview(value: string, currency: string): string {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ""
  try {
    return new Intl.NumberFormat(currency === "cad" ? "en-CA" : "en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(num)
  } catch {
    return `${currency.toUpperCase()} ${num.toFixed(2)}`
  }
}

export default function BundlesPage() {
  const [bundles, setBundles] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("")
  const [handle, setHandle] = useState("")
  const [shippingProfileId, setShippingProfileId] = useState("")
  const [salesChannels, setSalesChannels] = useState("")
  const [regions, setRegions] = useState("")
  const [cad, setCad] = useState("")
  const [usd, setUsd] = useState("")
  const [cadError, setCadError] = useState("")
  const [usdError, setUsdError] = useState("")
  const [components, setComponents] = useState(emptyComponents())

  const load = async () => {
    const response = await fetch("/admin/bundles", { credentials: "include" })
    const body = await response.json()
    if (response.ok) setBundles(body.bundles || [])
  }
  const loadProducts = async () => {
    const response = await fetch("/admin/products?limit=100", { credentials: "include" })
    const body = await response.json()
    if (!response.ok) throw new Error(body.message || "Unable to load products")
    setProducts(body.products || [])
  }
  useEffect(() => { void load(); void loadProducts().catch((error) => toast.error("Bundle products", { description: error.message })) }, [])
  const updateComponent = (index: number, key: string, value: string | number) => setComponents(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row))

  const create = async () => {
    const usdErr = validateMajorUnitPrice(usd)
    const cadErr = validateMajorUnitPrice(cad)
    setUsdError(usdErr || "")
    setCadError(cadErr || "")
    if (usdErr || cadErr) {
      toast.error("Invalid prices", { description: "Check USD and CAD prices before saving." })
      return
    }
    setSaving(true)
    try {
      const prices = [
        { currency_code: "cad", amount: Number(Number(cad).toFixed(2)) },
        { currency_code: "usd", amount: Number(Number(usd).toFixed(2)) },
      ]
      const response = await fetch("/admin/bundles", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        title, handle, shipping_profile_id: shippingProfileId,
        sales_channel_ids: salesChannels.split(",").map(value => value.trim()).filter(Boolean),
        region_ids: regions.split(",").map(value => value.trim()).filter(Boolean), prices,
        components: components.map((component, sort_order) => ({ variant_id: component.variant_id.trim(), quantity: Number(component.quantity), sort_order })),
      }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || "Unable to create bundle")
      toast.success("Fixed bundle created")
      setTitle(""); setHandle(""); setComponents(emptyComponents()); await load()
    } catch (error: any) { toast.error("Bundle creation failed", { description: error.message }) }
    finally { setSaving(false) }
  }

  const archive = async (id: string) => {
    const response = await fetch(`/admin/bundles/${id}/archive`, { method: "POST", credentials: "include" })
    if (!response.ok) return toast.error("Unable to archive bundle")
    await load()
  }

  return <Container className="p-8 flex flex-col gap-y-8">
    <div><Heading level="h1">Fixed Bundles</Heading><Text className="text-ui-fg-subtle">Enter prices in major currency units (e.g. 21.99 for $21.99 USD). Component inventory is location-scoped and authoritative.</Text></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div><Label>Title</Label><Input value={title} onChange={event => setTitle(event.target.value)} /></div>
      <div><Label>Handle</Label><Input value={handle} onChange={event => setHandle(event.target.value)} placeholder="organic-starter-bundle" /></div>
      <div><Label>Shipping profile ID</Label><Input value={shippingProfileId} onChange={event => setShippingProfileId(event.target.value)} /></div>
      <div><Label>Sales channel IDs (comma-separated)</Label><Input value={salesChannels} onChange={event => setSalesChannels(event.target.value)} /></div>
      <div><Label>Region IDs (comma-separated)</Label><Input value={regions} onChange={event => setRegions(event.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>USD price</Label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            placeholder="21.99"
            value={usd}
            onChange={event => { setUsd(event.target.value); setUsdError(validateMajorUnitPrice(event.target.value) || "") }}
          />
          {usdError && <Text size="small" className="text-ui-fg-error mt-1">{usdError}</Text>}
          {usd && !usdError && <Text size="small" className="text-ui-fg-subtle mt-1">Preview: {formatPreview(usd, "usd")}</Text>}
        </div>
        <div>
          <Label>CAD price</Label>
          <Input
            type="number"
            min={0.01}
            step={0.01}
            placeholder="29.99"
            value={cad}
            onChange={event => { setCad(event.target.value); setCadError(validateMajorUnitPrice(event.target.value) || "") }}
          />
          {cadError && <Text size="small" className="text-ui-fg-error mt-1">{cadError}</Text>}
          {cad && !cadError && <Text size="small" className="text-ui-fg-subtle mt-1">Preview: {formatPreview(cad, "cad")}</Text>}
        </div>
      </div>
    </div>
      <div><Heading level="h2">Components</Heading><Text size="small" className="text-ui-fg-subtle">Choose published component variants. Duplicate variants and non-positive quantities are rejected by the server.</Text>
      <div className="mt-3 flex flex-col gap-2">{components.map((component, index) => <div key={index} className="grid grid-cols-[1fr_120px_auto] gap-2"><Select value={component.variant_id} onValueChange={value => updateComponent(index, "variant_id", value)}><Select.Trigger><Select.Value placeholder="Select a component variant" /></Select.Trigger><Select.Content>{products.flatMap((product) => (product.variants || []).map((variant: any) => <Select.Item key={variant.id} value={variant.id}>{product.title} — {variant.title || variant.sku || variant.id}</Select.Item>))}</Select.Content></Select><Input type="number" min={1} step={1} value={component.quantity} onChange={event => updateComponent(index, "quantity", event.target.value)} /><Button variant="danger" onClick={() => setComponents(rows => rows.filter((_, rowIndex) => rowIndex !== index))} disabled={components.length <= 2}>Remove</Button></div>)}</div>
      <div className="mt-3 flex gap-2"><Button variant="secondary" onClick={() => setComponents(rows => [...rows, { variant_id: "", quantity: 1 }])}>Add component</Button><Button onClick={create} disabled={saving}>{saving ? "Creating…" : "Create fixed bundle"}</Button></div>
    </div>
    <Table><Table.Header><Table.Row><Table.HeaderCell>Bundle</Table.HeaderCell><Table.HeaderCell>Product / Variant</Table.HeaderCell><Table.HeaderCell>Components</Table.HeaderCell><Table.HeaderCell>Status</Table.HeaderCell><Table.HeaderCell /></Table.Row></Table.Header><Table.Body>{bundles.map(bundle => <Table.Row key={bundle.id}><Table.Cell>{bundle.title}</Table.Cell><Table.Cell>{bundle.product_id}<br />{bundle.variant_id}</Table.Cell><Table.Cell>{bundle.items?.length || 0}</Table.Cell><Table.Cell><Badge color={bundle.status === "active" ? "green" : "grey"}>{bundle.status}</Badge></Table.Cell><Table.Cell>{bundle.status !== "archived" && <Button variant="danger" size="small" onClick={() => archive(bundle.id)}>Archive</Button>}</Table.Cell></Table.Row>)}</Table.Body></Table>
  </Container>
}

export const config = defineRouteConfig({ label: "Bundled Products", icon: Tag })
