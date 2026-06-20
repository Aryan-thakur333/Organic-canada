import { AbstractPaymentProvider, PaymentSessionStatus } from "@medusajs/framework/utils";
import crypto from "crypto";

export default class SystemPaymentProvider extends AbstractPaymentProvider {
  static identifier = "system";

  async getStatus(_) { return "authorized" as any; }
  async getPaymentData(_) { return {}; }
  async initiatePayment(input) { return { data: {}, id: crypto.randomUUID() }; }
  async getPaymentStatus(input) { return { status: "authorized" } as any; }
  async retrievePayment(input) { return {}; }
  async authorizePayment(input) { return { data: {}, status: PaymentSessionStatus.AUTHORIZED }; }
  async updatePayment(input) { return { data: {} }; }
  async deletePayment(input) { return { data: {} }; }
  async capturePayment(input) { return { data: {} }; }
  async retrieveAccountHolder(input) { return { id: input.id }; }
  async createAccountHolder(input) { return { id: input.context.customer.id }; }
  async deleteAccountHolder(input) { return { data: {} }; }
  async refundPayment(input) { return { data: {} }; }
  async cancelPayment(input) { return { data: {} }; }
  async getWebhookActionAndData(data) { return { action: "not_supported" } as any; }
}
