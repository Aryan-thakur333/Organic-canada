import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar, ShoppingCart, CurrencyDollar, ArchiveBox, Users } from "@medusajs/icons"
import { Container, Heading, Table, Text, StatusBadge, Badge, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"

/* ────────────────────────────────────────────────────────────────────────────
   Simple inlined bar chart
   ──────────────────────────────────────────────────────────────────────────── */
function MiniBarChart({ data, maxValue }: { data: { label: string; value: number }[]; maxValue?: number }) {
  const mx = maxValue ?? Math.max(...data.map((d) => d.value), 1)
  if (mx === 0) return <Text className="text-ui-fg-subtle py-4 text-center">No data yet</Text>

  return (
    <div className="flex items-end gap-[3px] h-32 pt-2">
      {data.map((d) => {
        const h = mx > 0 ? Math.max((d.value / mx) * 100, 4) : 4
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div
              className="w-full rounded-sm bg-ui-tag-blue-bg hover:bg-ui-tag-blue-icon transition-all cursor-pointer"
              style={{ height: `${h}%`, minHeight: 4 }}
              title={`${d.label}: $${d.value.toLocaleString()}`}
            />
            <span className="text-[8px] text-ui-fg-subtle font-mono truncate w-full text-center">
              {d.label.slice(-2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   Stat card component
   ──────────────────────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, trend }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
  trend?: { value: number; positive: boolean }
}) {
  return (
    <div className="border rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-ui-fg-subtle">
        {icon}
        <Text size="small">{label}</Text>
      </div>
      <Heading level="h2" className="mt-1">{value}</Heading>
      {sub && <Text size="small" className="text-ui-fg-subtle">{sub}</Text>}
      {trend && (
        <span className={`text-[10px] font-medium ${trend.positive ? "text-ui-tag-green-text" : "text-ui-tag-red-text"}`}>
          {trend.positive ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%
        </span>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   Vendor Analytics Page
   ──────────────────────────────────────────────────────────────────────────── */
const VendorAnalyticsPage = () => {
  const { id } = useParams<{ id: string }>()
  const [analytics, setAnalytics] = useState<any>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    setLoading(true)
    Promise.all([
      fetch(`/admin/vendor-products/${id}`, { credentials: "include" }).then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.message)
        return d
      }),
      fetch(`/admin/vendor-products/${id}/orders`, { credentials: "include" }).then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.message)
        return d
      }),
    ])
      .then(([analyticsData, ordersData]) => {
        setAnalytics(analyticsData)
        setOrders(ordersData.orders || [])
      })
      .catch((err: any) => toast.error("Vendor analytics", { description: err.message }))
      .finally(() => setLoading(false))
  }, [id])

  const revenueChartData = useMemo(() => {
    if (!analytics?.analytics?.revenueByMonth) return []
    return analytics.analytics.revenueByMonth.map((m: any) => ({
      label: m.month,
      value: Math.round(m.revenue), // already in dollars
    }))
  }, [analytics])

  const maxRevenue = useMemo(
    () => Math.max(...revenueChartData.map((d) => d.value), 0),
    [revenueChartData]
  )

  const currency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val || 0)

  if (!id) {
    return (
      <Container className="p-8">
        <Text>No vendor ID provided.</Text>
      </Container>
    )
  }

  if (loading) {
    return (
      <Container className="p-8">
        <Text>Loading vendor analytics…</Text>
      </Container>
    )
  }

  if (!analytics) {
    return (
      <Container className="p-8">
        <Text className="text-ui-fg-subtle">Could not load vendor analytics.</Text>
      </Container>
    )
  }

  const a = analytics.analytics || {}
  const vendor = analytics.vendor || {}
  const revenueGrowth = a.revenueGrowth || 0

  const statusColor = (s: string) => {
    switch (s) {
      case "completed": case "fulfilled": return "green"
      case "processing": case "pending": return "orange"
      case "requires_action": return "red"
      case "canceled": return "grey"
      default: return "grey"
    }
  }

  // Count by status for badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const o of orders) {
      counts[o.status] = (counts[o.status] || 0) + 1
    }
    return counts
  }, [orders])

  return (
    <Container className="p-8 flex flex-col gap-y-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div>
          <Heading level="h1">{vendor.name || "Vendor Analytics"}</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            {vendor.email} · <span className="capitalize">{vendor.status || "unknown"}</span>
          </Text>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<CurrencyDollar />}
          label="Revenue"
          value={currency(a.revenue)}
          sub={`${a.orders || 0} orders`}
          trend={{ value: revenueGrowth, positive: revenueGrowth >= 0 }}
        />
        <StatCard
          icon={<ChartBar />}
          label="Avg Order Value"
          value={currency(a.avgOrderValue)}
          sub={`${a.products} products`}
        />
        <StatCard
          icon={<ArchiveBox />}
          label="Pending Orders"
          value={String(a.pendingOrders || 0)}
          sub={`${a.orders || 0} total orders`}
        />
        <StatCard
          icon={<ShoppingCart />}
          label="Best Seller"
          value={a.bestSellers?.[0]?.title || "—"}
          sub={a.bestSellers?.[0] ? currency(a.bestSellers[0].revenue) : "No sales yet"}
        />
      </div>

      {/* ── Revenue Chart ────────────────────────────────────────────── */}
      <div className="border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <Heading level="h2">Revenue (by month)</Heading>
          <Badge size="small" color="blue">
            ${maxRevenue > 0 ? maxRevenue.toLocaleString() : "0"} max
          </Badge>
        </div>
        <MiniBarChart data={revenueChartData} maxValue={maxRevenue} />
      </div>

      {/* ── Two-column: Best Sellers + Status ────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Best Sellers */}
        <div className="border rounded-lg p-5">
          <Heading level="h2" className="mb-4">Best Sellers</Heading>
          {(a.bestSellers || []).length > 0 ? (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>#</Table.HeaderCell>
                  <Table.HeaderCell>Product</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Qty Sold</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">Revenue</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {(a.bestSellers || []).map((p: any, i: number) => (
                  <Table.Row key={p.id || i}>
                    <Table.Cell className="text-ui-fg-subtle font-mono text-xs">{i + 1}</Table.Cell>
                    <Table.Cell className="font-medium">
                      <div className="flex items-center gap-2">
                        {p.thumbnail && (
                          <img src={p.thumbnail} alt="" className="w-6 h-6 rounded object-cover" />
                        )}
                        <span className="truncate max-w-[200px]">{p.title}</span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-right font-mono text-sm">{p.quantity}</Table.Cell>
                    <Table.Cell className="text-right font-mono text-sm">{currency(p.revenue)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          ) : (
            <Text className="text-ui-fg-subtle py-8 text-center">No products sold yet.</Text>
          )}
        </div>

        {/* Status Breakdown */}
        <div className="border rounded-lg p-5">
          <Heading level="h2" className="mb-4">Order Status</Heading>
          {Object.keys(statusCounts).length > 0 ? (
            <div className="flex flex-col gap-2">
              {Object.entries(statusCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between py-1.5">
                    <StatusBadge color={statusColor(status)}>
                      {status.replace(/_/g, " ")}
                    </StatusBadge>
                    <Text size="small" className="font-mono">{count}</Text>
                  </div>
                ))}
            </div>
          ) : (
            <Text className="text-ui-fg-subtle">No orders yet.</Text>
          )}

          {a.lowStockAlerts > 0 && (
            <>
              <div className="border-t my-4" />
              <div className="flex items-center gap-2">
                <Badge size="small" color="red">{a.lowStockAlerts}</Badge>
                <Text size="small" className="text-ui-fg-subtle">
                  item{a.lowStockAlerts !== 1 ? "s" : ""} with low stock
                </Text>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Product Catalog ──────────────────────────────────────────── */}
      {(a.topVendorProducts || []).length > 0 && (
        <div className="border rounded-lg p-5">
          <Heading level="h2" className="mb-4">Product Catalog</Heading>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Product</Table.HeaderCell>
                <Table.HeaderCell>Variants</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Qty Sold</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Revenue</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(a.topVendorProducts || []).map((p: any) => (
                <Table.Row key={p.id}>
                  <Table.Cell className="font-medium">{p.title}</Table.Cell>
                  <Table.Cell>{p.variants}</Table.Cell>
                  <Table.Cell className="text-right font-mono">{p.sales?.quantity || 0}</Table.Cell>
                  <Table.Cell className="text-right font-mono">{currency(p.sales?.revenue || 0)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      {/* ── Order History ────────────────────────────────────────────── */}
      <div className="border rounded-lg p-5">
        <Heading level="h2" className="mb-4">Order History ({orders.length})</Heading>
        {orders.length > 0 ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Order</Table.HeaderCell>
                <Table.HeaderCell>Customer</Table.HeaderCell>
                <Table.HeaderCell>Items</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Vendor Share</Table.HeaderCell>
                <Table.HeaderCell>Date</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {orders.map((o: any) => (
                <Table.Row key={o.id}>
                  <Table.Cell className="font-mono text-xs">
                    #{o.display_id || o.id.slice(-8).toUpperCase()}
                  </Table.Cell>
                  <Table.Cell className="max-w-[140px] truncate" title={o.email}>
                    {o.email}
                  </Table.Cell>
                  <Table.Cell>{o.items_count || (o.items || []).length}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={statusColor(o.status)}>
                      {o.status.replace(/_/g, " ")}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell className="text-right font-mono">
                    {currency(o.vendor_subtotal)}
                  </Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-subtle">
                    {new Date(o.created_at).toLocaleDateString()}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <Text className="text-ui-fg-subtle py-8 text-center">
            This vendor has no orders yet.
          </Text>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor Analytics",
  icon: ChartBar,
})

export default VendorAnalyticsPage
