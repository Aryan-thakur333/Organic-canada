import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar, PencilSquare, XMark } from "@medusajs/icons"
import {
  Container,
  Heading,
  Text,
  Button,
  Input,
  Select,
  Label,
  toast,
  Table,
  Badge,
  StatusBadge,
  Switch,
  Textarea,
  IconButton,
  DropdownMenu
} from "@medusajs/ui"
import { useEffect, useState, useCallback } from "react"

// ── Types ──────────────────────────────────────────────────────────────────

type FeeType = "percentage" | "fixed"
type AccountType = "normal_customer" | "b2b_customer" | "vendor"

interface CommissionRule {
  id: string
  account_type: AccountType
  fee_type: FeeType
  fee_value: number
  is_active: boolean
}

interface CommissionRecord {
  id: string
  order_id: string
  customer_id: string | null
  vendor_id: string | null
  account_type: AccountType
  base_amount: number
  fee_type: FeeType
  fee_value: number
  commission_amount: number
  adjusted_commission_amount: number | null
  vendor_payout: number | null
  status: string
  created_at: string
}

// ── Formatters ─────────────────────────────────────────────────────────────

function formatMoney(amount: number) {
  return `CA$${(amount / 100).toFixed(2)}`
}

function actorLabel(cat: string): string {
  switch (cat) {
    case "normal_customer": return "Normal Customer"
    case "b2b_customer":    return "B2B Customer"
    case "vendor":          return "Vendor"
    default:                return cat
  }
}

function actorColor(cat: string): "blue" | "green" | "orange" {
  switch (cat) {
    case "normal_customer": return "blue"
    case "b2b_customer":    return "green"
    case "vendor":          return "orange"
    default:                return "blue"
  }
}

// ── Components ─────────────────────────────────────────────────────────────

const CommissionCard = ({
  actorType,
  title,
  initialRule,
  onSave
}: {
  actorType: AccountType
  title: string
  initialRule: CommissionRule | undefined
  onSave: (actorType: AccountType, payload: any) => Promise<void>
}) => {
  const [feeType, setFeeType] = useState<FeeType>(initialRule?.fee_type || "percentage")
  const [feeValue, setFeeValue] = useState(
    initialRule 
      ? (initialRule.fee_type === "fixed" ? String(initialRule.fee_value / 100) : String(initialRule.fee_value))
      : ""
  )
  const [isActive, setIsActive] = useState(initialRule?.is_active ?? true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // Update local state if initialRule changes (e.g. initial load)
  useEffect(() => {
    if (initialRule) {
      setFeeType(initialRule.fee_type)
      setFeeValue(
        initialRule.fee_type === "fixed" 
          ? String(initialRule.fee_value / 100) 
          : String(initialRule.fee_value)
      )
      setIsActive(initialRule.is_active)
    }
  }, [initialRule])

  const handleSave = async () => {
    setErrorMsg("")
    const val = parseFloat(feeValue)
    if (isNaN(val) || val < 0) {
      setErrorMsg("Fee value must be a non-negative number.")
      toast.error("Validation Error", { description: "Fee value must be a non-negative number." })
      return
    }
    if (feeType === "percentage" && val > 100) {
      setErrorMsg("Percentage fee cannot exceed 100.")
      toast.error("Validation Error", { description: "Percentage fee cannot exceed 100." })
      return
    }

    setIsSaving(true)
    try {
      await onSave(actorType, {
        fee_type: feeType,
        fee_value: val,
        is_active: isActive
      })
      toast.success("Saved", { description: `${title} commission updated.` })
    } catch (err: any) {
      toast.error("Error", { description: err.message || "Failed to save rule." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col space-y-4 p-6 rounded-2xl border border-neutral-700 bg-neutral-900 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white">{title}</h3>
        <div className="flex items-center gap-x-2">
          <label className="text-sm font-medium text-neutral-300">{isActive ? "Active" : "Inactive"}</label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      </div>

      <div className="flex flex-col gap-y-4 mt-2">
        <div className="flex flex-col gap-y-1">
          <label className="text-sm font-semibold text-neutral-300">Fee Type</label>
          <select 
            value={feeType} 
            onChange={(e) => setFeeType(e.target.value as FeeType)}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none"
          >
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed Amount</option>
          </select>
        </div>

        <div className="flex flex-col gap-y-1">
          <label className="text-sm font-semibold text-neutral-300">
            Fee Value {feeType === "percentage" ? "(%)" : "(CA$)"}
          </label>
          <input 
            type="number"
            step={feeType === "percentage" ? "1" : "0.01"}
            min="0"
            max={feeType === "percentage" ? "100" : undefined}
            value={feeValue}
            onChange={(e) => setFeeValue(e.target.value)}
            placeholder={feeType === "percentage" ? "10" : "5.00"}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="text-sm text-red-400 font-medium">
          {errorMsg}
        </div>
      )}

      <div className="mt-4">
        <button 
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60" 
          onClick={handleSave} 
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

const CommissionsPage = () => {
  const [activeTab, setActiveTab] = useState<"management" | "reports">("management")

  // Rules State
  const [rules, setRules] = useState<CommissionRule[]>([])
  
  // Records State
  const [records, setRecords] = useState<CommissionRecord[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const [isRecordsLoading, setIsRecordsLoading] = useState(true)
  
  // Filters State
  const [filterActorType, setFilterActorType] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterOrderId, setFilterOrderId] = useState<string>("")
  const [offset, setOffset] = useState(0)
  const limit = 10

  // Adjust Modal State
  const [adjustRecord, setAdjustRecord] = useState<CommissionRecord | null>(null)
  const [adjustAmount, setAdjustAmount] = useState("")
  const [adjustReason, setAdjustReason] = useState("")
  const [isAdjusting, setIsAdjusting] = useState(false)

  // Reports State
  const [reportTotals, setReportTotals] = useState<any>(null)
  const [isReportsLoading, setIsReportsLoading] = useState(false)

  // Fetch Rules
  const fetchRules = useCallback(async () => {
    try {
      const types: AccountType[] = ["normal_customer", "b2b_customer", "vendor"]
      const results = await Promise.all(
        types.map(async (t) => {
          const res = await fetch(`/admin/commission/${t}`, { credentials: "include" })
          if (res.ok) {
            const data = await res.json()
            return data.setting
          }
          const error = await res.json().catch(() => ({}))
          throw new Error(error.message || `Failed to fetch ${actorLabel(t)} commission setting`)
        })
      )
      setRules(results)
    } catch (err: any) {
      toast.error("Error", { description: err.message || "Failed to fetch rules" })
    }
  }, [])

  // Fetch Records
  const fetchRecords = useCallback(async () => {
    setIsRecordsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append("limit", String(limit))
      params.append("offset", String(offset))
      if (filterActorType !== "all") params.append("account_type", filterActorType)
      if (filterStatus !== "all") params.append("status", filterStatus)
      if (filterOrderId.trim()) params.append("order_id", filterOrderId.trim())

      const res = await fetch(`/admin/commissions?${params.toString()}`, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to fetch records")
      const data = await res.json()
      setRecords(data.records || [])
      setTotalRecords(data.count || 0)
    } catch (err: any) {
      toast.error("Error", { description: err.message })
    } finally {
      setIsRecordsLoading(false)
    }
  }, [filterActorType, filterStatus, filterOrderId, offset])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  useEffect(() => {
    fetchRecords()
  }, [filterActorType, filterStatus, filterOrderId, offset])

  const fetchReports = useCallback(async () => {
    setIsReportsLoading(true)
    try {
      const res = await fetch("/admin/commission/report", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to fetch reports")
      const data = await res.json()
      setReportTotals(data.totals)
    } catch (err: any) {
      toast.error("Error", { description: err.message })
    } finally {
      setIsReportsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "reports") {
      fetchReports()
    }
  }, [activeTab, fetchReports])

  const exportCSV = () => {
    if (records.length === 0) return
    const headers = ["Order ID", "Account Type", "Base Amount", "Fee Type", "Fee Value", "Commission", "Vendor Payout", "Status", "Date"]
    const csvRows = [headers.join(",")]
    
    for (const r of records) {
      const finalComm = (
        (r.adjusted_commission_amount ?? r.commission_amount) / 100
      ).toFixed(2)
      
      csvRows.push([
        r.order_id,
        r.account_type,
        (r.base_amount / 100).toFixed(2),
        r.fee_type,
        r.fee_type === "percentage" ? r.fee_value : (r.fee_value / 100).toFixed(2),
        finalComm,
        r.vendor_payout !== null ? (r.vendor_payout / 100).toFixed(2) : "",
        r.status,
        new Date(r.created_at).toISOString()
      ].join(","))
    }
    
    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `commission_report_${new Date().toISOString().slice(0,10)}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleSaveRule = async (actorType: AccountType, payload: any) => {
    const res = await fetch(`/admin/commission/${actorType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message || "Failed to save rule")
    }
    const data = await res.json()
    if (data.setting) {
      setRules((current) => [
        ...current.filter((rule) => rule.account_type !== actorType),
        data.setting,
      ])
    }
  }

  const handleAdjustSubmit = async () => {
    if (!adjustRecord) return
    const val = parseFloat(adjustAmount)
    if (isNaN(val) || val < 0) {
      toast.error("Validation Error", { description: "Adjusted amount must be a non-negative number." })
      return
    }
    if (!adjustReason.trim()) {
      toast.error("Validation Error", { description: "Reason is required." })
      return
    }

    setIsAdjusting(true)
    try {
      const res = await fetch(`/admin/commission/records/${adjustRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          adjusted_commission_amount: Math.round(val * 100), // convert to minor units
          reason: adjustReason
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || "Failed to adjust record")
      }
      toast.success("Success", { description: "Commission record adjusted." })
      setAdjustRecord(null)
      fetchRecords()
    } catch (err: any) {
      toast.error("Error", { description: err.message })
    } finally {
      setIsAdjusting(false)
    }
  }

  const openAdjustModal = (record: CommissionRecord) => {
    setAdjustRecord(record)
    setAdjustAmount(String((record.adjusted_commission_amount ?? record.commission_amount) / 100))
    setAdjustReason("")
  }

  return (
    <div className="pb-20">
      <Container className="p-8 mb-8 border-none shadow-none">
        <div className="flex justify-between items-center mb-6">
          <Heading level="h1" className="text-2xl font-semibold">Commission Management</Heading>
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <button 
              onClick={() => setActiveTab("management")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "management" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
            >
              Management
            </button>
            <button 
              onClick={() => setActiveTab("reports")}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === "reports" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
            >
              Reports
            </button>
          </div>
        </div>

        {activeTab === "reports" && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <Heading level="h2" className="text-lg font-semibold">Financial Reports</Heading>
              <Button variant="secondary" size="small" onClick={exportCSV}>
                Export CSV
              </Button>
            </div>
            {isReportsLoading ? (
              <div className="text-sm text-gray-500">Loading metrics...</div>
            ) : reportTotals ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
                  <div className="text-sm text-gray-500 mb-1">Total Sales (Base)</div>
                  <div className="text-2xl font-bold">{formatMoney(reportTotals.total_sales)}</div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
                  <div className="text-sm text-gray-500 mb-1">Customer Platform Fees</div>
                  <div className="text-2xl font-bold text-blue-600">{formatMoney(reportTotals.total_customer_fees)}</div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
                  <div className="text-sm text-gray-500 mb-1">Vendor Commissions</div>
                  <div className="text-2xl font-bold text-orange-600">{formatMoney(reportTotals.total_vendor_commissions)}</div>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
                  <div className="text-sm text-gray-500 mb-1">Total Vendor Payouts</div>
                  <div className="text-2xl font-bold text-green-600">{formatMoney(reportTotals.total_vendor_payouts)}</div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeTab === "management" && (
          <>
            {/* SECTION 1: Settings */}
            <div className="mb-12">
          <Heading level="h2" className="text-lg font-semibold mb-4 text-white">Commission Settings</Heading>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <CommissionCard 
              title="Normal Customer" 
              actorType="normal_customer" 
              initialRule={rules.find(r => r.account_type === "normal_customer")}
              onSave={handleSaveRule} 
            />
            <CommissionCard 
              title="B2B Customer" 
              actorType="b2b_customer" 
              initialRule={rules.find(r => r.account_type === "b2b_customer")}
              onSave={handleSaveRule} 
            />
            <CommissionCard 
              title="Vendor" 
              actorType="vendor" 
              initialRule={rules.find(r => r.account_type === "vendor")}
              onSave={handleSaveRule} 
            />
          </div>
        </div>

        {/* SECTION 2: Records */}
        <div>
          <Heading level="h2" className="text-lg font-semibold mb-4 text-white">Commission Records</Heading>
          
          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div className="flex flex-col gap-y-1">
              <label className="text-sm font-semibold text-neutral-300">Account Type</label>
              <select 
                value={filterActorType} 
                onChange={(e) => { setFilterActorType(e.target.value); setOffset(0); }}
                className="w-[180px] rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none"
              >
                <option value="all">All</option>
                <option value="normal_customer">Normal Customer</option>
                <option value="b2b_customer">B2B Customer</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
            
            <div className="flex flex-col gap-y-1">
              <label className="text-sm font-semibold text-neutral-300">Status</label>
              <select 
                value={filterStatus} 
                onChange={(e) => { setFilterStatus(e.target.value); setOffset(0); }}
                className="w-[180px] rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 appearance-none"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="collected">Collected</option>
                <option value="paid_out">Paid Out</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="flex flex-col gap-y-1">
              <label className="text-sm font-semibold text-neutral-300">Order ID</label>
              <input 
                placeholder="Search by Order ID..."
                value={filterOrderId}
                onChange={(e) => { setFilterOrderId(e.target.value); setOffset(0); }}
                className="w-[220px] rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          <div className="rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden shadow-sm">
            {isRecordsLoading ? (
              <div className="p-8 text-center text-neutral-400">Loading records...</div>
            ) : records.length === 0 ? (
              <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-8 text-center text-neutral-400">No commission records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-800 text-neutral-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Order ID</th>
                      <th className="px-4 py-3 font-semibold">Account Type</th>
                      <th className="px-4 py-3 font-semibold">Actors</th>
                      <th className="px-4 py-3 font-semibold">Base Amount</th>
                      <th className="px-4 py-3 font-semibold">Rate</th>
                      <th className="px-4 py-3 font-semibold">Commission</th>
                      <th className="px-4 py-3 font-semibold">Vendor Payout</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700">
                  {records.map((record) => {
                    const hasAdjustment = record.adjusted_commission_amount !== null
                    const finalCommission = hasAdjustment ? record.adjusted_commission_amount! : record.commission_amount
                    
                    return (
                      <tr key={record.id} className="text-white hover:bg-neutral-800/50">
                        <td className="px-4 py-3 font-mono text-xs">{record.order_id?.slice(-8) || "—"}</td>
                        <td className="px-4 py-3">
                          <Badge color={actorColor(record.account_type)} size="small">
                            {actorLabel(record.account_type)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-400">
                          {record.customer_id && <div title={record.customer_id}>Cust: {record.customer_id.slice(-6)}</div>}
                          {record.vendor_id && <div title={record.vendor_id}>Vend: {record.vendor_id.slice(-6)}</div>}
                        </td>
                        <td className="px-4 py-3">{formatMoney(record.base_amount)}</td>
                        <td className="px-4 py-3">
                          {record.fee_type === "percentage" 
                            ? `${record.fee_value}%` 
                            : formatMoney(record.fee_value)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className={hasAdjustment ? "text-orange-400 font-medium" : ""}>
                              {formatMoney(finalCommission)}
                            </span>
                            {hasAdjustment && (
                              <span className="text-xs text-neutral-500 line-through">
                                {formatMoney(record.commission_amount)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {record.vendor_payout !== null ? formatMoney(record.vendor_payout) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge color={record.status === "paid_out" ? "green" : record.status === "cancelled" ? "red" : record.status === "pending" ? "orange" : "grey"}>
                            {record.status}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-xs text-neutral-400">
                          {new Date(record.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="secondary" size="small" onClick={() => openAdjustModal(record)}>
                            <PencilSquare className="w-4 h-4 mr-1" /> Adjust
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Pagination Controls */}
            {!isRecordsLoading && totalRecords > limit && (
              <div className="flex items-center justify-between p-4 border-t border-neutral-700 bg-neutral-900">
                <span className="text-sm text-neutral-400">
                  Showing {offset + 1} to {Math.min(offset + limit, totalRecords)} of {totalRecords}
                </span>
                <div className="flex gap-2">
                  <Button 
                    variant="secondary" 
                    size="small" 
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                  >
                    Prev
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="small"
                    disabled={offset + limit >= totalRecords}
                    onClick={() => setOffset(offset + limit)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </Container>

      {/* Manual Adjustment Modal Overlay */}
      {adjustRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <Heading level="h2" className="text-lg font-semibold">Adjust Commission</Heading>
              <IconButton variant="transparent" onClick={() => setAdjustRecord(null)}>
                <XMark />
              </IconButton>
            </div>
            
            <div className="flex flex-col gap-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded text-sm">
                <span className="text-gray-500">Current Commission:</span>
                <span className="font-semibold">{formatMoney(adjustRecord.adjusted_commission_amount ?? adjustRecord.commission_amount)}</span>
              </div>
              
              <div className="flex flex-col gap-y-1">
                <Label>New Commission Amount (CA$)</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  min="0"
                  value={adjustAmount} 
                  onChange={(e) => setAdjustAmount(e.target.value)} 
                />
              </div>

              <div className="flex flex-col gap-y-1">
                <Label>Reason for Adjustment</Label>
                <Textarea 
                  placeholder="E.g. Refund agreed with vendor..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-x-2 mt-6">
              <Button variant="secondary" onClick={() => setAdjustRecord(null)}>Cancel</Button>
              <Button onClick={handleAdjustSubmit} isLoading={isAdjusting}>Confirm Adjustment</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Commissions",
  icon: CurrencyDollar,
})

export default CommissionsPage
