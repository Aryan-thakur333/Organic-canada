import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Container, Heading, Table, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

const OrderBundleDetails = ({ order }: any) => {
  const [bundles, setBundles] = useState<any[]>([])
  useEffect(() => {
    if (!order?.id) return
    fetch(`/admin/orders/${order.id}/bundle-snapshots`, { credentials: "include" }).then(response => response.ok ? response.json() : Promise.reject()).then(body => setBundles(body.bundles || [])).catch(() => setBundles([]))
  }, [order?.id])
  if (!bundles.length) return null
  return <Container className="p-6"><Heading level="h2">Bundle picking details</Heading><div className="mt-4 flex flex-col gap-4">{bundles.map(bundle => <div key={bundle.id}><div className="flex justify-between"><Text weight="plus">{bundle.title}</Text><Badge color={bundle.status === "committed" ? "green" : "orange"}>{bundle.status}</Badge></div><Table><Table.Header><Table.Row><Table.HeaderCell>Component variant</Table.HeaderCell><Table.HeaderCell>SKU</Table.HeaderCell><Table.HeaderCell>Required</Table.HeaderCell><Table.HeaderCell>Picked / fulfilled</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{bundle.components.map((component: any) => <Table.Row key={component.variant_id}><Table.Cell>{component.title}<br />{component.variant_id}</Table.Cell><Table.Cell>{component.sku || "—"}</Table.Cell><Table.Cell>{component.required_quantity}</Table.Cell><Table.Cell>{component.picked_quantity}</Table.Cell></Table.Row>)}</Table.Body></Table></div>)}</div></Container>
}

export const config = defineWidgetConfig({ zone: "order.details.after" })
export default OrderBundleDetails
