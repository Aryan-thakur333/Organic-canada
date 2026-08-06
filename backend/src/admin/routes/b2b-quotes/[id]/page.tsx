import { ArrowLeft, CheckCircle, PencilSquare, XCircle } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  useB2BQuote,
  useRejectB2BQuote,
  useSaveB2BQuoteNegotiatedTotal,
  useSendB2BQuote,
  useUpdateB2BQuoteItem,
} from "../../../hooks/b2b-quotes"
import B2BQuoteChat from "../../../components/b2b-quote-chat"
import type { B2BQuoteItem } from "../../../types"

const statusColor = (status?: string): any =>
  ({
    pending_merchant: "orange",
    pending_customer: "blue",
    accepted: "green",
    customer_rejected: "red",
    merchant_rejected: "red",
    pending_review: "orange",
    pending: "orange",
    approved: "blue",
    rejected: "red",
  }[status || ""] || "grey")

const editableStatuses = ["pending_merchant", "pending_review"]
const rejectableStatuses = ["pending_merchant", "pending_review", "pending_customer"]

const formatMoney = (amount?: number, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(Number(amount || 0) / 100)

const moneyAmount = (amount?: number | null) => Number(amount ?? 0)

const formatDateTime = (date?: string) =>
  date ? new Date(date).toLocaleString("en-CA") : "-"

const B2BQuoteDetailPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const quoteQuery = useB2BQuote(id)
  const sendQuote = useSendB2BQuote(id)
  const rejectQuote = useRejectB2BQuote(id)
  const updateQuoteItem = useUpdateB2BQuoteItem(id)
  const saveNegotiatedTotal = useSaveB2BQuoteNegotiatedTotal(id)

  const quote = quoteQuery.data?.quote
  const currency = quote?.currency_code || quote?.preview?.currency_code || "CAD"
  const items = useMemo(
    () => quote?.items || quote?.preview?.items || [],
    [quote]
  )

  const [editItem, setEditItem] = useState<B2BQuoteItem | null>(null)
  const [editQuantity, setEditQuantity] = useState("")
  const [editPrice, setEditPrice] = useState("")
  const [sendOpen, setSendOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [adminNote, setAdminNote] = useState("")
  const [rejectReason, setRejectReason] = useState("")
  const [negotiatedTotalInput, setNegotiatedTotalInput] = useState("")

  const canEdit = editableStatuses.includes(quote?.status || "")
  const canSend = editableStatuses.includes(quote?.status || "")
  const canReject = rejectableStatuses.includes(quote?.status || "")
  const originalTotal = moneyAmount(quote?.original_total ?? quote?.requested_total ?? quote?.preview?.original_subtotal)
  const negotiatedTotal = moneyAmount(quote?.negotiated_subtotal ?? quote?.negotiated_total ?? quote?.preview?.subtotal)
  const commissionAmount = moneyAmount(quote?.commission_amount ?? quote?.commission?.amount)
  const finalPayableTotal = moneyAmount(quote?.final_payable_total ?? quote?.commission?.final_payable_total ?? quote?.total ?? quote?.preview?.total)
  const savingsTotal = Math.max(0, originalTotal - negotiatedTotal)
  const commissionValue = Number(quote?.commission_value ?? quote?.commission?.fee_value ?? 0)
  const negotiatedInputMinor = Number.isFinite(Number(negotiatedTotalInput))
    ? Math.round(Number(negotiatedTotalInput) * 100)
    : negotiatedTotal
  const previewCommissionAmount = commissionValue > 0
    ? Math.round((Math.max(0, negotiatedInputMinor) * commissionValue) / 100)
    : commissionAmount
  const previewFinalPayableTotal = Math.max(0, negotiatedInputMinor) + previewCommissionAmount
  const pricingDirty = negotiatedTotalInput !== "" && negotiatedInputMinor !== negotiatedTotal

  useEffect(() => {
    if (!quote) return
    setNegotiatedTotalInput((negotiatedTotal / 100).toFixed(2))
  }, [quote?.id, negotiatedTotal])

  const openEdit = (item: B2BQuoteItem) => {
    setEditItem(item)
    setEditQuantity(String(item.quantity || 1))
    setEditPrice(String(Number(item.unit_price ?? item.negotiated_unit_price ?? 0) / 100))
  }

  const saveEdit = async () => {
    if (!editItem) return

    const quantity = Number(editQuantity)
    const unitPrice = Number(editPrice)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quote item", { description: "Quantity must be greater than 0." })
      return
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error("Quote item", { description: "Unit price must be greater than 0." })
      return
    }

    try {
      await updateQuoteItem.mutateAsync({
        item_id: editItem.id,
        quantity,
        unit_price: unitPrice,
      })
      toast.success("Quote item updated")
      setEditItem(null)
    } catch (error: any) {
      toast.error("Quote item", {
        description: error.message || "Failed to update quote item",
      })
    }
  }

  const savePricing = async () => {
    const negotiatedTotalMajor = Number(negotiatedTotalInput)
    if (!Number.isFinite(negotiatedTotalMajor) || negotiatedTotalMajor <= 0) {
      toast.error("Negotiated pricing", { description: "Negotiated merchandise total must be greater than 0." })
      return
    }

    try {
      const result = await saveNegotiatedTotal.mutateAsync({
        negotiated_total: negotiatedTotalInput,
        admin_note: adminNote || undefined,
      })
      toast.success("Pricing saved", {
        description: result.message || "Negotiated merchandise total saved.",
      })
    } catch (error: any) {
      toast.error("Negotiated pricing", {
        description: error.message || "Failed to save negotiated pricing",
      })
    }
  }

  const submitSend = async () => {
    if (pricingDirty) {
      toast.error("Send offer", { description: "Save negotiated pricing before sending the final offer." })
      return
    }

    try {
      const result = await sendQuote.mutateAsync({ admin_note: adminNote || undefined })
      toast.success("Offer sent", {
        description: result.message || "Quote offer sent to customer.",
      })
      setSendOpen(false)
    } catch (error: any) {
      toast.error("Send offer", {
        description: error.message || "Failed to send quote offer",
      })
    }
  }

  const submitReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Reject quote", { description: "Rejection reason is required." })
      return
    }

    try {
      const result = await rejectQuote.mutateAsync({
        reason: rejectReason.trim(),
        admin_note: adminNote || undefined,
      })
      toast.success("Quote rejected", {
        description: result.message || "Quote rejected successfully.",
      })
      setRejectOpen(false)
    } catch (error: any) {
      toast.error("Reject quote", {
        description: error.message || "Failed to reject quote",
      })
    }
  }

  if (quoteQuery.isLoading) {
    return (
      <Container className="p-8">
        <Text className="text-ui-fg-subtle">Loading quote...</Text>
      </Container>
    )
  }

  if (!quote) {
    return (
      <Container className="p-8 flex flex-col gap-y-4">
        <Text weight="plus">Quote not found</Text>
        <Button onClick={() => navigate("/b2b-quotes")}>Back to B2B Quotes</Button>
      </Container>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-8 flex flex-col gap-y-6">
      <Button
        variant="transparent"
        onClick={() => navigate("/b2b-quotes")}
        className="w-fit pl-0"
      >
        <ArrowLeft className="mr-2" />
        Back to B2B Quotes
      </Button>

      <Container className="flex flex-col gap-y-5">
        <div className="flex items-start justify-between gap-x-4">
          <div>
            <Heading level="h1">Quote {quote.id}</Heading>
            <Text className="text-ui-fg-subtle">Created {formatDateTime(quote.created_at)}</Text>
          </div>
          <StatusBadge color={statusColor(quote.status)}>{quote.status}</StatusBadge>
        </div>

        <div className="flex flex-wrap gap-2">
          {canSend && (
            <Button onClick={() => setSendOpen(true)} disabled={sendQuote.isPending || pricingDirty}>
              <CheckCircle className="mr-2" />
              Send Offer to Customer
            </Button>
          )}
          {canReject && (
            <Button variant="danger" onClick={() => setRejectOpen(true)} disabled={rejectQuote.isPending}>
              <XCircle className="mr-2" />
              Reject Quote
            </Button>
          )}
        </div>
      </Container>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Container className="flex flex-col gap-y-3">
          <Heading level="h2">Company</Heading>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Name</Text>
            <Text weight="plus">{quote.company?.company_name || quote.company_name || "-"}</Text>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle uppercase">Tax ID</Text>
              <Text>{quote.company?.tax_id || quote.company?.gstin || "-"}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle uppercase">Status</Text>
              <Text>{quote.company?.status || quote.company_status || "-"}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle uppercase">Credit Limit</Text>
              <Text>{formatMoney(quote.company?.approved_credit_limit || quote.company?.credit_limit, currency)}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle uppercase">Company ID</Text>
              <Text>{quote.company_id || "-"}</Text>
            </div>
          </div>
        </Container>

        <Container className="flex flex-col gap-y-3">
          <Heading level="h2">Customer</Heading>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Email</Text>
            <Text weight="plus">{quote.customer_email || quote.customer?.email || "-"}</Text>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle uppercase">Name</Text>
              <Text>{quote.customer_name || [quote.customer?.first_name, quote.customer?.last_name].filter(Boolean).join(" ") || "-"}</Text>
            </div>
            <div>
              <Text size="xsmall" className="text-ui-fg-subtle uppercase">Customer ID</Text>
              <Text>{quote.customer_id || "-"}</Text>
            </div>
          </div>
        </Container>
      </div>

      <Container className="flex flex-col gap-y-4">
        <div className="flex items-start justify-between gap-x-4">
          <div>
            <Heading level="h2">Negotiation</Heading>
            <Text className="text-ui-fg-subtle">
              Chat messages are display-only. Save structured pricing before sending a final offer.
            </Text>
          </div>
          {pricingDirty && <Badge color="orange">Unsaved pricing</Badge>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Original Total</Text>
            <Text weight="plus">{formatMoney(originalTotal, currency)}</Text>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Negotiated Merchandise Total</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              value={negotiatedTotalInput}
              disabled={!canEdit || saveNegotiatedTotal.isPending}
              onChange={(event) => setNegotiatedTotalInput(event.target.value)}
            />
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">
              B2B Fee {commissionValue > 0 ? `${commissionValue}%` : ""}
            </Text>
            <Text weight="plus">{formatMoney(previewCommissionAmount, currency)}</Text>
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Customer Final Payable</Text>
            <Text weight="plus">{formatMoney(previewFinalPayableTotal, currency)}</Text>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={savePricing} disabled={!canEdit || !pricingDirty || saveNegotiatedTotal.isPending}>
            Save Pricing
          </Button>
          {canSend && (
            <Button variant="secondary" onClick={() => setSendOpen(true)} disabled={pricingDirty || sendQuote.isPending}>
              Send Final Offer
            </Button>
          )}
        </div>
      </Container>

      <Container className="flex flex-col gap-y-4">
        <div className="flex items-center justify-between">
          <Heading level="h2">Items</Heading>
          <Badge>{items.length} items</Badge>
        </div>

        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Product / Item</Table.HeaderCell>
              <Table.HeaderCell>SKU</Table.HeaderCell>
              <Table.HeaderCell>Quantity</Table.HeaderCell>
              <Table.HeaderCell>Original Unit</Table.HeaderCell>
              <Table.HeaderCell>Negotiated Unit</Table.HeaderCell>
              <Table.HeaderCell>Original Line</Table.HeaderCell>
              <Table.HeaderCell>Negotiated Line</Table.HeaderCell>
              <Table.HeaderCell>State</Table.HeaderCell>
              {canEdit && <Table.HeaderCell className="text-right">Action</Table.HeaderCell>}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {items.map((item) => {
              const quantity = Number(item.quantity || 0)
              const originalUnit = moneyAmount(item.original_unit_price ?? item.metadata?.original_unit_price ?? item.requested_unit_price ?? item.unit_price)
              const negotiatedUnit = moneyAmount(item.negotiated_unit_price ?? item.unit_price ?? item.requested_unit_price)
              return (
              <Table.Row key={item.id}>
                <Table.Cell>
                  <Text size="small" weight="plus">{item.title}</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">{item.variant_id || "Manual item"}</Text>
                </Table.Cell>
                <Table.Cell>{item.sku || "-"}</Table.Cell>
                <Table.Cell>{item.quantity}</Table.Cell>
                <Table.Cell>{formatMoney(originalUnit, currency)}</Table.Cell>
                <Table.Cell>{formatMoney(negotiatedUnit, currency)}</Table.Cell>
                <Table.Cell>{formatMoney(originalUnit * quantity, currency)}</Table.Cell>
                <Table.Cell>{formatMoney(item.line_total ?? item.total ?? negotiatedUnit * quantity, currency)}</Table.Cell>
                <Table.Cell>
                  {(item.modified_by_admin || item.metadata?.modified_by_admin) ? (
                    <Badge size="small" color="blue">Modified</Badge>
                  ) : (
                    <Badge size="small">Original</Badge>
                  )}
                </Table.Cell>
                {canEdit && (
                  <Table.Cell className="text-right">
                    <Button size="small" variant="secondary" onClick={() => openEdit(item)}>
                      <PencilSquare className="mr-2" />
                      Edit
                    </Button>
                  </Table.Cell>
                )}
              </Table.Row>
              )
            })}
          </Table.Body>
        </Table>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-ui-border-base pt-4">
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Original Total</Text>
            <Text weight="plus">{formatMoney(originalTotal, currency)}</Text>
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Negotiated Subtotal</Text>
            <Text weight="plus">{formatMoney(negotiatedTotal, currency)}</Text>
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">B2B Commission</Text>
            <Text weight="plus">{formatMoney(commissionAmount, currency)}</Text>
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Customer Payable</Text>
            <Text weight="plus">{formatMoney(finalPayableTotal, currency)}</Text>
          </div>
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          Savings before commission: {formatMoney(savingsTotal, currency)}
        </Text>
      </Container>

      <B2BQuoteChat quote={quote} />

      <Container className="flex flex-col gap-y-3">
        <Heading level="h2">Notes</Heading>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Customer Note</Text>
            <Text>{quote.note || quote.buyer_note || "-"}</Text>
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Admin Note</Text>
            <Text>{quote.admin_note || "-"}</Text>
          </div>
          <div>
            <Text size="xsmall" className="text-ui-fg-subtle uppercase">Rejection Reason</Text>
            <Text>{quote.rejection_reason || "-"}</Text>
          </div>
        </div>
        {quote.status === "pending_customer" && (
          <Text className="text-ui-fg-subtle">Waiting for customer response.</Text>
        )}
        {quote.status === "accepted" && (
          <Text className="text-ui-fg-subtle">Accepted quotes are locked.</Text>
        )}
        {quote.status === "customer_rejected" && (
          <Text className="text-ui-fg-subtle">Rejected by customer.</Text>
        )}
        {quote.status === "merchant_rejected" && (
          <Text className="text-ui-fg-subtle">Rejected by merchant.</Text>
        )}
      </Container>

      <Drawer open={Boolean(editItem)} onOpenChange={(open) => !open && setEditItem(null)}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Edit Quote Item</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-4">
            <Text weight="plus">{editItem?.title}</Text>
            <div className="flex flex-col gap-y-2">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Negotiated Unit Price</Label>
              <Input type="number" min={0.01} step={0.01} value={editPrice} onChange={(event) => setEditPrice(event.target.value)} />
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Button variant="secondary" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={updateQuoteItem.isPending}>Save</Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>

      <Drawer open={sendOpen} onOpenChange={setSendOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Send Offer to Customer</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label>Admin Note</Label>
              <Textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} />
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Button variant="secondary" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button onClick={submitSend} disabled={sendQuote.isPending}>Send Offer</Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>

      <Drawer open={rejectOpen} onOpenChange={setRejectOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Reject Quote</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label>Reason</Label>
              <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Internal Admin Note</Label>
              <Textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} />
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={submitReject} disabled={rejectQuote.isPending}>
              Reject Quote
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </div>
  )
}

export default B2BQuoteDetailPage
