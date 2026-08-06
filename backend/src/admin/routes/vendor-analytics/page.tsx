import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar } from "@medusajs/icons"
import { Container, Heading, StatusBadge, Table, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

const VendorAnalyticsIndexPage = () => {
  const [vendors, setVendors] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setIsLoading(true)
    fetch("/admin/vendors", { credentials: "include" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.message || "Failed to fetch vendors")
        }
        return data.vendors || []
      })
      .then(setVendors)
      .catch((error: any) => {
        toast.error("Vendor analytics", {
          description: error.message || "Failed to load vendors",
        })
      })
      .finally(() => setIsLoading(false))
  }, [])

  const statusColor = (status: string) => {
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
      <div>
        <Heading level="h1">Vendor Analytics</Heading>
        <Text className="text-ui-fg-subtle mt-1">
          Select a vendor to review product, revenue, and order analytics.
        </Text>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8">
            <Text className="text-ui-fg-subtle">Loading vendors...</Text>
          </div>
        ) : vendors.length === 0 ? (
          <div className="p-8">
            <Text className="text-ui-fg-subtle">No vendors found.</Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Store</Table.HeaderCell>
                <Table.HeaderCell>Email</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Joined</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {vendors.map((vendor) => (
                <Table.Row
                  key={vendor.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/vendor-analytics/${vendor.id}`)}
                >
                  <Table.Cell className="font-medium">
                    {vendor.store_name || vendor.name}
                  </Table.Cell>
                  <Table.Cell>{vendor.email}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge color={statusColor(vendor.status)}>
                      {vendor.status}
                    </StatusBadge>
                  </Table.Cell>
                  <Table.Cell className="text-ui-fg-subtle">
                    {vendor.created_at ? new Date(vendor.created_at).toLocaleDateString() : "-"}
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
  label: "Vendor Analytics",
  icon: ChartBar,
})

export default VendorAnalyticsIndexPage
