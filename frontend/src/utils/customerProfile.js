export const mapCustomerToProfile = (customer = {}) => ({
  id: customer.id || null,
  first_name: customer.first_name || '',
  last_name: customer.last_name || '',
  name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email || '',
  email: customer.email || '',
  phone: customer.phone || '',
  company_name: customer.company_name || '',
  created_at: customer.created_at || null,
  metadata: customer.metadata || {},
  addresses: Array.isArray(customer.addresses) ? customer.addresses : [],
});
