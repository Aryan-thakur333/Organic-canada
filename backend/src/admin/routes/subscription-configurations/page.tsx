import { Badge, Button, Container, Heading, Input, Label, Select, Table, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

const intervalOptions = ["WEEK", "MONTH", "QUARTER", "YEAR"]

export default function SubscriptionConfigurationsPage() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [productId, setProductId] = useState("")
  const [variantId, setVariantId] = useState("")
  const [interval, setInterval] = useState("MONTH")
  const [discountType, setDiscountType] = useState("none")
  const [discountValue, setDiscountValue] = useState("0")

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch("/admin/subscription-configurations", { credentials: "include" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Unable to load configurations")
      setRows(data.configurations || [])
    } catch (error: any) {
      toast.error("Subscription eligibility", { description: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!productId.trim()) return toast.error("Product ID is required")
    setSaving(true)
    try {
      const response = await fetch("/admin/subscription-configurations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId.trim(),
          variant_id: variantId.trim() || null,
          enabled: true,
          allowed_intervals: [interval],
          minimum_periods: 1,
          maximum_periods: null,
          discount_type: discountType,
          discount_value: Number(discountValue || 0),
          one_time_purchase_allowed: true,
          pause_allowed: true,
          trial_period_days: 0,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Unable to save configuration")
      setProductId("")
      setVariantId("")
      toast.success("Subscription eligibility enabled")
      await load()
    } catch (error: any) {
      toast.error("Save failed", { description: error.message })
    } finally {
      setSaving(false)
    }
  }

  const archive = async (id: string) => {
    const response = await fetch(`/admin/subscription-configurations/${id}`, { method: "DELETE", credentials: "include" })
    const data = await response.json()
    if (!response.ok) return toast.error("Archive failed", { description: data.message })
    toast.success("Subscription eligibility disabled")
    await load()
  }

  return (
    <Container className="p-8 flex flex-col gap-y-8">
      <div>
        <Heading level="h1">Subscription Product Eligibility</Heading>
        <Text className="text-ui-fg-subtle mt-1">Configure eligible products and variants. Regional prices are always resolved by Medusa at checkout.</Text>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div><Label>Product ID</Label><Input value={productId} onChange={(event) => setProductId(event.target.value)} /></div>
        <div><Label>Variant ID (optional)</Label><Input value={variantId} onChange={(event) => setVariantId(event.target.value)} /></div>
        <div><Label>Interval</Label><Select value={interval} onValueChange={setInterval}><Select.Trigger><Select.Value /></Select.Trigger><Select.Content>{intervalOptions.map((value) => <Select.Item key={value} value={value}>{value}</Select.Item>)}</Select.Content></Select></div>
        <div><Label>Discount</Label><div className="flex gap-2"><Select value={discountType} onValueChange={setDiscountType}><Select.Trigger><Select.Value /></Select.Trigger><Select.Content><Select.Item value="none">None</Select.Item><Select.Item value="percentage">Basis points</Select.Item><Select.Item value="fixed">Fixed minor units</Select.Item></Select.Content></Select><Input type="number" min={0} value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} /></div></div>
        <Button onClick={create} disabled={saving}>{saving ? "Saving…" : "Enable"}</Button>
      </div>

      {loading ? <Text>Loading…</Text> : (
        <Table>
          <Table.Header><Table.Row><Table.HeaderCell>Product</Table.HeaderCell><Table.HeaderCell>Variant</Table.HeaderCell><Table.HeaderCell>Intervals</Table.HeaderCell><Table.HeaderCell>Discount</Table.HeaderCell><Table.HeaderCell>Status</Table.HeaderCell><Table.HeaderCell /></Table.Row></Table.Header>
          <Table.Body>{rows.map((row) => <Table.Row key={row.id}><Table.Cell>{row.product_id_reference}</Table.Cell><Table.Cell>{row.variant_id_reference || "All variants"}</Table.Cell><Table.Cell>{(row.allowed_intervals || []).join(", ")}</Table.Cell><Table.Cell>{row.discount_type}: {row.discount_value}</Table.Cell><Table.Cell><Badge color={row.enabled ? "green" : "grey"}>{row.enabled ? "Enabled" : "Disabled"}</Badge></Table.Cell><Table.Cell>{row.enabled && <Button size="small" variant="danger" onClick={() => archive(row.id)}>Disable</Button>}</Table.Cell></Table.Row>)}</Table.Body>
        </Table>
      )}
    </Container>
  )
}

