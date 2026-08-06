/**
 * Helper to determine the customer's commission type based on backend data.
 * 
 * Never trust a customer_type passed directly from the storefront during checkout.
 * Always rely on the authenticated customer record from the Medusa backend.
 * 
 * @param customer - The customer object retrieved from Medusa (must include metadata)
 * @returns "b2b_customer" or "normal_customer"
 */
export function getCustomerCommissionType(customer: any): "b2b_customer" | "normal_customer" {
  // 1. Default to normal_customer if no customer object is provided (e.g. guest checkout)
  if (!customer) {
    return "normal_customer"
  }

  // 2. Check metadata on the verified customer record
  const metadata = customer.metadata || {}
  
  if (metadata.customer_type === "b2b_customer") {
    return "b2b_customer"
  }

  // 3. Fallback to normal_customer for any other value or missing metadata
  return "normal_customer"
}
