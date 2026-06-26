import { Button, Container, Heading, Table, Text, toast, Badge, Drawer, Input, Label, Select, Textarea } from "@medusajs/ui"
import { useEffect, useState } from "react"

const PlansPage = () => {
  const [plans, setPlans] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editPlan, setEditPlan] = useState<any | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formTitle, setFormTitle] = useState("")
  const [formDesc, setFormDesc] = useState("")
  const [formPlan, setFormPlan] = useState("month")
  const [formPeriod, setFormPeriod] = useState("1")
  const [formAmount, setFormAmount] = useState("")
  const [formCurrency, setFormCurrency] = useState("cad")
  const [formActive, setFormActive] = useState(true)
  const [formSort, setFormSort] = useState("0")

  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch("/admin/subscription-plans", { credentials: "include" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      setPlans(data.plans || [])
    } catch (error: any) {
      toast.error("Plans", { description: error.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditPlan(null)
    setFormTitle("")
    setFormDesc("")
    setFormPlan("month")
    setFormPeriod("1")
    setFormAmount("")
    setFormCurrency("cad")
    setFormActive(true)
    setFormSort("0")
    setDrawerOpen(true)
  }

  const openEdit = (plan: any) => {
    setEditPlan(plan)
    setFormTitle(plan.title)
    setFormDesc(plan.description || "")
    setFormPlan(plan.interval)
    setFormPeriod(String(plan.period || 1))
    setFormAmount(String(plan.amount))
    setFormCurrency(plan.currency)
    setFormActive(plan.is_active)
    setFormSort(String(plan.sort_order))
    setDrawerOpen(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim() || !formAmount) {
      return toast.error("Validation", { description: "Title and amount are required" })
    }

    setSaving(true)
    const payload = {
      name: formTitle.trim(),
      description: formDesc.trim() || null,
      interval: formPlan,
      period: Number(formPeriod),
      price: Math.round(Number(formAmount)),
      currency_code: formCurrency,
      status: formActive ? "active" : "inactive",
      sort_order: Number(formSort),
    }

    try {
      let response
      if (editPlan) {
        response = await fetch(`/admin/subscription-plans/${editPlan.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        response = await fetch("/admin/subscription-plans", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      const data = await response.json()
      if (!response.ok) throw new Error(data.message)

      toast.success(editPlan ? "Plan updated" : "Plan created")
      setDrawerOpen(false)
      await load()
    } catch (error: any) {
      toast.error("Save failed", { description: error.message })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this plan? Existing subscriptions will not be affected.")) return
    try {
      const response = await fetch(`/admin/subscription-plans/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      toast.success("Plan deleted")
      await load()
    } catch (error: any) {
      toast.error("Delete failed", { description: error.message })
    }
  }

  const planLabel = (plan: string) => {
    switch (plan) {
      case "weekly": return "Weekly"
      case "monthly": return "Monthly"
      case "quarterly": return "Quarterly"
      case "yearly": return "Yearly"
      case "week": return "Week"
      case "month": return "Month"
      case "year": return "Year"
      default: return plan
    }
  }

  return (
    <Container className="p-8 flex flex-col gap-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">Subscription Plans</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Manage subscription tiers, pricing, and availability.
          </Text>
        </div>
        <Button onClick={openCreate}>Create Plan</Button>
      </div>

      {loading ? (
        <Text>Loading plans…</Text>
      ) : plans.length === 0 ? (
        <div className="py-16 text-center">
          <Text className="text-ui-fg-subtle">No subscription plans yet.</Text>
          <Button variant="secondary" className="mt-4" onClick={openCreate}>Create your first plan</Button>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Title</Table.HeaderCell>
              <Table.HeaderCell>Plan</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Currency</Table.HeaderCell>
              <Table.HeaderCell>Active</Table.HeaderCell>
              <Table.HeaderCell>Sort</Table.HeaderCell>
              <Table.HeaderCell>Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {plans.map((plan) => (
              <Table.Row key={plan.id}>
                <Table.Cell className="font-medium">{plan.name}</Table.Cell>
                <Table.Cell className="uppercase">{plan.display} ({plan.period} {planLabel(plan.interval)})</Table.Cell>
                <Table.Cell className="font-mono">
                  ${(plan.price / 100).toFixed(2)}
                </Table.Cell>
                <Table.Cell className="uppercase">{plan.currency_code}</Table.Cell>
                <Table.Cell>
                  <Badge color={plan.is_active ? "green" : "grey"}>
                    {plan.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Table.Cell>
                <Table.Cell>{plan.sort_order}</Table.Cell>
                <Table.Cell>
                  <div className="flex gap-2">
                    <Button size="small" variant="secondary" onClick={() => openEdit(plan)}>
                      Edit
                    </Button>
                    <Button size="small" variant="danger" onClick={() => handleDelete(plan.id)}>
                      Delete
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* Create/Edit Drawer */}
      {drawerOpen && (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>{editPlan ? "Edit Plan" : "Create Plan"}</Drawer.Title>
            </Drawer.Header>
            <Drawer.Body className="flex flex-col gap-y-4">
              <div>
                <Label>Title</Label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g. Weekly Harvest Box" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Describe what this plan includes…" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Plan Interval</Label>
                  <Select value={formPlan} onValueChange={setFormPlan}>
                    <Select.Trigger>
                      <Select.Value placeholder="Select interval" />
                    </Select.Trigger>
                    <Select.Content>
                      {["week", "month", "year"].map((p) => (
                        <Select.Item key={p} value={p}>
                          {planLabel(p)}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
                <div>
                  <Label>Interval Count</Label>
                  <Input type="number" min={1} value={formPeriod} onChange={(e) => setFormPeriod(e.target.value)} placeholder="1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount (cents)</Label>
                  <Input type="number" min={0} value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="e.g. 2499" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Currency</Label>
                  <Select value={formCurrency} onValueChange={setFormCurrency}>
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="usd">USD</Select.Item>
                      <Select.Item value="cad">CAD</Select.Item>
                      <Select.Item value="eur">EUR</Select.Item>
                      <Select.Item value="gbp">GBP</Select.Item>
                    </Select.Content>
                  </Select>
                </div>
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" min={0} value={formSort} onChange={(e) => setFormSort(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
                  Active (visible to customers)
                </Label>
              </div>
            </Drawer.Body>
            <Drawer.Footer>
              <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editPlan ? "Update Plan" : "Create Plan"}
              </Button>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer>
      )}
    </Container>
  )
}

// 🚫 Sidebar config removed — only core extensions (B2B Quotes, Vendor Approvals, Analytics, Marketplace Overview) are shown.
export default PlansPage
