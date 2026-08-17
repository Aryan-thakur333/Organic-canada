import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"

export async function createAndLoginAdmin(
  container: any,
  api: any
): Promise<{ email: string; token: string; headers: Record<string, string> }> {
  console.log("[SETUP] admin-start")
  const adminEmail = `integration-admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@eatsie.test`
  const adminPassword = "AdminPass123!"
  const authService: any = container.resolve(Modules.AUTH)
  
  let registration
  try {
    registration = await authService.register("emailpass", {
      body: { email: adminEmail, password: adminPassword },
    })
  } catch (err: any) {
    throw new Error(`[TEST_SETUP_ADMIN_REGISTER] registration call failed. error=${err.message}`)
  }

  if (!registration?.success) {
    throw new Error(`[TEST_SETUP_ADMIN_REGISTER] success=false. data=${JSON.stringify(registration)}`)
  }

  try {
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
  } catch (err: any) {
    throw new Error(`[TEST_SETUP_ADMIN_CREATE_USER] workflow failed. error=${err.message}`)
  }

  const adminLogin = await api.post("/auth/user/emailpass", {
    email: adminEmail,
    password: adminPassword,
  }, { validateStatus: () => true })

  if (adminLogin.status !== 200) {
    throw new Error(`[TEST_SETUP_ADMIN_LOGIN] status=${adminLogin.status} body=${JSON.stringify(adminLogin.data)}`)
  }

  const token = adminLogin.data.token
  if (!token) {
    throw new Error("[TEST_SETUP_ADMIN_LOGIN] token is missing in response body")
  }

  console.log("[SETUP] admin-ready")
  return {
    email: adminEmail,
    token,
    headers: { Authorization: `Bearer ${token}` }
  }
}

export async function registerVendor(
  api: any,
  storeName: string,
  email: string,
  password = "TestVendorPass123!"
): Promise<any> {
  console.log(`[SETUP] vendor-register storeName=${storeName}`)
  const regRes = await api.post("/vendor/register", {
    name: storeName,
    store_name: storeName,
    email,
    password,
  }, { validateStatus: () => true })

  if (regRes.status !== 201) {
    throw new Error(`[TEST_SETUP_VENDOR_REGISTER] status=${regRes.status} body=${JSON.stringify(regRes.data)}`)
  }

  return regRes.data.vendor
}

export async function approveVendor(
  api: any,
  vendorId: string,
  adminHeaders: Record<string, string>
): Promise<any> {
  console.log(`[SETUP] vendor-approved id=${vendorId}`)
  const approveRes = await api.post(`/admin/vendors/${vendorId}/approve`, {}, {
    headers: adminHeaders,
    validateStatus: () => true
  })

  if (approveRes.status !== 200) {
    throw new Error(`[TEST_SETUP_VENDOR_APPROVE] status=${approveRes.status} body=${JSON.stringify(approveRes.data)}`)
  }

  return approveRes.data.vendor
}

export async function loginVendor(
  api: any,
  email: string,
  password = "TestVendorPass123!"
): Promise<{ token: string; headers: Record<string, string> }> {
  console.log(`[SETUP] vendor-login email=${email}`)
  const loginRes = await api.post("/vendor/login", {
    email,
    password,
  }, { validateStatus: () => true })

  if (loginRes.status !== 200) {
    throw new Error(`[TEST_SETUP_VENDOR_LOGIN] status=${loginRes.status} body=${JSON.stringify(loginRes.data)}`)
  }

  const token = loginRes.data.token || loginRes.data.vendor_token
  if (!token) {
    throw new Error("[TEST_SETUP_VENDOR_LOGIN] token is missing in response body")
  }

  return {
    token,
    headers: { Authorization: `Bearer ${token}` }
  }
}

export async function registerAndApproveVendor(
  api: any,
  storeName: string,
  adminHeaders: Record<string, string>
): Promise<{ id: string; email: string; token: string; headers: Record<string, string> }> {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const email = `vendor-${storeName.toLowerCase()}-${suffix}@eatsie.test`
  const password = "TestVendorPass123!"

  const vendor = await registerVendor(api, storeName, email, password)
  await approveVendor(api, vendor.id, adminHeaders)
  const loginData = await loginVendor(api, email, password)

  return {
    id: vendor.id,
    email,
    token: loginData.token,
    headers: loginData.headers
  }
}
