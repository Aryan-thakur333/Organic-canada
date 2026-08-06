import { MedusaService } from "@medusajs/framework/utils"
import { OmsOrder } from "./models/oms-order"
import { OmsOrderGroup } from "./models/oms-order-group"
import { OmsVendorOrder } from "./models/oms-vendor-order"
import { OmsOrderEvent } from "./models/oms-order-event"
import { OmsFulfillmentAssignment } from "./models/oms-fulfillment-assignment"
import { OmsCancellationRequest } from "./models/oms-cancellation-request"
import { OmsReturnRequest } from "./models/oms-return-request"

export default class OmsModuleService extends MedusaService({
  OmsOrder,
  OmsOrderGroup,
  OmsVendorOrder,
  OmsOrderEvent,
  OmsFulfillmentAssignment,
  OmsCancellationRequest,
  OmsReturnRequest,
}) {}
