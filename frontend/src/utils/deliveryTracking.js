const FULFILLMENT_PROGRESS = {
  not_fulfilled: { step: 0, label: 'Order Confirmed' },
  pending: { step: 1, label: 'Preparing Order' },
  partially_fulfilled: { step: 1, label: 'Preparing Order' },
  fulfilled: { step: 2, label: 'Packed' },
  packed: { step: 2, label: 'Packed' },
  partially_shipped: { step: 3, label: 'Shipped' },
  shipped: { step: 3, label: 'Shipped' },
  out_for_delivery: { step: 4, label: 'Out For Delivery' },
  partially_delivered: { step: 4, label: 'Out For Delivery' },
  delivered: { step: 5, label: 'Delivered' },
  canceled: { step: 0, label: 'Cancelled' },
  cancelled: { step: 0, label: 'Cancelled' },
};

const TRACKING_STEPS = [
  'confirmed',
  'preparing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];

const STATUS_LABELS = {
  confirmed: 'Order Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
};

const PROVIDER_LABELS = {
  manual_manual: 'Organic Canada Delivery',
  manual: 'Organic Canada Delivery',
  shippo: 'Shippo',
  canada_post: 'Canada Post',
  ups: 'UPS',
  fedex: 'FedEx',
  dhl: 'DHL',
};

const FALLBACK_WAREHOUSE = {
  name: 'Canadian Warehouse',
  address: 'Toronto, Ontario, Canada',
};

const titleCase = (value) => String(value || '')
  .split(/[_\s-]+/)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
  .join(' ');

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

const normalized = (value) => String(value || '').toLowerCase();

const fulfillmentMetadata = (fulfillment) => fulfillment?.metadata || fulfillment?.data || {};

/**
 * Read vendor_fulfillment_status from order metadata.
 * This allows vendor-specific state (accepted → packed → shipped → delivered)
 * to be reflected on the customer's tracking page.
 */
const vendorFulfillmentStatus = (order) => {
  const meta = order?.metadata || {};
  // vendor_fulfillment_status is stored at the order level in metadata
  // when any vendor updates their fulfillment state
  return meta?.vendor_fulfillment_status?.toLowerCase() || null;
}

export const deriveTrackingState = (order) => {
  const vendorStatus = vendorFulfillmentStatus(order);
  const fulfillments = Array.isArray(order?.fulfillments) ? order.fulfillments : [];
  const hasFulfillment = fulfillments.length > 0;
  
  // Check vendor fulfillment status first (from vendor dashboard actions)
  const hasVendorDelivered = vendorStatus === 'delivered';
  const hasVendorShipped = ['shipped', 'out_for_delivery'].includes(vendorStatus);
  const hasVendorPacked = ['packed', 'shipped', 'delivered'].includes(vendorStatus);
  
  const hasDelivered = fulfillments.some((fulfillment) => {
    const metadata = fulfillmentMetadata(fulfillment);
    return Boolean(fulfillment?.delivered_at || metadata?.delivered_at || normalized(fulfillment?.status) === 'delivered');
  }) || normalized(order?.fulfillment_status) === 'delivered' || hasVendorDelivered;
  
  const hasShipped = fulfillments.some((fulfillment) => {
    const metadata = fulfillmentMetadata(fulfillment);
    return Boolean(fulfillment?.shipped_at || metadata?.shipped_at || normalized(fulfillment?.status) === 'shipped');
  }) || ['shipped', 'partially_shipped'].includes(normalized(order?.fulfillment_status)) || hasVendorShipped;

  let currentStatus = 'confirmed';
  let completedSteps = ['confirmed'];

  if (hasDelivered) {
    currentStatus = 'delivered';
    completedSteps = [...TRACKING_STEPS];
  } else if (hasShipped) {
    currentStatus = 'shipped';
    completedSteps = ['confirmed', 'preparing', 'packed', 'shipped'];
  } else if (hasFulfillment || hasVendorPacked) {
    currentStatus = 'packed';
    completedSteps = ['confirmed', 'preparing', 'packed'];
  }

  const firstFulfillment = fulfillments[0] || null;
  const firstShipped = fulfillments.find((fulfillment) => fulfillment?.shipped_at || fulfillmentMetadata(fulfillment)?.shipped_at) || null;
  const lastDelivered = [...fulfillments].reverse().find((fulfillment) => fulfillment?.delivered_at || fulfillmentMetadata(fulfillment)?.delivered_at) || null;
  const outForDelivery = fulfillments.find((fulfillment) =>
    fulfillmentMetadata(fulfillment)?.out_for_delivery_at || fulfillment?.out_for_delivery_at
  ) || firstShipped;

  return {
    currentStatus,
    currentStep: Math.max(0, TRACKING_STEPS.indexOf(currentStatus)),
    completedSteps,
    completedStepSet: new Set(completedSteps),
    label: STATUS_LABELS[currentStatus] || 'Order Confirmed',
    isDelivered: currentStatus === 'delivered',
    isCancelled: ['canceled', 'cancelled'].includes(normalized(order?.status)) ||
      ['canceled', 'cancelled'].includes(normalized(order?.fulfillment_status)),
    timestamps: {
      confirmed: order?.created_at,
      preparing: firstFulfillment?.created_at || order?.updated_at || order?.created_at,
      packed: firstFulfillment?.created_at,
      shipped: firstShipped?.shipped_at || fulfillmentMetadata(firstShipped)?.shipped_at,
      out_for_delivery: fulfillmentMetadata(outForDelivery)?.out_for_delivery_at ||
        outForDelivery?.out_for_delivery_at ||
        firstShipped?.shipped_at ||
        fulfillmentMetadata(firstShipped)?.shipped_at,
      delivered: lastDelivered?.delivered_at || fulfillmentMetadata(lastDelivered)?.delivered_at,
    },
  };
};

export const getFulfillmentProgress = (order) => {
  const derived = deriveTrackingState(order);
  if (derived.currentStatus !== 'confirmed' || Array.isArray(order?.fulfillments) && order.fulfillments.length > 0) {
    return {
      step: derived.currentStep,
      label: derived.label,
      fulfillmentStatus: derived.currentStatus,
      isDelivered: derived.isDelivered,
      isCancelled: derived.isCancelled,
    };
  }

  const fulfillmentStatus = String(order?.fulfillment_status || 'not_fulfilled').toLowerCase();
  const model = FULFILLMENT_PROGRESS[fulfillmentStatus] || FULFILLMENT_PROGRESS.not_fulfilled;
  const orderStatus = String(order?.status || '').toLowerCase();
  return {
    ...model,
    fulfillmentStatus,
    isDelivered: fulfillmentStatus === 'delivered',
    isCancelled: ['canceled', 'cancelled'].includes(fulfillmentStatus) ||
      ['canceled', 'cancelled'].includes(orderStatus),
  };
};

export const formatFulfillmentTimestamp = (value) => value
  ? new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  : null;

export const fulfillmentTrackingNumbers = (fulfillment) => [
  fulfillment?.metadata?.tracking_number,
  fulfillment?.metadata?.tracking_code,
  fulfillment?.tracking_number,
  fulfillment?.display?.tracking_number,
  fulfillment?.data?.tracking_number,
].filter((value) => value && value !== 'Tracking pending' && value !== 'Pending Assignment')
  .filter((value, index, values) => values.indexOf(value) === index);

export const fulfillmentTrackingUrl = (fulfillment) =>
  first(
    fulfillment?.metadata?.tracking_url,
    fulfillment?.tracking_url,
    fulfillment?.display?.tracking_url,
    fulfillment?.data?.tracking_url,
  ) || null;

export const fulfillmentCarrier = (fulfillment) =>
  first(
    fulfillment?.metadata?.carrier,
    fulfillment?.metadata?.provider_name,
    fulfillment?.carrier,
    fulfillment?.display?.carrier,
    fulfillment?.data?.carrier,
    fulfillmentProvider(fulfillment),
  );

export const fulfillmentWarehouse = (fulfillment) => {
  const raw = first(
    fulfillment?.metadata?.warehouse_name,
    fulfillment?.display?.warehouse_name,
    fulfillment?.location?.name,
    fulfillment?.stock_location?.name,
    fulfillment?.data?.warehouse_name,
  );

  if (raw && !String(raw).startsWith('sloc_')) {
    return raw;
  }

  return fulfillment?.location_id ? FALLBACK_WAREHOUSE.name : null;
};

export const fulfillmentWarehouseAddress = (fulfillment) =>
  first(
    fulfillment?.display?.warehouse_address,
    fulfillment?.metadata?.warehouse_address,
    fulfillment?.location?.address?.formatted,
    [
      fulfillment?.location?.address?.city,
      fulfillment?.location?.address?.province,
      fulfillment?.location?.address?.country_code === 'CA' ? 'Canada' : fulfillment?.location?.address?.country_code,
    ].filter(Boolean).join(', '),
    fulfillment?.stock_location?.address?.formatted,
    fulfillment?.data?.warehouse_address,
  ) || (fulfillment?.location_id ? FALLBACK_WAREHOUSE.address : null);

export const fulfillmentProvider = (fulfillment) =>
  fulfillment?.metadata?.provider_name ||
  fulfillment?.display?.provider_name ||
  fulfillment?.provider?.name ||
  PROVIDER_LABELS[String(fulfillment?.provider_id || '').toLowerCase()] ||
  (fulfillment?.provider_id ? titleCase(fulfillment.provider_id) : null);

export const orderTrackingSummary = (order) => {
  const firstFulfillment = Array.isArray(order?.fulfillments) ? order.fulfillments[0] : null;
  const summary = order?.tracking_summary || {};
  const trackingNumbers = firstFulfillment ? fulfillmentTrackingNumbers(firstFulfillment) : [];

  return {
    warehouse: summary.warehouse_name || fulfillmentWarehouse(firstFulfillment) || FALLBACK_WAREHOUSE.name,
    warehouseAddress: summary.warehouse_address || fulfillmentWarehouseAddress(firstFulfillment) || FALLBACK_WAREHOUSE.address,
    provider: summary.provider_name || fulfillmentProvider(firstFulfillment) || 'Organic Canada Delivery',
    trackingNumber: summary.tracking_number || trackingNumbers[0] || 'Tracking pending',
    trackingUrl: summary.tracking_url || fulfillmentTrackingUrl(firstFulfillment),
    carrier: summary.carrier || fulfillmentCarrier(firstFulfillment) || 'Organic Canada Delivery',
  };
};

export const deliveryPartner = (order) => {
  const partner = order?.metadata?.delivery_partner || order?.delivery_partner;
  if (!partner?.driver_name && !partner?.driver_phone && !partner?.driver_photo) return null;
  return {
    driver_name: partner.driver_name,
    driver_phone: partner.driver_phone,
    driver_photo: partner.driver_photo,
  };
};
