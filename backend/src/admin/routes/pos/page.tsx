import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingStorefront } from "@medusajs/icons"
import { Container, Heading, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Row = Record<string, unknown> & { id: string }
type PosMonitor = { registers: Row[]; transactions: Row[]; sessions: Row[]; returns: Row[]; movements: Row[] }

async function getRows(path: string, key: string): Promise<Row[]> {
  const response = await fetch(path, { credentials: "include" })
  const body = await response.json() as Record<string, unknown>
  if (!response.ok) throw new Error(String(body.message || "POS request failed"))
  return (body[key] || []) as Row[]
}

const PosAdminPage = () => {
  const [data, setData] = useState<PosMonitor>({ registers: [], transactions: [], sessions: [], returns: [], movements: [] })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([getRows("/admin/pos/registers", "registers"), getRows("/admin/pos/transactions", "transactions"), getRows("/admin/pos/sessions", "sessions"), getRows("/admin/pos/returns", "returns"), getRows("/admin/pos/cash-movements", "movements")])
      .then(([registers, transactions, sessions, returns, movements]) => setData({ registers, transactions, sessions, returns, movements }))
      .catch((error: Error) => toast.error("POS monitor", { description: error.message }))
      .finally(() => setLoading(false))
  }, [])
  if (loading) return <Container className="p-8"><Text>Loading POS monitor...</Text></Container>
  return <Container className="p-8 flex flex-col gap-y-8"><div><Heading level="h1">Point of Sale</Heading><Text className="text-ui-fg-subtle">Registers, sessions, transactions, cash activity, and returns.</Text></div><div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[["Registers", data.registers.length], ["Open sessions", data.sessions.filter((row) => row.status === "OPEN").length], ["Transactions", data.transactions.length], ["Returns", data.returns.length], ["Cash movements", data.movements.length]].map(([label, value]) => <div key={String(label)} className="border rounded-lg p-4"><Text size="small" className="text-ui-fg-subtle">{label}</Text><Heading level="h2">{value}</Heading></div>)}</div><div className="border rounded-lg p-5"><Heading level="h2" className="mb-4">Registers</Heading><Table><Table.Header><Table.Row><Table.HeaderCell>Name</Table.HeaderCell><Table.HeaderCell>Code</Table.HeaderCell><Table.HeaderCell>Currency</Table.HeaderCell><Table.HeaderCell>Status</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{data.registers.map((register) => <Table.Row key={register.id}><Table.Cell>{String(register.name)}</Table.Cell><Table.Cell>{String(register.code)}</Table.Cell><Table.Cell>{String(register.currency_code).toUpperCase()}</Table.Cell><Table.Cell><StatusBadge color={register.status === "ACTIVE" ? "green" : "grey"}>{String(register.status)}</StatusBadge></Table.Cell></Table.Row>)}</Table.Body></Table></div><div className="border rounded-lg p-5"><Heading level="h2" className="mb-4">Recent transactions</Heading><Table><Table.Header><Table.Row><Table.HeaderCell>Transaction</Table.HeaderCell><Table.HeaderCell>Register</Table.HeaderCell><Table.HeaderCell>Type</Table.HeaderCell><Table.HeaderCell>Status</Table.HeaderCell><Table.HeaderCell>Total</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{data.transactions.slice(0, 100).map((transaction) => <Table.Row key={transaction.id}><Table.Cell>{transaction.id}</Table.Cell><Table.Cell>{String(transaction.register_id)}</Table.Cell><Table.Cell>{String(transaction.transaction_type)}</Table.Cell><Table.Cell>{String(transaction.status)}</Table.Cell><Table.Cell>{Number(transaction.total_minor || 0)} {String(transaction.currency_code).toUpperCase()}</Table.Cell></Table.Row>)}</Table.Body></Table></div></Container>
}

export const config = defineRouteConfig({ label: "Point of Sale", icon: BuildingStorefront })
export default PosAdminPage
