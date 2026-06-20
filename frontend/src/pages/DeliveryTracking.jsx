import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Package, 
  Truck, 
  CheckCircle2, 
  MapPin, 
  Phone, 
  Star, 
  ArrowLeft,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import Button from '../components/common/Button';
import { fetchCustomerOrderById } from '../services/apiClient';
import LoadingSpinner from '../components/common/LoadingSpinner';
import useToast from '../hooks/useToast';

const DeliveryTracking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const data = await fetchCustomerOrderById(id);
        if (data && data.order) {
          setOrder(data.order);
        } else {
          throw new Error("Order data missing");
        }
      } catch (err) {
        if (err.response?.status === 401) {
          showToast("Please log in to view this order.", "error");
        } else {
          showToast("Failed to locate order. Please check the ID.", "error");
        }
        console.error("Order Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchOrder();
  }, [id, showToast]);

  if (loading) return <LoadingSpinner fullScreen label="Locating your harvest..." />;
  if (!order) return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-3xl font-black mb-4">Order Not Found</h1>
      <p className="text-text-secondary mb-8">We couldn't find the order details you're looking for.</p>
      <Button onClick={() => navigate('/orders')}>Back to Orders</Button>
    </div>
  );

  // Map Medusa status to tracking steps
  const getStatusStep = (status) => {
    switch (status) {
      case 'completed': return 3;
      case 'fulfilled': return 2;
      case 'pending': return 1;
      default: return 0;
    }
  };

  const currentStep = getStatusStep(order.status);

  const trackingSteps = [
    { title: 'Order Confirmed', time: new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), icon: <Package />, done: currentStep >= 0 },
    { title: 'Preparing Your Freshness', time: 'In Progress', icon: <Clock />, done: currentStep >= 1 },
    { title: 'Out for Delivery', time: 'Pending', icon: <Truck />, done: currentStep >= 2 },
    { title: 'Delivered', time: 'Goal', icon: <CheckCircle2 />, done: currentStep >= 3 },
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
                    <h1 className="text-3xl font-black mb-2">Tracking Order #{id?.slice(-8).toUpperCase() || 'EAT-4421'}</h1>
                    <p className="text-sm font-medium text-text-secondary">Expected delivery: Today at 12:30 PM</p>
                  </div>
                  <div className="px-4 py-2 rounded-full bg-accent-primary/10 text-accent-primary text-xs font-black uppercase tracking-widest">
                    Live Updates
                  </div>
                </div>

                {/* Progress Visual */}
                <div className="relative flex flex-col gap-10">
                  <div className="absolute left-[27px] top-4 bottom-4 w-1 bg-stone-100 dark:bg-slate-700 rounded-full">
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${(currentStep / (trackingSteps.length - 1)) * 100}%` }}
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
                        <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">{step.time}</p>
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
                      <ShieldCheck size={24} />
                    </div>
                    <h3 className="font-black">Order Security</h3>
                  </div>
                  <p className="text-sm text-text-secondary font-medium leading-relaxed">
                    This order is verified and covered by our Freshness Guarantee. If items are damaged, get 100% refund.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Driver Info & Actions */}
            <div className="flex flex-col gap-8">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 text-center">
                <div className="w-24 h-24 rounded-full bg-stone-100 dark:bg-slate-700 mx-auto mb-6 overflow-hidden border-4 border-white dark:border-slate-600 shadow-lg">
                  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop" className="w-full h-full object-cover" />
                </div>
                <h3 className="text-xl font-black mb-1">Marcus Wright</h3>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-4">Your Delivery Partner</p>
                <div className="flex items-center justify-center gap-1 mb-8">
                  <Star size={14} className="fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-black">4.9</span>
                  <span className="text-xs font-medium text-text-secondary">(2.4k Deliveries)</span>
                </div>
                
                <div className="flex flex-col gap-3">
                  <Button className="w-full gap-2">
                    <Phone size={18} /> Contact Marcus
                  </Button>
                  <Button variant="secondary" className="w-full">
                    Share Tracking
                  </Button>
                </div>
              </div>

              <div className="bg-accent-primary p-8 rounded-[2.5rem] text-white shadow-xl shadow-accent-primary/20 relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-xl font-black mb-2">Invite Friends</h3>
                  <p className="text-sm opacity-90 mb-6">Get $20 off your next organic basket when your friend places their first order.</p>
                  <button className="px-6 py-3 bg-white text-accent-primary rounded-2xl font-black text-sm hover:scale-105 transition-transform">
                    Share Link
                  </button>
                </div>
                <SparklesIcon className="absolute top-[-20px] right-[-20px] opacity-10 w-40 h-40" />
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

const SparklesIcon = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M19,6.5L17.5,3L16,6.5L12.5,8L16,9.5L17.5,13L19,9.5L22.5,8L19,6.5M19,17.5L17.5,14L16,17.5L12.5,19L16,20.5L17.5,24L19,20.5L22.5,19L19,17.5M9,13L11,8L9,3L7,8L2,10L7,12L9,17L11,12L16,10L11,8L9,13Z" />
  </svg>
);

export default DeliveryTracking;
