import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
  toast,
  Input,
  Textarea,
  DatePicker,
  Drawer,
  Label,
  Badge,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

// ── Helpers ────────────────────────────────────────────────────────────────

const color = (status: string): any =>
  ({
    draft: "grey",
    pending: "orange",
    pending_review: "orange",
    approved: "blue",
    accepted: "green",
    converted_to_cart: "green",
    converted_to_order: "purple",
    rejected: "red",
    expired: "grey",
  }[status] || "grey")

const fmtPrice = (cents: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    (cents || 0) / 100
  )

const fmtDate = (iso: string) => {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

// ── Review Drawer Component ────────────────────────────────────────────────

const ReviewDrawer = ({
  quote,
  open,
  onClose,
  onComplete,
}: {
  quote: any
  open: boolean
  onClose: () => void
  onComplete: () => void
}) => {
  const [adminNote, setAdminNote] = useState("")
  const [rejectionReason, setRejectionReason] = useState("")
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  )
  const [negotiatedPrices, setNegotiatedPrices] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Initialize negotiated prices from requested items
  useEffect(() => {
    if (quote) {
      const items = quote.requested_items || quote.items || []
      const prices: Record<string, string> = {}
      items.forEach((item: any) => {
        prices[item.variant_id] = String(
          item.negotiated_unit_price || item.requested_unit_price || item.unit_price || 0
        )
      })
      setNegotiatedPrices(prices)
      setAdminNote(quote.admin_note || "")
      setRejectionReason("")
    }
  }, [quote])

  const handleApprove = async () => {
    setSubmitting(true)
    try {
      const items = quote.requested_items || quote.items || []
      const negotiated_items = items.map((item: any) => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        negotiated_unit_price: Math.round(
          Number(negotiatedPrices[item.variant_id] || item.requested_unit_price || item.unit_price || 0)
        ),
      }))

      const response = await fetch(`/admin/b2b-quotes/${quote.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "approved",
          negotiated_items,
          admin_note: adminNote || null,
          expires_at: expiryDate ? new Date(expiryDate).toISOString() : undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error("Approval failed", { description: data.message })
        return
      }
      toast.success("Quote approved")
      onComplete()
      onClose()
    } catch (err: any) {
      toast.error("Approval failed", { description: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Rejection reason is required")
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch(`/admin/b2b-quotes/${quote.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          rejection_reason: rejectionReason.trim(),
          admin_note: adminNote || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        toast.error("Rejection failed", { description: data.message })
        return
      }
      toast.success("Quote rejected")
      onComplete()
      onClose()
    } catch (err: any) {
      toast.error("Rejection failed", { description: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (!quote) return null

  const items = quote.requested_items || quote.items || []

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Review Quote #{quote.id?.slice(-8).toUpperCase()}</Drawer.Title>
          <Drawer.Description>
            {quote.company_name || "Unknown Company"} — {quote.customer_email}
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-6">
          {/* Requested Items */}
          <div>
            <Heading level="h2" className="mb-2">
              Requested Items ({items.length})
            </Heading>
            <div className="flex flex-col gap-y-2">
              {items.map((item: any, idx: number) => (
                <div
                  key={item.variant_id || idx}
                  className="border border-ui-border-base rounded-lg p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <Text size="small" weight="plus">
                        {item.title}
                      </Text>
                      {item.sku && (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          SKU: {item.sku}
                        </Text>
                      )}
                    </div>
                    <Badge size="small" color="blue">
                      Qty: {item.quantity}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Text size="small" className="text-ui-fg-subtle">
                      Current price:
                    </Text>
                    <Text size="small" weight="plus">
                      {fmtPrice(
                        item.current_calculated_unit_price ||
                          item.requested_unit_price ||
                          item.unit_price ||
                          0
                      )}
                    </Text>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Label>Negotiated unit price (cents):</Label>
                    <Input
                      type="number"
                      min={0}
                      value={negotiatedPrices[item.variant_id] || ""}
                      onChange={(e) =>
                        setNegotiatedPrices((prev) => ({
                          ...prev,
                          [item.variant_id]: e.target.value,
                        }))
                      }
                      className="w-32"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Admin Note */}
          <div>
            <Label>Admin Note</Label>
            <Textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Optional note to the buyer..."
              rows={3}
            />
          </div>

          {/* Expiry Date */}
          <div>
            <Label>Expiry Date</Label>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>

          {/* Rejection Reason */}
          <div>
            <Label>Rejection Reason (required for rejection)</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Quantity too low for wholesale pricing..."
              rows={2}
            />
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          <div className="flex gap-2 w-full">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleReject}
              disabled={submitting}
            >
              {submitting ? "Processing..." : "Reject Quote"}
            </Button>
            <Button
              className="flex-1"
              onClick={handleApprove}
              disabled={submitting}
            >
              {submitting ? "Processing..." : "Approve Quote"}
            </Button>
          </div>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

const B2BQuotesPage = () => {
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")
  const [reviewQuote, setReviewQuote] = useState<any>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "200" })
      if (statusFilter) params.set("status", statusFilter)
      const response = await fetch(`/admin/b2b-quotes?${params.toString()}`, {
        credentials: "include",
      })
      if (!response.ok) throw new Error((await response.json()).message || "Unable to load quotes")
      setQuotes((await response.json()).quotes || [])
    } catch (error: any) {
      toast.error("B2B quotes", { description: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [statusFilter])

  const openReview = (quote: any) => {
    setReviewQuote(quote)
    setDrawerOpen(true)
  }

  const statuses = [
    { value: "", label: "All" },
    { value: "pending_review", label: "Pending Review" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "accepted", label: "Accepted" },
    { value: "converted_to_order", label: "Converted" },
    { value: "expired", label: "Expired" },
  ]

  return (
    <Container className="p-8 flex flex-col gap-y-6">
      <div>
        <Heading level="h1">B2B Wholesale Quotes</Heading>
        <Text className="text-ui-fg-subtle">
          Review, negotiate, approve, and reject corporate quote requests.
        </Text>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <Button
            key={s.value}
            size="small"
            variant={statusFilter === s.value ? "primary" : "secondary"}
            onClick={() => setStatusFilter(s.value)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <Text>Loading quotes…</Text>
      ) : quotes.length === 0 ? (
        <Text className="py-12 text-center">No wholesale quotes yet.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Quote</Table.HeaderCell>
              <Table.HeaderCell>Company / Customer</Table.HeaderCell>
              <Table.HeaderCell>Items</Table.HeaderCell>
              <Table.HeaderCell>Requested</Table.HeaderCell>
              <Table.HeaderCell>Negotiated</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Created</Table.HeaderCell>
              <Table.HeaderCell>Expires</Table.HeaderCell>
              <Table.HeaderCell>Action</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {quotes.map((quote) => (
              <Table.Row key={quote.id}>
                <Table.Cell>
                  <Text size="small" weight="plus">
                    #{quote.id?.slice(-8).toUpperCase()}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <div>
                    <Text size="small" weight="plus">
                      {quote.company_name || "—"}
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {quote.customer_email}
                    </Text>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="small" color="blue">
                    {quote.items_count || quote.requested_items?.length || quote.items?.length || 0}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">
                    {fmtPrice(quote.requested_total || quote.subtotal || 0)}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" weight="plus">
                    {quote.negotiated_total != null
                      ? fmtPrice(quote.negotiated_total)
                      : "—"}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge color={color(quote.status)}>
                    {quote.status}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{fmtDate(quote.created_at)}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{fmtDate(quote.expires_at)}</Text>
                </Table.Cell>
                <Table.Cell>
                  {["pending_review", "draft", "pending"].includes(quote.status) && (
                    <Button size="small" onClick={() => openReview(quote)}>
                      Review
                    </Button>
                  )}
                  {quote.status === "approved" && (
                    <Button size="small" variant="secondary" onClick={() => openReview(quote)}>
                      View
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* Review Drawer */}
      <ReviewDrawer
        quote={reviewQuote}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setReviewQuote(null)
        }}
        onComplete={load}
      />
    </Container>
  )
}

export const config = defineRouteConfig({ label: "B2B Quotes", icon: DocumentText })
export default B2BQuotesPage