import { AbstractPaymentProvider, PaymentSessionStatus } from "@medusajs/framework/utils"

class PaypalProviderService extends AbstractPaymentProvider<any> {
  static identifier = "paypal"

  constructor(container: any, options: any) {
    super(container, options)
  }

  async capturePayment(input: any): Promise<any> {
    return { status: "captured" }
  }

  async authorizePayment(input: any): Promise<any> {
    return {
      status: "authorized" as PaymentSessionStatus,
      data: { id: "mock_auth_id" },
    }
  }

  async cancelPayment(input: any): Promise<any> {
    return { id: "mock_cancel_id" }
  }

  async initiatePayment(input: any): Promise<any> {
    return {
      data: { id: "mock_init_data_id" },
    } as any
  }

  async deletePayment(input: any): Promise<any> {
    return {}
  }

  async getPaymentStatus(input: any): Promise<any> {
    return { status: "authorized" } as any
  }

  async refundPayment(input: any): Promise<any> {
    return { id: "mock_refund_id" }
  }

  async updatePayment(input: any): Promise<any> {
    return {
      data: { id: "mock_update_data_id" },
    } as any
  }

  async retrievePayment(input: any): Promise<any> {
    return {}
  }

  async getWebhookActionAndData(input: any): Promise<any> {
    return { action: "not_supported" } as any
  }
}

export default PaypalProviderService
