import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingStorefront, Users, CurrencyDollar, ArchiveBox, CheckCircle, XCircle, ExclamationCircle } from "@medusajs/icons"
import { Container, Heading, Table, Text, StatusBadge, Badge, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

/* ────────────────────────────────────────────────────────────────────────────
   Stat card component
   ──────────────────────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string
}) {
  return (
    <div className="border rounded-lg p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-ui-fg-subtle">
        {icon}
        <Text size="small">{label}</Text>
      </div>
      <Heading level="h2" className="mt-1">{value}</Heading>
      {sub && <Text size="small" className="text-ui-fg-subtle">{sub}</Text>}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   Marketplace Overview — Admin-level metrics only
   ──────────────────────────────────────────────────────────────────────────── */
const MarketplaceOverviewPage = () => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/admin/marketplace-overview", { credentials: "include" })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.message)
        return d.marketplace
      })
      .then((marketplace) => {
        setData(marketplace)
      })
      .catch((error) => toast.error("Marketplace Overview", { description: error.message }))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    if (!data) return null
    const health = data.vendor_health || {}
    const rankings = data.vendor_rankings || []

    return {
      total: health.total || 0,
      pending: health.pending || 0,
      approved: health.approved || 0,
      suspended: health.suspended || 0,
      rejected: health.rejected || 0,
      totalVendorProducts: data.total_products || 0,
      marketplaceRevenue: Number(data.total_revenue_cents || 0),
      totalOrders: data.total_completed_orders || 0,
      topVendors: rankings.slice(0, 10).map((v: any) => ({
        id: v.vendor_id,
        name: v.vendor_name,
        productCount: v.product_count,
        revenue: v.revenue_cents,
        orderCount: v.order_count,
      })),
    }
  }, [data])

  const currency = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100)

  if (loading) {
    return (
      <Container className="p-8">
        <Text>Loading marketplace data…</Text>
      </Container>
    )
  }

  if (!stats) {
    return (
      <Container className="p-8">
        <Text className="text-ui-fg-subtle">Could not load marketplace data.</Text>
      </Container>
    )
  }

  return (
    <Container className="p-8 flex flex-col gap-y-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div>
        <Heading level="h1">Marketplace Overview</Heading>
        <Text className="text-ui-fg-subtle mt-1">
          High-level metrics for the entire marketplace — vendors, products, and revenue.
        </Text>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Users />}
          label="Total Vendors"
          value={stats.total}
          sub={`${stats.approved} approved · ${stats.pending} pending · ${stats.suspended} suspended`}
        />
        <StatCard
          icon={<ArchiveBox />}
          label="Vendor Products"
          value={stats.totalVendorProducts}
          sub="Across all approved vendors"
        />
        <StatCard
          icon={<CurrencyDollar />}
          label="Marketplace Revenue"
          value={currency(stats.marketplaceRevenue)}
          sub={`${stats.totalOrders} total orders`}
        />
        <StatCard
          icon={<BuildingStorefront />}
          label="Active Vendors"
          value={stats.approved}
          sub={`${stats.pending} awaiting review`}
        />
      </div>

      {/* ── Vendor Status Summary ────────────────────────────────────── */}
      <div className="border rounded-lg p-5">
        <Heading level="h2" className="mb-4">Vendor Health</Heading>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Approved", value: stats.approved, color: "green", icon: <CheckCircle className="w-4 h-4" /> },
            { label: "Pending", value: stats.pending, color: "orange", icon: <ExclamationCircle className="w-4 h-4" /> },
            { label: "Suspended", value: stats.suspended, color: "grey", icon: <ExclamationCircle className="w-4 h-4" /> },
            { label: "Rejected", value: stats.rejected, color: "red", icon: <XCircle className="w-4 h-4" /> },
            { label: "Total", value: stats.total, color: "blue", icon: <Users className="w-4 h-4" /> },
          ].map((item) => (
            <div key={item.label} className="border rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-1 text-ui-fg-subtle mb-1">
                {item.icon}
                <Text size="small">{item.label}</Text>
              </div>
              <Heading level="h2">{item.value}</Heading>
            </div>
          ))}
        </div>
      </div>

      {/* ── Top Vendors (by revenue) ──────────────────────────────────── */}
      <div className="border rounded-lg p-5">
        <Heading level="h2" className="mb-4">Top Vendors (by revenue)</Heading>
        {stats.topVendors.length > 0 ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>#</Table.HeaderCell>
                <Table.HeaderCell>Vendor</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Products</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Orders</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Revenue</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {stats.topVendors.map((vendor: any, i: number) => (
                <Table.Row key={vendor.id}>
                  <Table.Cell className="text-ui-fg-subtle font-mono text-xs">{i + 1}</Table.Cell>
                  <Table.Cell className="font-medium">{vendor.name}</Table.Cell>
                  <Table.Cell className="text-right font-mono">{vendor.productCount}</Table.Cell>
                  <Table.Cell className="text-right font-mono">{vendor.orderCount}</Table.Cell>
                  <Table.Cell className="text-right font-mono">{currency(vendor.revenue)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <Text className="text-ui-fg-subtle py-4 text-center">No vendors with products yet.</Text>
        )}
      </div>

      {/* ── Recent Vendors ────────────────────────────────────────────── */}
      <div className="border rounded-lg p-5">
        <Heading level="h2" className="mb-4">Recent Registrations</Heading>
        {data?.vendors?.length > 0 ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Store</Table.HeaderCell>
                <Table.HeaderCell>Email</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Products</Table.HeaderCell>
                <Table.HeaderCell>Revenue</Table.HeaderCell>
                <Table.HeaderCell>Joined</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(data.vendors || []).slice(0, 10).map((vendor: any) => (
                <Table.Row key={vendor.id}>
                  <Table.Cell className="font-medium">{vendor.name}</Table.Cell>
                  <Table.Cell>{vendor.email}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge
                      color={vendor.status === "approved" ? "green" : vendor.status === "pending" ? "orange" : vendor.status === "rejected" ? "red" : "grey"}
                    >
                      {vendor.status}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell className="font-mono">{vendor.product_count}</Table.Cell>
                  <Table.Cell className="font-mono">{currency(vendor.total_revenue_cents)}</Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle text-xs">
                    {new Date(vendor.created_at).toLocaleDateString()}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <Text className="text-ui-fg-subtle py-4 text-center">No vendors registered yet.</Text>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Marketplace Overview",
  icon: BuildingStorefront,
})

export default MarketplaceOverviewPage
