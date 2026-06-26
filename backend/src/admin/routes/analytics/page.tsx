import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar, ShoppingCart, Users, ArchiveBox } from "@medusajs/icons"
import { Container, Heading, Table, Text, StatusBadge, Badge, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

/* ────────────────────────────────────────────────────────────────────────────
   Simple inlined bar chart (no external deps needed)
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
              title={`${d.label}: ${d.value.toLocaleString()}`}
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
  icon: React.ReactNode; label: string; value: string; sub?: string; trend?: { value: number; positive: boolean }
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
   Main analytics page
   ──────────────────────────────────────────────────────────────────────────── */
const AnalyticsPage = () => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch("/admin/analytics", { credentials: "include" })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.message)
        return d
      })
      .then((d) => setData(d.analytics))
      .catch((err: any) => toast.error("Analytics", { description: err.message }))
      .finally(() => setLoading(false))
  }, [])

  const revenueChartData = useMemo(() => {
    if (!data?.revenueByMonth) return []
    return data.revenueByMonth.map((m: any) => ({
      label: m.month,
      value: Math.round(m.revenue / 100), // dollars
      orders: m.orders,
    }))
  }, [data])

  const maxRevenue = useMemo(
    () => Math.max(...revenueChartData.map((d) => d.value), 0),
    [revenueChartData]
  )

  const currency = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100)

  if (loading) {
    return (
      <Container className="p-8">
        <Text>Loading analytics…</Text>
      </Container>
    )
  }

  if (!data) {
    return (
      <Container className="p-8">
        <Text className="text-ui-fg-subtle">Could not load analytics data.</Text>
      </Container>
    )
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "completed": case "fulfilled": return "green"
      case "processing": case "pending": return "orange"
      case "requires_action": return "red"
      case "canceled": return "grey"
      default: return "grey"
    }
  }

  return (
    <Container className="p-8 flex flex-col gap-y-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div>
        <Heading level="h1">Store Analytics</Heading>
        <Text className="text-ui-fg-subtle mt-1">
          Revenue, orders, products, and vendor performance at a glance.
        </Text>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<ShoppingCart />}
          label="Total Revenue"
          value={currency(data.totalRevenue)}
          sub={`${data.totalOrders} orders`}
          trend={{ value: data.revenueGrowth || 0, positive: (data.revenueGrowth || 0) >= 0 }}
        />
        <StatCard
          icon={<ChartBar />}
          label="Avg Order Value"
          value={currency(data.aov)}
        />
        <StatCard
          icon={<ArchiveBox />}
          label="Active Orders"
          value={String(data.activeOrders)}
          sub={`${data.totalOrders} total`}
        />
        <StatCard
          icon={<Users />}
          label="Vendors"
          value={String(data.vendorSummary?.total || 0)}
          sub={`${data.vendorSummary?.approved || 0} approved`}
        />
      </div>

      {/* ── Revenue Chart ────────────────────────────────────────────── */}
      <div className="border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <Heading level="h2">Revenue (last 12 months)</Heading>
          <Badge size="small" color="blue">${(maxRevenue > 0 ? Math.round(maxRevenue) : 0).toLocaleString()} max</Badge>
        </div>
        {revenueChartData.length > 0 ? (
          <div>
            <MiniBarChart data={revenueChartData} maxValue={maxRevenue} />
            <div className="flex justify-between mt-2 text-[8px] text-ui-fg-subtle font-mono">
              <span>{revenueChartData[0]?.label || ""}</span>
              <span>{revenueChartData[revenueChartData.length - 1]?.label || ""}</span>
            </div>
          </div>
        ) : (
          <Text className="text-ui-fg-subtle py-8 text-center">No revenue data available yet.</Text>
        )}
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* ── Order Status Breakdown ───────────────────────────────────── */}
        <div className="border rounded-lg p-5">
          <Heading level="h2" className="mb-4">Order Status</Heading>
          {Object.keys(data.statusBreakdown || {}).length > 0 ? (
            <div className="flex flex-col gap-2">
              {Object.entries(data.statusBreakdown)
                .sort(([, a]: any, [, b]: any) => b - a)
                .map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge color={statusColor(status)}>{status.replace(/_/g, " ")}</StatusBadge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-ui-bg-base rounded-full overflow-hidden">
                        <div
                          className="h-full bg-ui-tag-blue-bg rounded-full"
                          style={{
                            width: `${data.totalOrders > 0 ? (Number(count) / data.totalOrders) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <Text size="small" className="font-mono w-12 text-right">{count as number}</Text>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Text className="text-ui-fg-subtle">No orders yet.</Text>
          )}
        </div>

        {/* ── Vendor Summary ───────────────────────────────────────────── */}
        <div className="border rounded-lg p-5">
          <Heading level="h2" className="mb-4">Vendors</Heading>
          {data.vendorSummary && data.vendorSummary.total > 0 ? (
            <div className="flex flex-col gap-2">
              {[
                ["approved", "green"],
                ["pending", "orange"],
                ["rejected", "red"],
                ["suspended", "grey"],
              ].map(([status, color]) => (
                <div key={status} className="flex items-center justify-between py-1.5">
                  <span className="capitalize text-ui-fg-base text-sm font-medium">{status}</span>
                  <span className="font-mono text-sm">
                    {data.vendorSummary[status] || 0}
                  </span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 flex items-center justify-between">
                <span className="font-semibold text-sm">Total</span>
                <span className="font-mono font-semibold">{data.vendorSummary.total}</span>
              </div>
            </div>
          ) : (
            <Text className="text-ui-fg-subtle">No vendors registered yet.</Text>
          )}

          {/* ── Payment Status ─────────────────────────────────────────── */}
          {data.paymentStatusBreakdown && Object.keys(data.paymentStatusBreakdown).length > 0 && (
            <>
              <div className="border-t my-4" />
              <Heading level="h2" className="mb-4">Payment Status</Heading>
              <div className="flex flex-col gap-2">
                {Object.entries(data.paymentStatusBreakdown)
                  .sort(([, a]: any, [, b]: any) => b - a)
                  .map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between py-1">
                      <span className="capitalize text-sm">{status.replace(/_/g, " ")}</span>
                      <span className="font-mono text-sm">{count as number}</span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Top Products ──────────────────────────────────────────────── */}
      <div className="border rounded-lg p-5">
        <Heading level="h2" className="mb-4">Top Products (by revenue)</Heading>
        {data.topProducts && data.topProducts.length > 0 ? (
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
              {data.topProducts.map((p: any, i: number) => (
                <Table.Row key={p.title}>
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
          <Text className="text-ui-fg-subtle">No products sold yet.</Text>
        )}
      </div>

      {/* ── Recent Orders ─────────────────────────────────────────────── */}
      <div className="border rounded-lg p-5">
        <Heading level="h2" className="mb-4">Recent Orders</Heading>
        {data.recentOrders && data.recentOrders.length > 0 ? (
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
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.recentOrders.map((o: any) => (
                <Table.Row key={o.id}>
                  <Table.Cell className="font-mono text-xs">
                    #{o.display_id || o.id.slice(-8).toUpperCase()}
                  </Table.Cell>
                  <Table.Cell className="max-w-[140px] truncate" title={o.email}>
                    {o.email}
                  </Table.Cell>
                  <Table.Cell>{o.items_count}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={statusColor(o.status)}>
                      {o.status.replace(/_/g, " ")}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell>
                    {o.payment_status ? (
                      <span className="text-xs capitalize">{o.payment_status.replace(/_/g, " ")}</span>
                    ) : (
                      <Text size="small" className="text-ui-fg-subtle">—</Text>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right font-mono">
                    {currency(o.total)}
                  </Table.Cell>
                  <Table.Cell className="text-xs text-ui-fg-subtle">
                    {new Date(o.created_at).toLocaleDateString()}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <Text className="text-ui-fg-subtle">No orders yet.</Text>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Analytics", icon: ChartBar })
export default AnalyticsPage
