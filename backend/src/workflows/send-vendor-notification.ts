import {
  createWorkflow,
  createStep,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../modules/vendor"

// ── Types ──────────────────────────────────────────────────────────────────

export type SendVendorNotificationInput = {
  vendor_id: string
  subject: string
  message: string
  priority: "low" | "normal" | "high"
  channel: "email" | "dashboard" | "sms"
  metadata?: Record<string, unknown>
}

export type SendVendorNotificationOutput = {
  vendor_id: string
  vendor_name: string
  vendor_email: string
  subject: string
  sent_at: string
  channel: string
}

// ── Step: Resolve vendor details ──────────────────────────────────────────

const resolveVendorStep = createStep(
  "resolve-vendor-details",

  async ({ vendor_id }: { vendor_id: string }, { container }) => {
    const vendorService = container.resolve(VENDOR_MODULE) as any

    const vendor = await vendorService.retrieveVendor(vendor_id, {
      select: ["id", "name", "store_name", "email", "status"],
    })

    if (!vendor) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Vendor "${vendor_id}" not found`
      )
    }

    return new StepResponse({
      id: vendor.id,
      name: vendor.store_name || vendor.name,
      email: vendor.email,
    })
  },
  // Compensate: read-only
  async () => {}
)

// ── Step: Dispatch notification ───────────────────────────────────────────

const dispatchNotificationStep = createStep(
  "dispatch-vendor-notification",

  async (
    input: SendVendorNotificationInput & {
      vendor_name: string
      vendor_email: string
    },
    { container }
  ) => {
    const timestamp = new Date().toISOString()
    const logTag = `[VendorNotification][${input.channel}]`

    // Build the notification payload
    const payload = {
      to: {
        id: input.vendor_id,
        name: input.vendor_name,
        email: input.vendor_email,
      },
      subject: input.subject,
      body: input.message,
      priority: input.priority,
      metadata: input.metadata ?? {},
      sent_at: timestamp,
    }

    // Dispatch via the selected channel
    switch (input.channel) {
      case "email":
        console.log(
          `${logTag} Email dispatch to ${input.vendor_email}:\n` +
          `  Subject: ${input.subject}\n` +
          `  Message: ${input.message}`
        )
        break

      case "dashboard":
        console.log(
          `${logTag} Dashboard alert for vendor ${input.vendor_name} (${input.vendor_id}):\n` +
          `  ${input.subject}: ${input.message}`
        )
        break

      case "sms":
        console.log(
          `${logTag} SMS dispatch to ${input.vendor_name}:\n` +
          `  ${input.subject}: ${input.message}`
        )
        break

      default:
        console.log(
          `${logTag} Generic notification for vendor ${input.vendor_id}:\n` +
          `  ${JSON.stringify(payload, null, 2)}`
        )
    }

    const output: SendVendorNotificationOutput = {
      vendor_id: input.vendor_id,
      vendor_name: input.vendor_name,
      vendor_email: input.vendor_email,
      subject: input.subject,
      sent_at: timestamp,
      channel: input.channel,
    }

    return new StepResponse(output)
  },

  // Compensate: log reversal (no actual side-effect to undo)
  async (output: SendVendorNotificationOutput) => {
    console.log(
      `[VendorNotification][Compensate] Reverting notification sent at ${output.sent_at} ` +
      `for vendor ${output.vendor_id} — subject: "${output.subject}"`
    )
  }
)

// ── Workflow ───────────────────────────────────────────────────────────────

/**
 * Send Vendor Notification Workflow
 *
 * A reusable workflow that resolves vendor details and dispatches a
 * notification via the specified channel (email, dashboard, sms).
 *
 * Use from any subscriber or background task:
 * ```
 * const { result } = await sendVendorNotificationWorkflow(container).run({
 *   input: {
 *     vendor_id: "01J...",
 *     subject: "Low Stock Alert",
 *     message: "Your product 'Premium Organic Apples' is running low.",
 *     priority: "high",
 *     channel: "email",
 *   }
 * })
 * ```
 */
export const sendVendorNotificationWorkflow = createWorkflow(
  "send-vendor-notification",

  (input: SendVendorNotificationInput) => {
    // Step 1: Resolve vendor display name and email
    const vendor = resolveVendorStep({ vendor_id: input.vendor_id })

    // Step 2: Dispatch the notification with enriched vendor details
    const result = dispatchNotificationStep({
      vendor_id: input.vendor_id,
      subject: input.subject,
      message: input.message,
      priority: input.priority,
      channel: input.channel,
      metadata: input.metadata,
      vendor_name: vendor.name,
      vendor_email: vendor.email,
    })

    return new WorkflowResponse(result)
  }
)
