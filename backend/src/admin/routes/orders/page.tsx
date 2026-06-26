import { BuildingStorefront } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Select,
  StatusBadge,
  Table,
  Text,
  Drawer,
  Label,
  Tooltip,
  toast,
} from "@medusajs/ui"
import { useEffect, useState, useCallback } from "react"

/* ────────────────────────────────────────────────────────────────────────────
   Orders Management Page
   ──────────────────────────────────────────────────────────────────────────── */
const OrdersPage = () => {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")

  // Selected order for detail drawer
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [trackingNumber, setTrackingNumber] = useState("")
  const [trackingCarrier, setTrackingCarrier] = useState("Manual")
  const [trackingUrl, setTrackingUrl] = useState("")
  const [savingTracking, setSavingTracking] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "100", fields: "id,display_id,email,currency_code,total,subtotal,status,payment_status,fulfillment_status,fulfillments,created_at,*items,*metadata" })
      const response = await fetch(`/admin/orders?${params}`, { credentials: "include" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      setOrders(data.orders || [])
    } catch (error: any) {
      toast.error("Orders", { description: error.message || "Failed to load orders" })
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    const tracking = selectedOrder?.metadata?.tracking || {}
    setTrackingNumber(tracking.tracking_number || tracking.tracking_code || "")
    setTrackingCarrier(tracking.carrier || "Manual")
    setTrackingUrl(tracking.tracking_url || "")
  }, [selectedOrder])

  // ── Filters ────────────────────────────────────────────────────────────────
  const filteredOrders = orders.filter((o) => {
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchesId = o.id?.toLowerCase().includes(q)
      const matchesDisplayId = String(o.display_id || "").includes(q)
      const matchesEmail = o.email?.toLowerCase().includes(q)
      if (!matchesId && !matchesDisplayId && !matchesEmail) return false
    }
    if (statusFilter !== "all" && o.status !== statusFilter) return false
    if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false
    return true
  })

  // ── Helpers ────────────────────────────────────────────────────────────────
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({})

  // Fetch vendor names for displaying in vendor split section
  useEffect(() => {
    fetch("/admin/vendors", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const names: Record<string, string> = {}
        for (const v of data.vendors || []) {
          names[v.id] = v.store_name || v.name
        }
        setVendorNames(names)
      })
      .catch(() => {})
  }, [])

  const currency = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

  const statusColor = (s: string) => {
    switch (s) {
      case "completed": case "fulfilled": return "green"
      case "processing": case "pending": return "orange"
      case "requires_action": return "red"
      case "canceled": return "grey"
      default: return "grey"
    }
  }

  const paymentStatusColor = (s: string) => {
    switch (s) {
      case "captured": case "paid": return "green"
      case "authorized": return "blue"
      case "pending": return "orange"
      case "failed": case "requires_action": return "red"
      default: return "grey"
    }
  }

  // ── Order Activity Timeline helper ────────────────────────────────────────
  const getActivityTimeline = (order: any) => {
    const ps = String(order?.payment_status || '').toLowerCase()
    const fs = String(order?.fulfillment_status || '').toLowerCase()
    const os = String(order?.status || '').toLowerCase()
    const hasFulfillments = Array.isArray(order?.fulfillments) && order.fulfillments.length > 0
    const firstFulfillment = hasFulfillments ? order.fulfillments[0] : null

    const paymentCaptured = ['captured', 'paid', 'refunded', 'partially_refunded'].includes(ps)
    const fulfilled = ['fulfilled', 'partially_shipped', 'shipped', 'partially_delivered', 'delivered'].includes(fs)
    const shipped = ['shipped', 'partially_delivered', 'delivered'].includes(fs)
    const delivered = fs === 'delivered'
    const cancelled = ['canceled', 'cancelled'].includes(os)

    const activities = [
      {
        label: 'Order placed',
        completed: !cancelled,
        timestamp: order?.created_at,
      },
      {
        label: 'Awaiting payment',
        completed: paymentCaptured || cancelled,
        timestamp: paymentCaptured ? order?.created_at : null,
      },
      {
        label: 'Payment captured',
        completed: paymentCaptured,
        timestamp: order?.captured_at || null,
      },
      {
        label: 'Items fulfilled',
        completed: fulfilled || cancelled,
        timestamp: hasFulfillments ? (firstFulfillment?.created_at || order?.updated_at) : null,
      },
      {
        label: 'Items shipped',
        completed: shipped || cancelled,
        timestamp: hasFulfillments ? (firstFulfillment?.shipped_at || null) : null,
      },
      {
        label: 'Items delivered',
        completed: delivered,
        timestamp: delivered && hasFulfillments
          ? (order.fulfillments.find((f: any) => f.delivered_at)?.delivered_at || null)
          : null,
      },
    ]

    return activities.filter((a) => {
      // If order is cancelled, show Order placed as completed only
      if (cancelled && a.label === 'Order placed') return true
      if (cancelled && a.label !== 'Order placed') return false
      return true
    })
  }

  // ── Order counts for filter badges ─────────────────────────────────────────
  const saveTracking = async () => {
    if (!selectedOrder) return
    if (!trackingNumber.trim()) {
      toast.error("Tracking", { description: "Tracking number is required" })
      return
    }

    setSavingTracking(true)
    try {
      const response = await fetch(`/admin/orders/${selectedOrder.id}/tracking`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_number: trackingNumber.trim(),
          carrier: trackingCarrier,
          tracking_url: trackingUrl.trim(),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Failed to update tracking")

      toast.success("Tracking updated")
      setSelectedOrder((current: any) => current ? {
        ...current,
        metadata: {
          ...(current.metadata || {}),
          tracking: data.tracking,
        },
      } : current)
      await fetchOrders()
    } catch (error: any) {
      toast.error("Tracking update failed", { description: error.message })
    } finally {
      setSavingTracking(false)
    }
  }

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    processing: orders.filter((o) => o.status === "processing").length,
    completed: orders.filter((o) => o.status === "completed").length,
    canceled: orders.filter((o) => o.status === "canceled").length,
    requires_action: orders.filter((o) => o.status === "requires_action").length,
  }

  return (
    <Container className="p-8 flex flex-col gap-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">Orders</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            {orders.length} total order{orders.length !== 1 ? "s" : ""} across all channels.
          </Text>
        </div>
        <Button variant="secondary" size="small" onClick={fetchOrders} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* ── Search & Filters ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Input
            placeholder="Search by order ID or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <Select.Trigger>
              <Select.Value placeholder="All statuses" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All statuses ({counts.all})</Select.Item>
              <Select.Item value="pending">Pending ({counts.pending})</Select.Item>
              <Select.Item value="processing">Processing ({counts.processing})</Select.Item>
              <Select.Item value="completed">Completed ({counts.completed})</Select.Item>
              <Select.Item value="canceled">Canceled ({counts.canceled})</Select.Item>
              <Select.Item value="requires_action">Requires action ({counts.requires_action})</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <Select.Trigger>
              <Select.Value placeholder="All payments" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All payments</Select.Item>
              <Select.Item value="captured">Captured</Select.Item>
              <Select.Item value="authorized">Authorized</Select.Item>
              <Select.Item value="pending">Pending</Select.Item>
              <Select.Item value="failed">Failed</Select.Item>
              <Select.Item value="refunded">Refunded</Select.Item>
            </Select.Content>
          </Select>
        </div>
      </div>

      {/* ── Quick stat badges ────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        <Badge size="small" color="blue">{counts.all} total</Badge>
        <Badge size="small" color="orange">{counts.pending} pending</Badge>
        <Badge size="small" color="blue">{counts.processing} processing</Badge>
        <Badge size="small" color="green">{counts.completed} completed</Badge>
        <Badge size="small" color="red">{counts.requires_action} requires action</Badge>
        <Badge size="small" color="grey">{counts.canceled} canceled</Badge>
      </div>

      {/* ── Orders Table ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-16 text-center">
          <Text className="text-ui-fg-subtle">Loading orders…</Text>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-16 text-center">
          <Text className="text-ui-fg-subtle">
            {search || statusFilter !== "all" || paymentFilter !== "all"
              ? "No orders match your filters."
              : "No orders yet."}
          </Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Items</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Payment</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Total</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredOrders.map((order) => (
              <Table.Row
                key={order.id}
                className="cursor-pointer hover:bg-ui-bg-base-hover transition-colors"
                onClick={() => {
                  setSelectedOrder(order)
                  setDrawerOpen(true)
                }}
              >
                <Table.Cell className="font-mono text-xs">
                  #{order.display_id || order.id.slice(-8).toUpperCase()}
                </Table.Cell>
                <Table.Cell className="max-w-[160px] truncate" title={order.email}>
                  {order.email}
                </Table.Cell>
                <Table.Cell>{(order.items || []).length}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={statusColor(order.status)}>
                    {order.status.replace(/_/g, " ")}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  {order.payment_status ? (
                    <StatusBadge color={paymentStatusColor(order.payment_status)}>
                      {order.payment_status.replace(/_/g, " ")}
                    </StatusBadge>
                  ) : (
                    <Text size="small" className="text-ui-fg-subtle">—</Text>
                  )}
                </Table.Cell>
                <Table.Cell className="text-right font-mono">
                  {currency(order.total || 0)}
                </Table.Cell>
                <Table.Cell className="text-xs text-ui-fg-subtle">
                  {new Date(order.created_at).toLocaleDateString()}
                </Table.Cell>
                <Table.Cell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 justify-end">
                    {order.status === "pending" && (
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={async (e: any) => {
                          e.stopPropagation()
                          try {
                            const r = await fetch(`/admin/orders/${order.id}`, {
                              method: "POST",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "processing" }),
                            })
                            if (!r.ok) throw new Error((await r.json()).message)
                            toast.success("Order marked as processing")
                            await fetchOrders()
                          } catch (err: any) {
                            toast.error("Update failed", { description: err.message })
                          }
                        }}
                      >
                        Process
                      </Button>
                    )}
                    {order.status === "processing" && (
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={async (e: any) => {
                          e.stopPropagation()
                          try {
                            const r = await fetch(`/admin/orders/${order.id}/fulfillment`, {
                              method: "POST",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ items: (order.items || []).map((i: any) => ({ id: i.id, quantity: i.quantity })) }),
                            })
                            if (!r.ok) {
                              const errData = await r.json()
                              throw new Error(errData.message || "Fulfillment failed")
                            }
                            toast.success("Order fulfilled")
                            await fetchOrders()
                          } catch (err: any) {
                            toast.error("Fulfillment failed", { description: err.message })
                          }
                        }}
                      >
                        Fulfill
                      </Button>
                    )}
                    {!["canceled", "completed"].includes(order.status) && (
                      <Button
                        size="small"
                        variant="danger"
                        onClick={async (e: any) => {
                          e.stopPropagation()
                          if (!window.confirm(`Cancel order #${order.display_id || order.id.slice(-8)}?`)) return
                          try {
                            const r = await fetch(`/admin/orders/${order.id}/cancel`, {
                              method: "POST",
                              credentials: "include",
                            })
                            if (!r.ok) throw new Error((await r.json()).message)
                            toast.success("Order canceled")
                            await fetchOrders()
                          } catch (err: any) {
                            toast.error("Cancel failed", { description: err.message })
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* ── Order Detail Drawer ──────────────────────────────────────────── */}
      {selectedOrder && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>
                Order #{selectedOrder.display_id || selectedOrder.id.slice(-8).toUpperCase()}
              </Drawer.Title>
              <Drawer.Description className="flex items-center gap-2 mt-1">
                <StatusBadge color={statusColor(selectedOrder.status)}>
                  {selectedOrder.status.replace(/_/g, " ")}
                </StatusBadge>
                <span className="text-ui-fg-subtle text-sm">
                  {new Date(selectedOrder.created_at).toLocaleString()}
                </span>
              </Drawer.Description>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-y-6">
              {/* Customer Info */}
              <div>
                <Heading level="h3" className="mb-2">Customer</Heading>
                <Text>{selectedOrder.email}</Text>
                <Text className="text-ui-fg-subtle" size="small">
                  ID: {selectedOrder.id}
                </Text>
              </div>

              {/* Payment Info */}
              <div>
                <Heading level="h3" className="mb-2">Payment</Heading>
                <div className="flex items-center gap-2">
                  <StatusBadge color={paymentStatusColor(selectedOrder.payment_status || "pending")}>
                    {selectedOrder.payment_status?.replace(/_/g, " ") || "Pending"}
                  </StatusBadge>
                </div>
                <Text className="mt-1 text-ui-fg-subtle">
                  Currency: {selectedOrder.currency_code?.toUpperCase() || "USD"}
                </Text>
              </div>

              {/* Items */}
              <div>
                <Heading level="h3" className="mb-2">
                  Items ({(selectedOrder.items || []).length})
                </Heading>
                <div className="flex flex-col gap-3">
                  {(selectedOrder.items || []).map((item: any) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 bg-ui-bg-base-hover rounded-md">
                      {item.thumbnail && (
                        <img src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <Text size="small" className="font-medium truncate">{item.title}</Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          Qty: {item.quantity} × {currency(item.unit_price || 0)}
                        </Text>
                      </div>
                      <Text size="small" className="font-mono font-medium">
                        {currency((item.unit_price || 0) * (item.quantity || 1))}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border-t pt-4">
                <div className="flex justify-between text-sm">
                  <Text>Subtotal</Text>
                  <Text className="font-mono">{currency(selectedOrder.subtotal || 0)}</Text>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <Text className="font-semibold">Total</Text>
                  <Text className="font-mono font-semibold">{currency(selectedOrder.total || 0)}</Text>
                </div>
              </div>

              {/* ── Order Activity Timeline ──────────────────────────── */}
              <div className="border-t pt-4">
                <Heading level="h3" className="mb-4">Activity</Heading>
                <div className="relative flex flex-col">
                  {/* Vertical connector line - fills up to the last completed activity */}
                  <div className="absolute left-[11px] top-[6px] bottom-[6px] w-[2px] bg-gray-200 rounded-full">
                    <div
                      className="w-full bg-green-500 rounded-full transition-all duration-500"
                      style={{ height: `${(() => {
                        const activities = getActivityTimeline(selectedOrder)
                        const completed = activities.filter((a) => a.completed).length
                        const total = activities.length
                        return total > 1 ? ((completed - 1) / (total - 1)) * 100 : completed > 0 ? 100 : 0
                      })()}%` }}
                    />
                  </div>

                  {getActivityTimeline(selectedOrder).map((activity, i) => (
                    <div key={i} className="flex gap-4 pb-5 last:pb-0 relative">
                      {/* Status dot */}
                      <div
                        className={`w-[24px] h-[24px] rounded-full flex items-center justify-center shrink-0 z-10 transition-all duration-300 ${
                          activity.completed
                            ? 'bg-green-500 ring-2 ring-green-200'
                            : 'bg-gray-100 ring-2 ring-gray-200'
                        }`}
                      >
                        {activity.completed && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      {/* Activity text */}
                      <div className="flex-1 min-w-0 pt-[2px]">
                        <Text
                          size="small"
                          className={`font-medium ${
                            activity.completed ? 'text-ui-fg-base' : 'text-ui-fg-subtle'
                          }`}
                        >
                          {activity.label}
                        </Text>
                        {activity.timestamp && (
                          <Text size="small" className="text-ui-fg-subtle">
                            {new Date(activity.timestamp).toLocaleString()}
                          </Text>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Vendor Split Section ──────────────────────────── */}
              <div className="border-t pt-4">
                <Heading level="h3" className="mb-3">Shipment Tracking</Heading>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label size="small" className="mb-1 block">Tracking Number</Label>
                    <Input
                      value={trackingNumber}
                      onChange={(event) => setTrackingNumber(event.target.value)}
                      placeholder="CA123456789"
                    />
                  </div>
                  <div>
                    <Label size="small" className="mb-1 block">Carrier</Label>
                    <Select value={trackingCarrier} onValueChange={setTrackingCarrier}>
                      <Select.Trigger>
                        <Select.Value placeholder="Select carrier" />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="Manual">Manual</Select.Item>
                        <Select.Item value="Organic Canada Delivery">Organic Canada Delivery</Select.Item>
                        <Select.Item value="Canada Post">Canada Post</Select.Item>
                        <Select.Item value="UPS">UPS</Select.Item>
                        <Select.Item value="FedEx">FedEx</Select.Item>
                        <Select.Item value="DHL">DHL</Select.Item>
                        <Select.Item value="Shippo">Shippo</Select.Item>
                      </Select.Content>
                    </Select>
                  </div>
                  <div>
                    <Label size="small" className="mb-1 block">Tracking URL</Label>
                    <Input
                      value={trackingUrl}
                      onChange={(event) => setTrackingUrl(event.target.value)}
                      placeholder="https://carrier-link"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={saveTracking}
                    disabled={savingTracking}
                  >
                    {savingTracking ? "Saving..." : "Save Tracking"}
                  </Button>
                </div>
              </div>

              {selectedOrder.metadata?.vendor_split && (() => {
                const vs = selectedOrder.metadata.vendor_split
                return (
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <BuildingStorefront className="w-4 h-4 text-ui-fg-subtle" />
                      <Heading level="h3">Vendor Split</Heading>
                      <Badge size="small" color="blue">{vs.bucket_count} vendor{vs.bucket_count !== 1 ? "s" : ""}</Badge>
                      {vs.unlinked_items_count > 0 && (
                        <Badge size="small" color="orange">{vs.unlinked_items_count} unlinked</Badge>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      {vs.buckets.map((bucket: any, i: number) => (
                        <div key={bucket.vendor_id} className="border rounded-lg p-3 bg-ui-bg-base-hover">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge size="small" color={i === 0 ? "green" : "blue"}>
                                #{i + 1}
                              </Badge>
                              <Text size="small" className="font-medium truncate">
                                {vendorNames[bucket.vendor_id] || bucket.vendor_id.slice(0, 12) + "…"}
                              </Text>
                            </div>
                            <Text size="small" className="font-mono font-semibold">
                              {currency(bucket.total)}
                            </Text>
                          </div>
                          <div className="flex items-center justify-between text-xs text-ui-fg-subtle">
                            <span>{bucket.item_count} item{bucket.item_count !== 1 ? "s" : ""}</span>
                            <Tooltip content={bucket.vendor_id}>
                              <span className="font-mono cursor-help">
                                ID: {bucket.vendor_id.slice(0, 8)}…
                              </span>
                            </Tooltip>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 text-xs text-ui-fg-subtle flex items-center gap-1">
                      <span>Split computed:</span>
                      <span className="font-mono">{new Date(vs.computed_at).toLocaleString()}</span>
                    </div>
                  </div>
                )
              })()}
            </Drawer.Body>
          </Drawer.Content>
        </Drawer>
      )}
    </Container>
  )
}

// ⚠️ Config removed to avoid duplicate 'Orders' sidebar entry (core Medusa already provides one).
// The page component remains accessible for programmatic use if needed.
export default OrdersPage
