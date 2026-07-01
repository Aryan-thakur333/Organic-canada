export function getAccountType(customer, b2bCompany) {
  if (!customer && !b2bCompany) return 'guest';

  const status = b2bCompany?.status;
  if (status === 'approved' || status === 'active') return 'b2b_approved';
  if (status === 'pending') return 'b2b_pending';
  if (status === 'rejected' || status === 'suspended') return 'b2b_rejected';

  return customer ? 'b2c' : 'guest';
}

export function isApprovedB2BAccount(customer, b2bCompany) {
  return getAccountType(customer, b2bCompany) === 'b2b_approved';
}
