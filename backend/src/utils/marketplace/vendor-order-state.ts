import {
  VENDOR_ORDER_STATUSES,
  VendorOrderStatus,
} from "../../modules/marketplace/constants/vendor-order-status"

export type { VendorOrderStatus }

export const ALLOWED_VENDOR_ORDER_TRANSITIONS: Record<VendorOrderStatus, VendorOrderStatus[]> = {
  pending: ["accepted", "rejected", "cancelled"],
  accepted: ["processing", "prepared", "cancelled"],
  processing: ["prepared", "ready_to_ship", "cancelled"],
  prepared: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  rejected: ["accepted"], // Admin reopen
  cancelled: [],
}

export function isValidVendorOrderTransition(current: VendorOrderStatus, next: VendorOrderStatus): boolean {
  if (current === next) return true
  const allowed = ALLOWED_VENDOR_ORDER_TRANSITIONS[current] || []
  return allowed.includes(next as any)
}

export function validateVendorOrderTransition(current: string, next: string) {
  if (!isValidVendorOrderTransition(current as VendorOrderStatus, next as VendorOrderStatus)) {
    throw new Error(`Invalid state transition from ${current} to ${next}`)
  }
}
