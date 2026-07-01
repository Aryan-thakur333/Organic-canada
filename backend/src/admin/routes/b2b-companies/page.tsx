import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  BuildingStorefront,
  CheckCircleSolid,
  XCircleSolid,
  MinusCircle,
  MagnifyingGlass,
} from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
  toast,
  FocusModal,
  Input,
  Label,
  Textarea,
} from "@medusajs/ui"
import { useEffect, useState } from "react"

// ── Types ──────────────────────────────────────────────────────────────────

interface Company {
  id: string
  company_name: string
  tax_id: string | null
  credit_limit: number
  requested_credit_limit: number
  approved_credit_limit: number
  customer_id: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  admin_note: string | null
  status: string
  customer_email: string | null
  created_at: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, "grey" | "orange" | "green" | "red" | "blue" | "purple"> = {
  pending: "orange",
  approved: "green",
  rejected: "red",
  active: "green",
  inactive: "grey",
  suspended: "red",
}

const fmtPrice = (cents: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format((cents || 0) / 100)

const fmtDate = (iso: string | null) => {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// ── Page Component ──────────────────────────────────────────────────────────

const B2BCompaniesPage = () => {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // ── Approve modal state ─────────────────────────────────────────────────
  const [modalCompany, setModalCompany] = useState<Company | null>(null)
  const [modalAction, setModalAction] = useState<"approve" | "reject" | "suspend" | "reactivate" | null>(null)
  const [detailsCompany, setDetailsCompany] = useState<Company | null>(null)
  const [modalCreditLimit, setModalCreditLimit] = useState("")
  const [modalAdminNote, setModalAdminNote] = useState("")
  const [modalRejectReason, setModalRejectReason] = useState("")

  // ── Fetch ──────────────────────────────────────────────────────────────
  const load = async (keepSearch = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: "200" })
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (search && keepSearch) params.set("search", search)

      const response = await fetch(`/admin/b2b/companies?${params.toString()}`, {
        credentials: "include",
      })
      if (!response.ok) throw new Error((await response.json()).message || "Failed to load companies")
      const data = await response.json()
      setCompanies(data.companies || [])
    } catch (error: any) {
      toast.error("B2B companies", { description: error.message })
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
  }, [statusFilter])

  // ── Actions ────────────────────────────────────────────────────────────
  const executeAction = async () => {
    if (!modalCompany || !modalAction) return

    setActionLoading(modalCompany.id)
    const companyId = modalCompany.id
    const action = modalAction
    closeModal()

    try {
      let response: Response

      if (action === "approve") {
        const payload: Record<string, any> = {}
        if (modalCreditLimit.trim()) {
          payload.approved_credit_limit = parseFloat(modalCreditLimit)
        }
        if (modalAdminNote.trim()) {
          payload.admin_note = modalAdminNote.trim()
        }
        response = await fetch(`/admin/b2b/companies/${companyId}/approve`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else if (action === "reject") {
        response = await fetch(`/admin/b2b/companies/${companyId}/reject`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: modalRejectReason.trim() || "Application rejected by admin",
          }),
        })
      } else if (action === "suspend") {
        response = await fetch(`/admin/b2b/companies/${companyId}/suspend`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_note: modalAdminNote.trim() || "Suspended by admin" }),
        })
      } else {
        response = await fetch(`/admin/b2b/companies/${companyId}/status`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        })
      }

      const data = await response.json()
      if (!response.ok) {
        return toast.error("Action failed", { description: data.message || "Request failed" })
      }

      toast.success(
        action === "approve"
          ? "Company approved; customer added to B2B group"
          : action === "reject"
            ? "Company application rejected"
            : action === "suspend"
              ? "Company suspended"
              : "Company reactivated"
      )
      await load(true)
    } catch (error: any) {
      toast.error("Action failed", { description: error.message })
    } finally {
      setActionLoading(null)
    }
  }

  const openModal = (company: Company, action: "approve" | "reject" | "suspend" | "reactivate") => {
    setModalCompany(company)
    setModalAction(action)
    if (action === "approve") {
      setModalCreditLimit(company.requested_credit_limit ? String(company.requested_credit_limit / 100) : "")
      setModalAdminNote(company.admin_note || "Approved via admin panel")
    } else if (action === "reject") {
      setModalRejectReason("")
      setModalAdminNote("")
    } else {
      setModalAdminNote("")
    }
  }

  const closeModal = () => {
    setModalCompany(null)
    setModalAction(null)
    setModalCreditLimit("")
    setModalAdminNote("")
    setModalRejectReason("")
  }

  // ── Filtered for display ──────────────────────────────────────────────
  const displayed = search
    ? companies.filter(
        (c) =>
          c.company_name.toLowerCase().includes(search.toLowerCase()) ||
          c.tax_id?.toLowerCase().includes(search.toLowerCase()) ||
          c.customer_email?.toLowerCase().includes(search.toLowerCase())
      )
    : companies

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <Container className="p-8 flex flex-col gap-y-6">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">B2B Companies</Heading>
          <Text className="text-ui-fg-subtle">
            Review company applications, approve wholesale access, reject invalid applications, and
            suspend B2B accounts.
          </Text>
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={() => load(true)}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {/* ── Status Filters ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "pending", "approved", "rejected", "suspended"].map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              statusFilter === f
                ? "bg-ui-button-inverted text-ui-button-inverted-text shadow-elevation-card-rest"
                : "bg-ui-button-neutral text-ui-button-neutral-text hover:bg-ui-button-neutral-hover"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}

        {/* ── Search ──────────────────────────────────────────────────── */}
        <div className="relative ml-auto">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ui-fg-muted" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 pl-8 pr-3 py-1.5 text-sm rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive"
          />
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      {loading ? (
        <Text>Loading companies…</Text>
      ) : displayed.length === 0 ? (
        <Text className="py-12 text-center text-ui-fg-muted">
          No {statusFilter !== "all" ? statusFilter : ""} B2B companies found.
        </Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Company</Table.HeaderCell>
              <Table.HeaderCell>Customer Email</Table.HeaderCell>
              <Table.HeaderCell>Customer Name</Table.HeaderCell>
              <Table.HeaderCell>Tax ID</Table.HeaderCell>
              <Table.HeaderCell>Requested Credit</Table.HeaderCell>
              <Table.HeaderCell>Approved Credit</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Created</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {displayed.map((company) => (
              <Table.Row key={company.id}>
                <Table.Cell>
                  <div className="flex flex-col">
                    <span className="font-medium text-ui-fg-base">
                      {company.company_name}
                    </span>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-ui-fg-base">
                    {company.customer_email || "—"}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  {company.customer_id ? (
                    <div className="flex flex-col">
                      <span className="text-ui-fg-base">
                        {company.customer_id}
                      </span>
                    </div>
                  ) : (
                    <span className="text-ui-fg-muted text-sm">—</span>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <span className="text-ui-fg-base">{company.tax_id || "—"}</span>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-ui-fg-base">{fmtPrice(company.requested_credit_limit || 0)}</span>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col">
                    <span className="text-ui-fg-base font-medium">
                      {fmtPrice(company.approved_credit_limit || company.credit_limit || 0)}
                    </span>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge color={STATUS_COLORS[company.status] || "grey"}>
                    {company.status}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-sm text-ui-fg-subtle">
                    {fmtDate(company.created_at)}
                  </span>
                </Table.Cell>
                <Table.Cell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setDetailsCompany(company)}
                      disabled={actionLoading === company.id}
                    >
                      View Details
                    </Button>
                    {company.status === "pending" && (
                      <>
                        <Button
                          size="small"
                          onClick={() => openModal(company, "approve")}
                          disabled={actionLoading === company.id}
                        >
                          <CheckCircleSolid className="mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => openModal(company, "reject")}
                          disabled={actionLoading === company.id}
                        >
                          <XCircleSolid className="mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {(company.status === "approved" || company.status === "active") && (
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => openModal(company, "suspend")}
                        disabled={actionLoading === company.id}
                      >
                        <MinusCircle className="mr-1" />
                        Suspend
                      </Button>
                    )}
                    {company.status === "rejected" && (
                      <Button
                        size="small"
                        onClick={() => openModal(company, "approve")}
                        disabled={actionLoading === company.id}
                      >
                        <CheckCircleSolid className="mr-1" />
                        Approve
                      </Button>
                    )}
                    {company.status === "suspended" && (
                      <Button
                        size="small"
                        onClick={() => openModal(company, "reactivate")}
                        disabled={actionLoading === company.id}
                      >
                        <CheckCircleSolid className="mr-1" />
                        Reactivate
                      </Button>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* ── Approve Modal ──────────────────────────────────────────────── */}
      <FocusModal open={modalAction === "approve"} onOpenChange={(open) => !open && closeModal()}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Button
              variant="primary"
              onClick={executeAction}
              disabled={actionLoading !== null}
            >
              {actionLoading ? "Approving…" : "Approve & Add to B2B Group"}
            </Button>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-y-6 p-8">
            <div>
              <Heading level="h2">Approve {modalCompany?.company_name}</Heading>
              <Text className="text-ui-fg-subtle">
                The customer will be added to the B2B Partners group for wholesale pricing.
              </Text>
            </div>

            <div className="flex flex-col gap-y-4 max-w-md">
              <div className="flex flex-col gap-y-2">
                <Label>Approved Credit Limit (optional)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ui-fg-muted text-sm">
                    $
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={modalCreditLimit}
                    onChange={(e) => setModalCreditLimit(e.target.value)}
                    placeholder="e.g. 5000"
                    className="pl-7"
                  />
                </div>
                <Text className="text-xs text-ui-fg-muted">
                  Leave empty to use the requested limit of{" "}
                  {fmtPrice(modalCompany?.requested_credit_limit || 0)}.
                </Text>
              </div>

              <div className="flex flex-col gap-y-2">
                <Label>Admin Note (optional)</Label>
                <Textarea
                  value={modalAdminNote}
                  onChange={(e) => setModalAdminNote(e.target.value)}
                  placeholder="Approved via admin panel"
                />
              </div>

              <div className="mt-4 p-3 rounded-lg bg-ui-bg-base border border-ui-border-base">
                <Text className="text-xs text-ui-fg-subtle">
                  <CheckCircleSolid className="inline mr-1 text-ui-tag-green-icon" />
                  Customer will be linked to the B2B Partners customer group for wholesale pricing
                  across the storefront.
                </Text>
              </div>
            </div>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>

      {/* ── Reject Modal ───────────────────────────────────────────────── */}
      <FocusModal open={modalAction === "reject"} onOpenChange={(open) => !open && closeModal()}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Button
              variant="danger"
              onClick={executeAction}
              disabled={actionLoading !== null}
            >
              {actionLoading ? "Rejecting…" : "Reject Application"}
            </Button>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-y-6 p-8">
            <div>
              <Heading level="h2">Reject {modalCompany?.company_name}</Heading>
              <Text className="text-ui-fg-subtle">
                The customer will be notified and can resubmit later.
              </Text>
            </div>

            <div className="flex flex-col gap-y-4 max-w-md">
              <div className="flex flex-col gap-y-2">
                <Label>Rejection Reason (optional)</Label>
                <Textarea
                  value={modalRejectReason}
                  onChange={(e) => setModalRejectReason(e.target.value)}
                  placeholder="Explain why the application is being rejected..."
                />
              </div>
            </div>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>

      {/* ── Suspend Modal ──────────────────────────────────────────────── */}
      <FocusModal open={modalAction === "suspend"} onOpenChange={(open) => !open && closeModal()}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Button
              variant="danger"
              onClick={executeAction}
              disabled={actionLoading !== null}
            >
              {actionLoading ? "Suspending…" : "Suspend"}
            </Button>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-y-6 p-8">
            <div>
              <Heading level="h2">Suspend {modalCompany?.company_name}</Heading>
              <Text className="text-ui-fg-subtle">
                The company will be suspended and will not be able to submit new orders or quotes.
              </Text>
            </div>

            <div className="flex flex-col gap-y-4 max-w-md">
              <div className="flex flex-col gap-y-2">
                <Label>Admin Note (optional)</Label>
                <Textarea
                  value={modalAdminNote}
                  onChange={(e) => setModalAdminNote(e.target.value)}
                  placeholder="Reason for suspension..."
                />
              </div>
            </div>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>

      <FocusModal open={modalAction === "reactivate"} onOpenChange={(open) => !open && closeModal()}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Button
              variant="primary"
              onClick={executeAction}
              disabled={actionLoading !== null}
            >
              {actionLoading ? "Reactivating..." : "Reactivate"}
            </Button>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-y-6 p-8">
            <div>
              <Heading level="h2">Reactivate {modalCompany?.company_name}</Heading>
              <Text className="text-ui-fg-subtle">
                This sets the company status to active so the customer can use B2B access again.
              </Text>
            </div>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>

      <FocusModal open={detailsCompany !== null} onOpenChange={(open) => !open && setDetailsCompany(null)}>
        <FocusModal.Content>
          <FocusModal.Header>
            <Button variant="secondary" onClick={() => setDetailsCompany(null)}>
              Close
            </Button>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col gap-y-6 p-8">
            <div>
              <Heading level="h2">{detailsCompany?.company_name}</Heading>
              <Text className="text-ui-fg-subtle">B2B company application details</Text>
            </div>
            {detailsCompany && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  ["Customer Email", detailsCompany.customer_email || "—"],
                  ["Customer ID", detailsCompany.customer_id || "—"],
                  ["Tax ID", detailsCompany.tax_id || "—"],
                  ["Status", detailsCompany.status],
                  ["Requested Credit Limit", fmtPrice(detailsCompany.requested_credit_limit || 0)],
                  [
                    "Approved Credit Limit",
                    fmtPrice(detailsCompany.approved_credit_limit || detailsCompany.credit_limit || 0),
                  ],
                  ["Created", fmtDate(detailsCompany.created_at)],
                  ["Approved At", fmtDate(detailsCompany.approved_at)],
                  ["Rejected At", fmtDate(detailsCompany.rejected_at)],
                  ["Rejection Reason", detailsCompany.rejection_reason || "—"],
                  ["Admin Note", detailsCompany.admin_note || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3">
                    <Text className="text-xs text-ui-fg-muted">{label}</Text>
                    <Text className="text-sm text-ui-fg-base break-words">{value}</Text>
                  </div>
                ))}
              </div>
            )}
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </Container>
  )
}

// ── Route Config — registers "B2B Companies" in the Admin sidebar ──────────

export const config = defineRouteConfig({
  label: "B2B Companies",
  icon: BuildingStorefront,
})

export default B2BCompaniesPage
