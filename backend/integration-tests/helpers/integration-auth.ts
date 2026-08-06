import { createUserAccountWorkflow, createStockLocationsWorkflow, linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"

export async function createAndLoginAdmin(container: any, api: any): Promise<{ email: string; token: string; headers: Record<string, string> }> {
  const adminEmail = `integration-admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@eatsie.test`
  const adminPassword = "AdminPass123!"
  const authService: any = container.resolve(Modules.AUTH)
  
  const registration = await authService.register("emailpass", {
    body: { email: adminEmail, password: adminPassword },
  })
  if (!registration.success) {
    throw new Error("Integration admin registration failed")
  }

  await createUserAccountWorkflow(container).run({
    input: {
      authIdentityId: registration.authIdentity.id,
      userData: {
        email: adminEmail,
        first_name: "Integration",
        last_name: "Admin",
      },
    },
  })

  const adminLogin = await api.post("/auth/user/emailpass", {
    email: adminEmail,
    password: adminPassword,
  }, { validateStatus: () => true })

  if (adminLogin.status !== 200) {
    throw new Error(`Integration admin login failed with status ${adminLogin.status}`)
  }

  const token = adminLogin.data.token
  return {
    email: adminEmail,
    token,
    headers: { Authorization: `Bearer ${token}` }
  }
}

export async function registerAndApproveVendor(container: any, api: any, storeName: string, adminHeaders: Record<string, string>): Promise<{ id: string; email: string; token: string; headers: Record<string, string> }> {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const email = `vendor-${storeName.toLowerCase()}-${suffix}@eatsie.test`
  const password = "TestVendorPass123!"

  const regRes = await api.post("/vendor/register", {
    name: storeName,
    store_name: storeName,
    email,
    password,
  }, { validateStatus: () => true })

  if (regRes.status !== 201) {
    throw new Error(`Vendor registration failed with status ${regRes.status}: ${JSON.stringify(regRes.data)}`)
  }

  const vendorId = regRes.data.vendor.id

  const approveRes = await api.post(`/admin/vendors/${vendorId}/approve`, {}, {
    headers: adminHeaders,
    validateStatus: () => true
  })

  if (approveRes.status !== 200) {
    throw new Error(`Vendor approval failed with status ${approveRes.status}: ${JSON.stringify(approveRes.data)}`)
  }

  // Create and link stock location for the approved vendor so they can fulfill orders
  try {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: `${storeName} Warehouse`,
            address: {
              city: "Toronto",
              country_code: "CA",
              address_1: "Vendor warehouse",
            },
          },
        ],
      },
    })
    const stockLocation = result[0]

    const link = container.resolve("remoteLink")
    await link.create({
      vendor: { vendor_id: vendorId },
      stock_location: { stock_location_id: stockLocation.id }
    })

    const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
    const [salesChannel] = await salesChannelService.listSalesChannels({ is_disabled: false }, { take: 1 })
    if (salesChannel) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: stockLocation.id, add: [salesChannel.id] },
      })
    }
  } catch (err: any) {
    throw new Error(`Failed to create/link stock location for vendor ${vendorId}: ${err.message}`)
  }

  const loginRes = await api.post("/vendor/login", {
    email,
    password,
  }, { validateStatus: () => true })

  if (loginRes.status !== 200) {
    throw new Error(`Vendor login failed with status ${loginRes.status}: ${JSON.stringify(loginRes.data)}`)
  }

  const token = loginRes.data.token || loginRes.data.vendor_token
  return {
    id: vendorId,
    email,
    token,
    headers: { Authorization: `Bearer ${token}` }
  }
}
