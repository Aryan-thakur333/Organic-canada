import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Users, CheckCircle, XCircle, ExclamationCircle, EllipsisHorizontal } from "@medusajs/icons"
import { Container, Heading, Table, StatusBadge, Button, DropdownMenu, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

const VendorsPage = () => {
  const [vendors, setVendors] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  const fetchVendors = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/admin/vendors", { credentials: "include" })
      if (!response.ok) {
        throw new Error("Failed to fetch vendors")
      }
      const data = await response.json()
      setVendors(data.vendors || [])
    } catch (error: any) {
      console.error("Fetch vendors error:", error)
      toast.error("Error", {
        description: error.message || "Failed to load vendors",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchVendors()
  }, [])

  const handleAction = async (id: string, action: "approve" | "reject" | "suspend", e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click navigation
    try {
      const response = await fetch(`/admin/vendors/${id}/${action}`, {
        method: "POST",
        credentials: "include",
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `Failed to ${action} vendor`)
      }
      toast.success("Success", {
        description: `Vendor has been ${action === "approve" ? "approved" : action === "reject" ? "rejected" : "suspended"} successfully.`,
      })
      fetchVendors()
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || `Failed to perform action ${action}`,
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "green"
      case "pending":
        return "orange"
      case "rejected":
        return "red"
      case "suspended":
        return "grey"
      default:
        return "grey"
    }
  }

  return (
    <Container className="p-8 flex flex-col gap-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1" className="text-2xl font-semibold">Vendor Applications</Heading>
          <Text className="text-gray-500 mt-1">Manage and review vendor registrations and suspension statuses.</Text>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        {isLoading ? (
          <div className="p-8 flex justify-center items-center">
            <Text className="text-gray-500">Loading vendors...</Text>
          </div>
        ) : vendors.length === 0 ? (
          <div className="p-12 flex flex-col justify-center items-center gap-y-2">
            <Users className="w-12 h-12 text-gray-300" />
            <Text className="font-semibold text-gray-700">No vendor applications found</Text>
            <Text className="text-gray-400 text-sm">When new vendors register, they will appear here.</Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Store Name</Table.HeaderCell>
                <Table.HeaderCell>Email</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Created Date</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {vendors.map((vendor) => (
                <Table.Row
                  key={vendor.id}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => navigate(`/admin/vendors/${vendor.id}`)}
                >
                  <Table.Cell className="font-medium text-gray-900">{vendor.name}</Table.Cell>
                  <Table.Cell className="text-gray-600">{vendor.email}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={getStatusColor(vendor.status)}>
                      {vendor.status.charAt(0).toUpperCase() + vendor.status.slice(1)}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell className="text-gray-500">
                    {new Date(vendor.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </Table.Cell>
                  <Table.Cell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenu.Trigger asChild>
                        <Button variant="transparent" size="small">
                          <EllipsisHorizontal />
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content>
                        <DropdownMenu.Item
                          onClick={() => navigate(`/admin/vendors/${vendor.id}`)}
                        >
                          View Details
                        </DropdownMenu.Item>
                        {vendor.status !== "approved" && (
                          <DropdownMenu.Item
                            onClick={(e) => handleAction(vendor.id, "approve", e)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <span className="flex items-center gap-x-2">
                              <CheckCircle className="w-4 h-4" />
                              Approve
                            </span>
                          </DropdownMenu.Item>
                        )}
                        {vendor.status !== "rejected" && vendor.status !== "suspended" && (
                          <DropdownMenu.Item
                            onClick={(e) => handleAction(vendor.id, "reject", e)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <span className="flex items-center gap-x-2">
                              <XCircle className="w-4 h-4" />
                              Reject
                            </span>
                          </DropdownMenu.Item>
                        )}
                        {vendor.status === "approved" && (
                          <DropdownMenu.Item
                            onClick={(e) => handleAction(vendor.id, "suspend", e)}
                            className="text-gray-600 hover:text-gray-700"
                          >
                            <span className="flex items-center gap-x-2">
                              <ExclamationCircle className="w-4 h-4" />
                              Suspend
                            </span>
                          </DropdownMenu.Item>
                        )}
                      </DropdownMenu.Content>
                    </DropdownMenu>
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
  label: "Vendor Approvals",
  icon: Users,
})

export default VendorsPage
