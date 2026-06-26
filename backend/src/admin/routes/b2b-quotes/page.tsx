import { defineRouteConfig } from "@medusajs/admin-sdk"
import { DocumentText } from "@medusajs/icons"
import { Button, Container, Heading, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

const color = (status: string): any => ({
  draft: "grey", pending: "orange", approved: "blue", converted: "green", rejected: "red",
}[status] || "grey")

const B2BQuotesPage = () => {
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch("/admin/b2b-quotes?limit=200", { credentials: "include" })
      if (!response.ok) throw new Error((await response.json()).message || "Unable to load quotes")
      setQuotes((await response.json()).quotes || [])
    } catch (error: any) {
      toast.error("B2B quotes", { description: error.message })
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const review = async (quote: any, status: "approved" | "rejected") => {
    const note = window.prompt(status === "approved" ? "Optional approval note" : "Reason for rejection")
    if (note === null) return
    let negotiated_total: number | undefined
    if (status === "approved") {
      const amount = window.prompt("Negotiated total in CAD dollars (leave blank to keep subtotal)", "")
      if (amount === null) return
      if (amount.trim()) {
        negotiated_total = Math.round(Number(amount) * 100)
        if (!Number.isFinite(negotiated_total) || negotiated_total < 0) {
          toast.error("Enter a valid non-negative amount")
          return
        }
      }
    }
    const response = await fetch(`/admin/b2b-quotes/${quote.id}/review`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, admin_notes: note, negotiated_total }),
    })
    const data = await response.json()
    if (!response.ok) return toast.error("Review failed", { description: data.message })
    toast.success(status === "approved" ? "Quote approved; awaiting customer acceptance" : "Quote rejected")
    await load()
  }

  return <Container className="p-8 flex flex-col gap-y-6">
    <div><Heading level="h1">B2B Wholesale Quotes</Heading><Text className="text-ui-fg-subtle">Review, negotiate, approve, and reject corporate quote requests.</Text></div>
    {loading ? <Text>Loading quotes…</Text> : quotes.length === 0 ? <Text className="py-12 text-center">No wholesale quotes yet.</Text> :
      <Table><Table.Header><Table.Row><Table.HeaderCell>Quote</Table.HeaderCell><Table.HeaderCell>Company / Customer</Table.HeaderCell><Table.HeaderCell>Amount</Table.HeaderCell><Table.HeaderCell>Status</Table.HeaderCell><Table.HeaderCell>Action</Table.HeaderCell></Table.Row></Table.Header>
      <Table.Body>{quotes.map((quote) => <Table.Row key={quote.id}>
        <Table.Cell>#{quote.id.slice(-8).toUpperCase()}</Table.Cell>
        <Table.Cell><div>{quote.company?.company_name || "Unassigned company"}</div><Text size="small" className="text-ui-fg-subtle">{quote.customer_email}</Text></Table.Cell>
        <Table.Cell>{new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format((quote.negotiated_total ?? quote.subtotal ?? 0) / 100)}</Table.Cell>
        <Table.Cell><StatusBadge color={color(quote.status)}>{quote.status}</StatusBadge></Table.Cell>
        <Table.Cell>{["draft", "pending", "pending_review"].includes(quote.status) && <div className="flex gap-2"><Button size="small" onClick={() => review(quote, "approved")}>Approve</Button><Button size="small" variant="secondary" onClick={() => review(quote, "rejected")}>Reject</Button></div>}</Table.Cell>
      </Table.Row>)}</Table.Body></Table>}
  </Container>
}

export const config = defineRouteConfig({ label: "B2B Quotes", icon: DocumentText })
export default B2BQuotesPage
