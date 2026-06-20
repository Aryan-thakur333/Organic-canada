import { ArrowLeft, CheckCircle, XCircle, ExclamationCircle } from "@medusajs/icons"
import { Container, Heading, StatusBadge, Button, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

const VendorDetailsPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [vendor, setVendor] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchVendorDetails = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/admin/vendors/${id}`, { credentials: "include" })
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Vendor not found")
        }
        throw new Error("Failed to load vendor details")
      }
      const data = await response.json()
      setVendor(data.vendor)
    } catch (error: any) {
      console.error(error)
      toast.error("Error", {
        description: error.message || "Failed to load vendor details",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchVendorDetails()
  }, [id])

  const handleAction = async (action: "approve" | "reject" | "suspend") => {
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
      fetchVendorDetails()
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

  if (isLoading) {
    return (
      <Container className="p-8 flex justify-center items-center">
        <Text className="text-gray-500">Loading vendor details...</Text>
      </Container>
    )
  }

  if (!vendor) {
    return (
      <Container className="p-8 flex flex-col items-center gap-y-4">
        <Text className="text-gray-500 font-semibold">Vendor not found</Text>
        <Button onClick={() => navigate("/admin/vendors")}>Back to Vendors</Button>
      </Container>
    )
  }

  return (
    <div className="flex flex-col gap-y-6 max-w-4xl mx-auto p-8">
      {/* Back button */}
      <div>
        <Button
          variant="transparent"
          onClick={() => navigate("/admin/vendors")}
          className="flex items-center gap-x-2 text-gray-500 hover:text-gray-900 pl-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Vendors
        </Button>
      </div>

      {/* Main card */}
      <Container className="flex flex-col gap-y-6">
        <div className="flex items-start justify-between border-b border-gray-100 pb-6">
          <div>
            <Heading level="h1" className="text-2xl font-bold text-gray-900">{vendor.name}</Heading>
            <Text className="text-gray-500 mt-1">Vendor ID: {vendor.id}</Text>
          </div>
          <StatusBadge color={getStatusColor(vendor.status)}>
            {vendor.status.charAt(0).toUpperCase() + vendor.status.slice(1)}
          </StatusBadge>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Store Name</Text>
            <Text className="text-base text-gray-900 mt-1 font-medium">{vendor.name}</Text>
          </div>

          <div>
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Email Address</Text>
            <Text className="text-base text-gray-900 mt-1 font-medium">{vendor.email}</Text>
          </div>

          <div>
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Created Date</Text>
            <Text className="text-base text-gray-900 mt-1 font-medium">
              {new Date(vendor.created_at).toLocaleDateString(undefined, {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </Text>
          </div>

          <div>
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</Text>
            <div className="mt-1 flex items-center">
              <StatusBadge color={getStatusColor(vendor.status)}>
                {vendor.status.charAt(0).toUpperCase() + vendor.status.slice(1)}
              </StatusBadge>
            </div>
          </div>
        </div>

        {/* Description section */}
        {vendor.description && (
          <div className="border-t border-gray-100 pt-6">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Description</Text>
            <Text className="text-base text-gray-700 mt-2 bg-gray-50 p-4 rounded-md border border-gray-100 whitespace-pre-line leading-relaxed">
              {vendor.description}
            </Text>
          </div>
        )}

        {/* Actions bar */}
        <div className="border-t border-gray-100 pt-6 flex items-center justify-end gap-x-3">
          {vendor.status !== "approved" && (
            <Button
              variant="primary"
              onClick={() => handleAction("approve")}
              className="bg-green-600 hover:bg-green-700 border-none flex items-center gap-x-2 text-white"
            >
              <CheckCircle className="w-4 h-4" />
              Approve Vendor
            </Button>
          )}

          {vendor.status !== "rejected" && vendor.status !== "suspended" && (
            <Button
              variant="danger"
              onClick={() => handleAction("reject")}
              className="flex items-center gap-x-2"
            >
              <XCircle className="w-4 h-4" />
              Reject Application
            </Button>
          )}

          {vendor.status === "approved" && (
            <Button
              variant="secondary"
              onClick={() => handleAction("suspend")}
              className="flex items-center gap-x-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <ExclamationCircle className="w-4 h-4" />
              Suspend Account
            </Button>
          )}
        </div>
      </Container>
    </div>
  )
}

export default VendorDetailsPage
