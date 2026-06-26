import React, { useState, useEffect, useRef } from 'react';
import { motion as Motion } from 'framer-motion';
import { 
  Package, 
  Truck, 
  CheckCircle2, 
  MapPin, 
  ArrowLeft,
  Clock,
  Warehouse,
  Barcode,
  Phone,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import Button from '../components/common/Button';
import { fetchCustomerOrderById, getCachedCustomerOrderById } from '../services/apiClient';
import LoadingSpinner from '../components/common/LoadingSpinner';
import useToast from '../hooks/useToast';
import {
  formatFulfillmentTimestamp,
  deliveryPartner,
  fulfillmentProvider,
  fulfillmentTrackingNumbers,
  fulfillmentTrackingUrl,
  fulfillmentWarehouse,
  fulfillmentWarehouseAddress,
  deriveTrackingState,
  orderTrackingSummary,
} from '../utils/deliveryTracking';

const DeliveryTracking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const showToastRef = useRef(showToast);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    if (!id) return undefined;

    const controller = new AbortController();
    let pollTimer;
    let pollingStopped = false;
    const cached = getCachedCustomerOrderById(id);
    if (cached?.order) {
      setOrder(cached.order);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setErrorMessage('');

    const stopStatuses = new Set(['delivered', 'cancelled', 'canceled', 'completed']);
    const shouldStopPolling = (nextOrder) =>
      stopStatuses.has(String(nextOrder?.status || '').toLowerCase()) ||
      stopStatuses.has(String(nextOrder?.fulfillment_status || '').toLowerCase());

    const scheduleNextPoll = () => {
      if (controller.signal.aborted || pollingStopped) return;
      pollTimer = window.setTimeout(fetchOrder, 30_000);
    };

    const fetchOrder = async () => {
      try {
        const data = await fetchCustomerOrderById(id, {
          signal: controller.signal,
          forceRefresh: true,
        });
        if (controller.signal.aborted) return;
        if (data && data.order) {
          setOrder(data.order);
          setErrorMessage('');
          if (shouldStopPolling(data.order)) {
            pollingStopped = true;
          } else {
            scheduleNextPoll();
          }
        } else {
          throw new Error("Order data missing");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const status = err.response?.status;
        if ([401, 403, 404, 429].includes(status)) {
          pollingStopped = true;
        }
        if (status === 429) {
          setErrorMessage('Too many requests, please wait');
          showToastRef.current('Too many requests, please wait', 'error');
        } else if (status === 401 || status === 403) {
          setErrorMessage('Please log in to view this order.');
          showToastRef.current('Please log in to view this order.', 'error');
        } else if (status === 404) {
          setErrorMessage('Order not found. Please check the ID.');
          showToastRef.current('Order not found. Please check the ID.', 'error');
        } else {
          setErrorMessage('Failed to load order tracking.');
          showToastRef.current('Failed to load order tracking.', 'error');
          scheduleNextPoll();
        }
        console.error("Order Fetch Error:", err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchOrder();

    return () => {
      controller.abort();
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [id]);

  if (loading) return <LoadingSpinner fullScreen label="Locating your harvest..." />;
  if (!order) return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-3xl font-black mb-4">Order Not Found</h1>
      <p className="text-text-secondary mb-8">{errorMessage || "We couldn't find the order details you're looking for."}</p>
      <Button onClick={() => navigate('/orders')}>Back to Orders</Button>
    </div>
  );

  const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
  const trackingState = deriveTrackingState(order);
  const { currentStep, label, isDelivered, isCancelled, timestamps } = trackingState;
  const summary = orderTrackingSummary(order);
  const partner = deliveryPartner(order);

  const trackingSteps = [
    { title: 'Order Confirmed', timestamp: timestamps.confirmed, icon: <Package />, done: currentStep >= 0 },
    { title: 'Preparing Order', timestamp: timestamps.preparing, icon: <Clock />, done: currentStep >= 1 },
    { title: 'Packed', timestamp: timestamps.packed, icon: <Warehouse />, done: currentStep >= 2 },
    { title: 'Shipped', timestamp: timestamps.shipped, icon: <Truck />, done: currentStep >= 3 },
    { title: 'Out For Delivery', timestamp: timestamps.out_for_delivery, icon: <Truck />, done: currentStep >= 4 },
    { title: 'Delivered', timestamp: timestamps.delivered, icon: <CheckCircle2 />, done: currentStep >= 5 },
  ];

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="max-w-5xl mx-auto">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-accent-primary mb-8 transition-colors"
          >
            <ArrowLeft size={18} /> Back to Order
          </button>

          <div className="grid lg:grid-cols-3 gap-12">
            {/* Left Column: Map and Tracking */}
            <div className="lg:col-span-2 flex flex-col gap-8">
              <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-10 shadow-premium border border-stone-100 dark:border-slate-700">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                  <div>
                    <h1 className="text-3xl font-black mb-2">Tracking Order #{order.display_id || id?.slice(-8).toUpperCase()}</h1>
                    <p className="text-sm font-medium text-text-secondary">
                      Medusa order status: {String(order.status || 'unknown').replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest ${
                    isDelivered
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : isCancelled
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        : 'bg-accent-primary/10 text-accent-primary'
                  }`}>
                    {isCancelled ? 'Cancelled' : label}
                  </div>
                </div>

                {/* Progress Visual */}
                <div className="relative flex flex-col gap-10">
                  <div className="absolute left-[27px] top-4 bottom-4 w-1 bg-stone-100 dark:bg-slate-700 rounded-full">
                    <Motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${(Math.min(currentStep, trackingSteps.length - 1) / (trackingSteps.length - 1)) * 100}%` }}
                      className="w-full bg-accent-primary rounded-full shadow-[0_0_10px_rgba(139,69,19,0.5)]"
                    />
                  </div>

                  {trackingSteps.map((step, i) => (
                    <div key={i} className="flex gap-8 relative z-10">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                        step.done ? 'bg-accent-primary text-white scale-110 shadow-lg' : 'bg-stone-50 dark:bg-slate-700 text-stone-300'
                      }`}>
                        {step.icon}
                      </div>
                      <div className="flex flex-col justify-center">
                        <h4 className={`font-black ${step.done ? 'text-text-primary' : 'text-text-secondary'}`}>{step.title}</h4>
                        {step.timestamp && (
                          <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                            {formatFulfillmentTimestamp(step.timestamp)}
                          </p>
                        )}
                      </div>
                      {step.done && (
                        <div className="ml-auto flex items-center">
                          <CheckCircle2 size={20} className="text-green-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Details */}
              <div className="grid sm:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-sm border border-stone-100 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-2xl bg-stone-50 dark:bg-slate-900 text-accent-primary">
                      <MapPin size={24} />
                    </div>
                    <h3 className="font-black">Delivery Address</h3>
                  </div>
                  <p className="text-sm text-text-secondary font-medium leading-relaxed">
                    {order.shipping_address?.address_1 || "Pickup from Farm"}<br />
                    {order.shipping_address?.city}, {order.shipping_address?.province}<br />
                    {order.shipping_address?.postal_code}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-sm border border-stone-100 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-2xl bg-stone-50 dark:bg-slate-900 text-accent-primary">
                      <CheckCircle2 size={24} />
                    </div>
                    <h3 className="font-black">Fulfillment Status</h3>
                  </div>
                  <p className={`text-sm font-black uppercase tracking-wider ${isDelivered ? 'text-green-600' : 'text-text-secondary'}`}>
                    {label}
                  </p>
                  {isDelivered && timestamps.delivered && (
                    <p className="text-sm text-text-secondary mt-2">Delivered {formatFulfillmentTimestamp(timestamps.delivered)}</p>
                  )}
                </div>
              </div>

              {partner && (
                <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-sm border border-stone-100 dark:border-slate-700">
                  <div className="flex items-center gap-4">
                    {partner.driver_photo && (
                      <img
                        src={partner.driver_photo}
                        alt={partner.driver_name || 'Delivery partner'}
                        className="w-14 h-14 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <h3 className="font-black">Delivery Partner</h3>
                      {partner.driver_name && <p className="text-sm font-semibold text-text-primary">{partner.driver_name}</p>}
                      {partner.driver_phone && (
                        <p className="text-sm text-text-secondary flex items-center gap-2 mt-1">
                          <Phone size={14} /> {partner.driver_phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Medusa Fulfillment Details */}
            <div className="flex flex-col gap-8">
              {fulfillments.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700">
                  <h3 className="text-xl font-black mb-2">Fulfillment Details</h3>
                  <p className="text-sm text-text-secondary">No fulfillment has been created for this order.</p>
                </div>
              ) : fulfillments.map((fulfillment, index) => {
                const trackingNumbers = fulfillmentTrackingNumbers(fulfillment);
                const warehouse = fulfillmentWarehouse(fulfillment);
                const warehouseAddress = fulfillmentWarehouseAddress(fulfillment);
                const provider = fulfillmentProvider(fulfillment);
                const trackingUrl = fulfillmentTrackingUrl(fulfillment);
                return (
                  <div key={fulfillment.id || index} className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700">
                    <h3 className="text-xl font-black mb-6">Fulfillment {index + 1}</h3>
                    <dl className="space-y-5 text-sm">
                      <DetailRow
                        icon={<Warehouse size={18} />}
                        label="Warehouse"
                        value={warehouse || summary.warehouse}
                        subValue={warehouseAddress || summary.warehouseAddress}
                      />
                      <DetailRow icon={<Truck size={18} />} label="Provider" value={provider || summary.provider} />
                      <DetailRow icon={<Barcode size={18} />} label="Tracking Number" value={trackingNumbers.join(', ') || summary.trackingNumber || 'Pending Assignment'} />
                      {trackingUrl && (
                        <DetailRow
                          icon={<Truck size={18} />}
                          label="Track Package"
                          value={<a href={trackingUrl} target="_blank" rel="noreferrer" className="text-accent-primary font-black hover:underline">Track Shipment</a>}
                        />
                      )}
                      <DetailRow icon={<Truck size={18} />} label="Shipped" value={formatFulfillmentTimestamp(fulfillment.shipped_at) || 'Not shipped'} />
                      <DetailRow
                        icon={<CheckCircle2 size={18} />}
                        label="Delivered"
                        value={formatFulfillmentTimestamp(fulfillment.delivered_at) || 'Not delivered'}
                        success={Boolean(fulfillment.delivered_at)}
                      />
                    </dl>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

const DetailRow = ({ icon, label, value, subValue = null, success = false }) => (
  <div className="flex gap-3">
    <div className={success ? 'text-green-600' : 'text-accent-primary'}>{icon}</div>
    <div>
      <dt className="text-xs font-black uppercase tracking-wider text-text-secondary">{label}</dt>
      <dd className={`mt-1 break-words ${success ? 'font-black text-green-600' : 'font-medium text-text-primary'}`}>{value}</dd>
      {subValue && <dd className="mt-1 text-xs font-medium text-text-secondary">{subValue}</dd>}
    </div>
  </div>
);

export default DeliveryTracking;
