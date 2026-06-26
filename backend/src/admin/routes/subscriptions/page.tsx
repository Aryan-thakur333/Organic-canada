import { Button, Container, Heading, StatusBadge, Table, Text, toast, Badge } from "@medusajs/ui"
import { useEffect, useState } from "react"

const SubscriptionsPage = () => {
  const [items, setItems] = useState<any[]>([])
  const [analytics, setAnalytics] = useState<any>({})
  const [failedPayments, setFailedPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"overview" | "failed">("overview")
  const [retrying, setRetrying] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [subsRes, failedRes] = await Promise.all([
        fetch("/admin/subscriptions", { credentials: "include" }).then(async (r) => {
          const d = await r.json()
          if (!r.ok) throw new Error(d.message)
          return d
        }),
        fetch("/admin/subscriptions/failed-payments", { credentials: "include" }).then(async (r) => {
          const d = await r.json()
          if (!r.ok) throw new Error(d.message)
          return d
        }),
      ])
      setItems(subsRes.subscriptions || [])
      setAnalytics(subsRes.analytics || {})
      setFailedPayments(failedRes.failed_payments || [])
    } catch (error: any) {
      toast.error("Subscriptions", { description: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const update = async (id: string, status: string) => {
    const response = await fetch(`/admin/subscriptions/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    const data = await response.json()
    if (!response.ok) return toast.error("Update failed", { description: data.message })
    toast.success(`Subscription ${status}`)
    await load()
  }

  const retryPayment = async (subscriptionId: string) => {
    setRetrying(subscriptionId)
    try {
      const response = await fetch("/admin/subscriptions/failed-payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: subscriptionId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      toast.success("Payment retried", { description: data.message })
      await load()
    } catch (error: any) {
      toast.error("Retry failed", { description: error.message })
    } finally {
      setRetrying(null)
    }
  }

  const mrrDollars = ((analytics.mrr || 0) / 100).toFixed(2)
  const churnPct = (analytics.churn_rate || 0).toFixed(1)
  const renewalPct = (analytics.renewal_success_rate || 0).toFixed(1)

  const statusColor = (status: string) => {
    switch (status) {
      case "active": return "green"
      case "trialing": return "blue"
      case "paused": return "orange"
      case "past_due": return "red"
      case "cancelled": case "expired": return "grey"
      default: return "grey"
    }
  }

  return (
    <Container className="p-8 flex flex-col gap-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">Farm Subscriptions</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Recurring deliveries, renewals, churn, and payment health.
          </Text>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === "overview" ? "primary" : "secondary"}
            size="small"
            onClick={() => setTab("overview")}
          >
            Overview
          </Button>
          <Button
            variant={tab === "failed" ? "primary" : "secondary"}
            size="small"
            onClick={() => setTab("failed")}
          >
            Failed Payments {failedPayments.length > 0 && `(${failedPayments.length})`}
          </Button>
        </div>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Total", analytics.total ?? 0],
          ["Active", analytics.active ?? 0],
          ["Paused", analytics.paused ?? 0],
          ["Cancelled", analytics.cancelled ?? 0],
          ["Past Due", analytics.past_due ?? 0],
          ["MRR", `$${mrrDollars}`],
          ["Churn Rate", `${churnPct}%`],
          ["Renewal Rate", `${renewalPct}%`],
          ["Failed Renewals", analytics.failed_renewals ?? 0],
        ].map(([label, value]) => (
          <div key={label as string} className="border rounded-lg p-4">
            <Text size="small" className="text-ui-fg-subtle">{label}</Text>
            <Heading level="h2" className="mt-1">{value ?? 0}</Heading>
          </div>
        ))}
      </div>

      {loading ? (
        <Text>Loading subscriptions…</Text>
      ) : tab === "failed" ? (
        <>
          {/* Failed Payments Tab */}
          <div>
            <Heading level="h2" className="mb-2">Failed Payment Management</Heading>
            <Text className="text-ui-fg-subtle mb-4">
              {failedPayments.length > 0
                ? `${failedPayments.length} subscription(s) with failed payment attempts.`
                : "No failed payment attempts. All subscriptions are healthy."}
            </Text>
          </div>

          {failedPayments.length === 0 ? (
            <Text className="py-12 text-center">All clear — no failed payments.</Text>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Customer</Table.HeaderCell>
                  <Table.HeaderCell>Product</Table.HeaderCell>
                  <Table.HeaderCell>Plan</Table.HeaderCell>
                  <Table.HeaderCell>Amount</Table.HeaderCell>
                  <Table.HeaderCell>Failures</Table.HeaderCell>
                  <Table.HeaderCell>Failure Reason</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Action</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {failedPayments.map((fp) => (
                  <Table.Row key={fp.id}>
                    <Table.Cell>{fp.customer_email}</Table.Cell>
                    <Table.Cell>{fp.product_title}</Table.Cell>
                    <Table.Cell className="uppercase">{fp.plan}</Table.Cell>
                    <Table.Cell>${(fp.amount / 100).toFixed(2)}</Table.Cell>
                    <Table.Cell>
                      <Badge color={fp.failed_payment_count >= 3 ? "red" : "orange"}>
                        {fp.failed_payment_count}/3
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="max-w-[200px] truncate" title={fp.last_failure_reason || ""}>
                      {fp.last_failure_reason || "—"}
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={statusColor(fp.status)}>{fp.status}</StatusBadge>
                    </Table.Cell>
                    <Table.Cell>
                      {fp.status !== "expired" && (
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => retryPayment(fp.id)}
                          disabled={retrying === fp.id}
                        >
                          {retrying === fp.id ? "Retrying…" : "Retry"}
                        </Button>
                      )}
                      {fp.status === "expired" && (
                        <Text className="text-ui-fg-subtle text-xs">Expired</Text>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </>
      ) : (
        /* All Subscriptions Tab */
        <>
          {items.length === 0 ? (
            <Text className="py-12 text-center">No subscriptions yet.</Text>
          ) : (
            <>
              {/* Subscriptions by Status Summary */}
              <div className="flex gap-4 text-sm">
                <Badge color="green">{analytics.active ?? 0} active</Badge>
                <Badge color="orange">{analytics.paused ?? 0} paused</Badge>
                <Badge color="red">{analytics.past_due ?? 0} past due</Badge>
                <Badge color="grey">{analytics.cancelled ?? 0} cancelled</Badge>
              </div>

              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Customer</Table.HeaderCell>
                    <Table.HeaderCell>Product</Table.HeaderCell>
                    <Table.HeaderCell>Plan</Table.HeaderCell>
                    <Table.HeaderCell>Amount</Table.HeaderCell>
                    <Table.HeaderCell>Next billing</Table.HeaderCell>
                    <Table.HeaderCell>Failures</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell>Action</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {items.map((item) => (
                    <Table.Row key={item.id}>
                      <Table.Cell>{item.customer_email}</Table.Cell>
                      <Table.Cell>{item.product_title}</Table.Cell>
                      <Table.Cell className="uppercase">{item.plan}</Table.Cell>
                      <Table.Cell>${(item.amount / 100).toFixed(2)}</Table.Cell>
                      <Table.Cell>
                        {item.next_billing_date
                          ? new Date(item.next_billing_date).toLocaleDateString()
                          : "—"}
                      </Table.Cell>
                      <Table.Cell>
                        {(item.failed_payment_count || 0) > 0 ? (
                          <Badge color="red" size="small">{item.failed_payment_count}</Badge>
                        ) : (
                          <Text className="text-ui-fg-subtle">0</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <StatusBadge color={statusColor(item.status)}>{item.status}</StatusBadge>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-2">
                          {item.status === "active" && (
                            <Button size="small" variant="secondary" onClick={() => update(item.id, "paused")}>
                              Pause
                            </Button>
                          )}
                          {item.status === "paused" && (
                            <Button size="small" onClick={() => update(item.id, "active")}>
                              Resume
                            </Button>
                          )}
                          {item.status === "past_due" && (
                            <Button
                              size="small"
                              variant="secondary"
                              onClick={() => retryPayment(item.id)}
                              disabled={retrying === item.id}
                            >
                              {retrying === item.id ? "…" : "Retry"}
                            </Button>
                          )}
                          {!["cancelled", "expired"].includes(item.status) && (
                            <Button size="small" variant="danger" onClick={() => update(item.id, "cancelled")}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </>
          )}
        </>
      )}
    </Container>
  )
}

// 🚫 Sidebar config removed — only core extensions (B2B Quotes, Vendor Approvals, Analytics, Marketplace Overview) are shown.
export default SubscriptionsPage
