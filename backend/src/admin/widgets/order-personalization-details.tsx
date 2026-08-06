import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

const OrderPersonalizationDetails = ({ order }: any) => {
  const [records, setRecords] = useState<any[]>([])
  useEffect(() => {
    if (!order?.id) return
    fetch(`/admin/orders/${order.id}/personalizations`, { credentials: "include", headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body) => setRecords(body.personalizations || []))
      .catch(() => setRecords([]))
  }, [order?.id])
  if (!records.length) return null
  return <Container className="p-6">
    <Heading level="h2">Personalizations</Heading>
    <div className="mt-4 flex flex-col gap-4">
      {records.map((record) => <div key={record.id} className="rounded border border-ui-border-base p-4">
        <div className="flex items-center justify-between"><Text size="small">Order item {record.order_item_id}</Text><Badge>{String(record.status || "pending_review").replaceAll("_", " ")}</Badge></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(record.values || {}).map(([key, value]) => { const schemaField = (record.template_snapshot?.fields || []).find((field: any) => field.key === key); return <div key={key}><Text size="xsmall" className="text-ui-fg-subtle">{schemaField?.label || key.replaceAll("_", " ")}</Text><Text size="small">{String(value).startsWith("past_") ? "Uploaded" : String(value)}</Text></div> })}
        </div>
        {record.upload_references?.length > 0 && <div className="mt-3 flex gap-2">{record.upload_references.map((asset: any) => <img key={asset.id} src={asset.preview_url} alt="Customer personalization" className="h-24 w-24 rounded object-cover" />)}</div>}
        <Text size="small" className="mt-3">Surcharge: {record.price_adjustment} minor units</Text>
        {record.production_notes && <Text size="small">Production notes: {record.production_notes}</Text>}
      </div>)}
    </div>
  </Container>
}

export const config = defineWidgetConfig({ zone: "order.details.after" })
export default OrderPersonalizationDetails
