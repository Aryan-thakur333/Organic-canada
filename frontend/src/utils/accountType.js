const APPROVED_B2B_STATUSES = new Set(['approved', 'active']);
const PENDING_B2B_STATUSES = new Set(['pending']);
const REJECTED_B2B_STATUSES = new Set(['rejected', 'suspended']);

function normalizeStatus(value) {
  return typeof value === 'string' ? value.toLowerCase() : null;
}

export function getB2BCompanyFromCustomer(customer) {
  if (!customer || typeof customer !== 'object') return null;

  const candidates = [
    Array.isArray(customer.company) ? customer.company[0] : customer.company,
    Array.isArray(customer.companies) ? customer.companies[0] : customer.companies,
    customer.b2b_company,
    customer.b2bCompany,
    customer.metadata?.company,
    customer.metadata?.b2b_company,
    customer.metadata?.b2bCompany,
  ];

  return candidates.find((candidate) => candidate && typeof candidate === 'object') || null;
}

export function getB2BStatus(customer, b2bCompany) {
  const company = b2bCompany || getB2BCompanyFromCustomer(customer);
  return normalizeStatus(
    company?.status ||
      customer?.b2b_status ||
      customer?.b2bStatus ||
      customer?.metadata?.b2b_status ||
      customer?.metadata?.b2bStatus
  );
}

export function isB2BUser(customer, b2bCompany) {
  return APPROVED_B2B_STATUSES.has(getB2BStatus(customer, b2bCompany));
}

export function hasB2BApplication(customer, b2bCompany) {
  return Boolean(getB2BStatus(customer, b2bCompany));
}

export function getAccountType(customer, b2bCompany) {
  if (!customer && !b2bCompany) return 'guest';

  const status = getB2BStatus(customer, b2bCompany);
  if (APPROVED_B2B_STATUSES.has(status)) return 'b2b_approved';
  if (PENDING_B2B_STATUSES.has(status)) return 'b2b_pending';
  if (REJECTED_B2B_STATUSES.has(status)) return 'b2b_rejected';

  return customer ? 'b2c' : 'guest';
}

export function isApprovedB2BAccount(customer, b2bCompany) {
  return isB2BUser(customer, b2bCompany);
}
