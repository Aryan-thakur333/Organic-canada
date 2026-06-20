import Medusa from "@medusajs/js-sdk"

const BACKEND_URL =
  import.meta.env.VITE_MEDUSA_BACKEND_URL || "http://localhost:9000"

const PUBLISHABLE_KEY =
  import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY || ""

const medusa = new Medusa({
  baseUrl: BACKEND_URL,
  debug: true,
  publishableKey: PUBLISHABLE_KEY,
})

export default medusa