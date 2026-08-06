import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useB2BQuotes } from "../../hooks/b2b-quotes"

const statuses = [
  { value: "", label: "All" },
  { value: "pending_merchant", label: "Pending Merchant" },
  { value: "pending_customer", label: "Pending Customer" },
  { value: "accepted", label: "Accepted" },
  { value: "customer_rejected", label: "Customer Rejected" },
  { value: "merchant_rejected", label: "Merchant Rejected" },
]

const statusColor = (status: string): any =>
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
  }[status] || "grey")

const formatMoney = (amount?: number, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(Number(amount || 0) / 100)

const formatDate = (date?: string) =>
  date
    ? new Date(date).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "-"

const B2BQuotesPage = () => {
  const navigate = useNavigate()
  const [status, setStatus] = useState("")
  const [q, setQ] = useState("")
  const quotesQuery = useB2BQuotes({ status, q, limit: 100 })
  const quotes = quotesQuery.data?.quotes || []
  const loading = quotesQuery.isLoading

  return (
    <Container className="p-8 flex flex-col gap-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">B2B Quotes</Heading>
          <Text className="text-ui-fg-subtle">
            Manage customer quote requests, counter offers, and merchant decisions.
          </Text>
        </div>
        <Button variant="secondary" onClick={() => quotesQuery.refetch()}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <Input
          className="max-w-md"
          placeholder="Search quote, company, or customer"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {statuses.map((item) => (
            <Button
              key={item.value}
              size="small"
              variant={status === item.value ? "primary" : "secondary"}
              onClick={() => setStatus(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="border border-ui-border-base rounded-lg overflow-hidden bg-ui-bg-base">
        {loading ? (
          <div className="p-8 text-center">
            <Text className="text-ui-fg-subtle">Loading quotes...</Text>
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-12 text-center">
            <DocumentText className="mx-auto mb-3 text-ui-fg-muted" />
            <Text weight="plus">No quotes found</Text>
            <Text size="small" className="text-ui-fg-subtle">
              Quote requests will appear here after B2B customers submit carts.
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Quote ID</Table.HeaderCell>
                <Table.HeaderCell>Company</Table.HeaderCell>
                <Table.HeaderCell>Customer Email</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Payable</Table.HeaderCell>
                <Table.HeaderCell>Items</Table.HeaderCell>
                <Table.HeaderCell>Created</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {quotes.map((quote) => (
                <Table.Row
                  key={quote.id}
                  className="cursor-pointer hover:bg-ui-bg-subtle"
                  onClick={() => navigate(`/b2b-quotes/${quote.id}`)}
                >
                  <Table.Cell>
                    <Text size="small" weight="plus">
                      {quote.id}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <div>
                      <Text size="small" weight="plus">
                        {quote.company?.company_name || quote.company_name || "-"}
                      </Text>
                      {quote.company_status && (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {quote.company_status}
                        </Text>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>{quote.customer_email || "-"}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={statusColor(quote.status)}>
                      {quote.status}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell>
                    {formatMoney(
                      quote.final_payable_total ?? quote.total ?? quote.negotiated_total ?? quote.requested_total,
                      quote.currency_code
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge size="small">{quote.item_count || quote.items_count || 0}</Badge>
                  </Table.Cell>
                  <Table.Cell>{formatDate(quote.created_at)}</Table.Cell>
                  <Table.Cell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button size="small" variant="secondary" onClick={() => navigate(`/b2b-quotes/${quote.id}`)}>
                      View
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "B2B Quotes",
  icon: DocumentText,
})

export default B2BQuotesPage
