import type { ExecArgs } from "@medusajs/framework/types"
import { VENDOR_MODULE } from "../modules/vendor/index.js"
import { hashPassword } from "../api/vendor/auth.js"

const TEST_VENDOR = {
  email: "vendor@eatsie.local",
  password: "12345678",
  status: "approved",
  business_name: "Eatsie Test Vendor",
  owner_name: "Eatsie Test Vendor",
}

export default async function createTestVendor({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const vendorService: any = container.resolve(VENDOR_MODULE)
  const email = TEST_VENDOR.email.toLowerCase()
  const passwordHash = hashPassword(TEST_VENDOR.password)

  const [existing] = await vendorService.listVendors({ email })

  let vendor
  if (existing) {
    vendor = await vendorService.updateVendors({
      id: existing.id,
      name: TEST_VENDOR.owner_name,
      store_name: TEST_VENDOR.business_name,
      email,
      password_hash: passwordHash,
      status: TEST_VENDOR.status,
    })
  } else {
    vendor = await vendorService.createVendors({
      name: TEST_VENDOR.owner_name,
      store_name: TEST_VENDOR.business_name,
      email,
      phone: null,
      description: "Local development test vendor",
      company_details: null,
      password_hash: passwordHash,
      status: TEST_VENDOR.status,
    })
  }

  logger.info("[create-test-vendor] Ready")
  logger.info(`id: ${vendor.id}`)
  logger.info(`email: ${vendor.email}`)
  logger.info(`status: ${vendor.status}`)
  logger.info("password: 12345678")

  return {
    id: vendor.id,
    email: vendor.email,
    status: vendor.status,
  }
}
