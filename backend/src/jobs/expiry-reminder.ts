import { MedusaContainer } from "@medusajs/framework/types"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

export default async function expiryReminderJob(container: MedusaContainer) {
  const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)

  const threeDaysFromNow = new Date()
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
  threeDaysFromNow.setHours(23, 59, 59, 999)

  const twoDaysFromNow = new Date()
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2)
  twoDaysFromNow.setHours(0, 0, 0, 0)

  try {
    const subscriptions = await subscriptionService.listSubscriptions({ status: "active" })

    const upcomingRenewals = subscriptions.filter((sub: any) => {
      if (!sub.next_billing_date) return false
      const billingDate = new Date(sub.next_billing_date)
      return billingDate >= twoDaysFromNow && billingDate <= threeDaysFromNow
    })

    console.log(`[Expiry Reminder Job] Found ${upcomingRenewals.length} subscriptions renewing in 3 days`)

    for (const sub of upcomingRenewals) {
      // In production: send email reminder via notification service
      console.log(
        `[Expiry Reminder Job] Reminder for customer ${sub.customer_email}: subscription ${sub.id} renews on ${sub.next_billing_date}`
      )
    }
  } catch (error) {
    console.error("[Expiry Reminder Job] Error:", error)
  }
}

export const config = {
  name: "subscription-expiry-reminder",
  schedule: "0 9 * * *", // Run daily at 9 AM
}
