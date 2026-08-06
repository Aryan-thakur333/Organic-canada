export type B2BQuoteStatus =
  | "pending_merchant"
  | "pending_review"
  | "pending_customer"
  | "accepted"
  | "customer_rejected"
  | "merchant_rejected"
  | "rejected"

export type B2BQuoteItem = {
  id: string
  item_id?: string
  product_id?: string | null
  variant_id?: string | null
  title: string
  sku?: string | null
  quantity: number
  original_unit_price?: number
  unit_price: number
  requested_unit_price?: number
  negotiated_unit_price?: number
  line_total: number
  total?: number
  metadata?: Record<string, any>
  modified_by_admin?: boolean
}

export type B2BQuote = {
  id: string
  status: B2BQuoteStatus
  company_id?: string | null
  company?: Record<string, any> | null
  customer_id?: string | null
  customer?: Record<string, any> | null
  customer_email?: string | null
  customer_name?: string | null
  company_name?: string | null
  company_status?: string | null
  currency_code: string
  subtotal: number
  total: number
  item_count: number
  items_count?: number
  total_units: number
  items: B2BQuoteItem[]
  requested_items?: B2BQuoteItem[]
  negotiated_items?: B2BQuoteItem[]
  requested_total?: number
  original_total?: number
  negotiated_subtotal?: number
  negotiated_total?: number | null
  commission_amount?: number
  commission_type?: string
  commission_value?: number
  commission_policy?: string
  final_payable_total?: number
  commission?: {
    account_type?: string
    policy?: string
    base_amount?: number
    fee_type?: string
    fee_value?: number
    amount?: number
    final_payable_total?: number
    currency_code?: string
    calculated_at?: string | null
  }
  quote_adjustment_total?: number
  payment_state?: string
  payment_terms?: string | null
  payment_due_date?: string | null
  payment_collection_id?: string | null
  selected_payment_provider_id?: string | null
  offer_version?: number
  note?: string | null
  buyer_note?: string | null
  admin_note?: string | null
  rejection_reason?: string | null
  sent_at?: string | null
  accepted_at?: string | null
  rejected_at?: string | null
  paid_at?: string | null
  created_at?: string
  updated_at?: string
  draft_order_id?: string | null
  order_change_id?: string | null
  cart_id?: string | null
  created_order_id?: string | null
  order_id?: string | null
  preview?: {
    items: B2BQuoteItem[]
    subtotal: number
    total: number
    original_subtotal: number
    shipping_total: number
    discount_total: number
    currency_code: string
  }
}

export type B2BQuoteMessage = {
  id: string
  quote_id: string
  sender_type: "customer" | "admin" | "system"
  sender_id?: string | null
  message: string
  is_system_message?: boolean
  read_at?: string | null
  created_at?: string
  updated_at?: string
  metadata?: Record<string, any> | null
}

export type B2BQuoteListResponse = {
  quotes: B2BQuote[]
  count: number
  offset: number
  limit: number
}
