import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Printer, Receipt, CheckCircle, CreditCard, Shield } from 'lucide-react';
import Button from './Button';

const InvoiceModal = ({ order, onClose }) => {
  const printRef = useRef(null);

  if (!order) return null;

  const handlePrint = () => {
    const printContent = printRef.current?.innerHTML;
    const originalContent = document.body.innerHTML;

    // Create a simple printer-friendly popout or styles
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Eatsie Invoice - #${order.id.slice(-8).toUpperCase()}</title>
            <style>
              body { font-family: system-ui, sans-serif; color: #1c1917; padding: 40px; }
              .header { display: flex; justify-between; border-bottom: 2px solid #e7e5e4; padding-bottom: 20px; margin-bottom: 40px; }
              .logo { font-size: 24px; font-weight: 900; color: #16a34a; }
              .details { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
              th { text-align: left; padding: 12px; border-bottom: 2px solid #e7e5e4; font-size: 12px; text-transform: uppercase; color: #78716c; }
              td { padding: 12px; border-bottom: 1px solid #f5f5f4; font-size: 14px; }
              .totals { margin-left: auto; width: 300px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; }
              .total-row { display: flex; justify-content: space-between; }
              .grand-total { font-size: 18px; font-weight: 900; color: #16a34a; border-top: 2px solid #e7e5e4; padding-top: 10px; }
              .footer { text-align: center; font-size: 12px; color: #a8a29e; margin-top: 80px; }
            </style>
          </head>
          <body>
            ${printContent}
            <script>
              window.onload = function() { window.print(); window.close(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const getPromoCode = () => {
    // Look in order summary or metadata
    return order.metadata?.coupon_code || order.summary?.promotion_codes?.[0] || null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border border-stone-100 dark:border-slate-800 flex flex-col max-h-[90vh]"
      >
        {/* Header Actions */}
        <div className="p-6 border-b border-stone-100 dark:border-slate-800 flex justify-between items-center bg-stone-50 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-text-primary">
            <Receipt className="text-accent-primary" size={20} />
            <span className="font-black text-sm uppercase tracking-wider">Invoice Details</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer size={16} /> Print
            </Button>
            <button 
              onClick={onClose}
              className="p-2 text-text-secondary hover:bg-stone-150 dark:hover:bg-slate-800 rounded-full transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div className="flex-1 overflow-y-auto p-8 md:p-12" ref={printRef}>
          <div className="flex justify-between items-start border-b border-stone-100 dark:border-slate-800 pb-8 mb-8 flex-wrap gap-6">
            <div>
              <h1 className="text-3xl font-black text-green-600 dark:text-green-500 mb-1">Eatsie.</h1>
              <p className="text-xs text-text-secondary font-bold uppercase tracking-wider">Fresh Organic Harvests</p>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-black text-text-primary mb-1">INVOICE</h2>
              <p className="text-xs text-text-secondary font-semibold">Order #{order.id.slice(-8).toUpperCase()}</p>
              <p className="text-xs text-text-secondary font-semibold">Date: {new Date(order.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-10 text-sm">
            <div>
              <h3 className="font-black uppercase text-xs text-text-secondary tracking-widest mb-3">Customer Information</h3>
              <p className="font-bold text-text-primary">{order.shipping_address?.first_name || 'Guest'} {order.shipping_address?.last_name || 'Customer'}</p>
              <p className="text-text-secondary text-xs mt-0.5">{order.email}</p>
              {order.shipping_address?.phone && (
                <p className="text-text-secondary text-xs mt-0.5">{order.shipping_address.phone}</p>
              )}
            </div>
            <div>
              <h3 className="font-black uppercase text-xs text-text-secondary tracking-widest mb-3">Billing & Shipping Address</h3>
              <p className="font-medium text-text-primary">{order.shipping_address?.address_1 || 'Address Pending'}</p>
              <p className="text-text-secondary text-xs mt-0.5">{order.shipping_address?.city}, {order.shipping_address?.province || ''}</p>
              <p className="text-text-secondary text-xs mt-0.5">{order.shipping_address?.postal_code} {order.shipping_address?.country_code?.toUpperCase()}</p>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-sm mb-8">
            <thead>
              <tr className="border-b border-stone-100 dark:border-slate-800">
                <th className="py-3 text-left font-black text-xs text-text-secondary uppercase tracking-widest">Item description</th>
                <th className="py-3 text-center font-black text-xs text-text-secondary uppercase tracking-widest">Qty</th>
                <th className="py-3 text-right font-black text-xs text-text-secondary uppercase tracking-widest">Unit Price</th>
                <th className="py-3 text-right font-black text-xs text-text-secondary uppercase tracking-widest">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50 dark:divide-slate-800/50">
              {order.items?.map((item) => (
                <tr key={item.id} className="text-text-primary">
                  <td className="py-4">
                    <p className="font-bold">{item.title}</p>
                    {item.metadata?.is_subscription && (
                      <span className="inline-block mt-1 text-[10px] font-black uppercase text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded-full">
                        Subscription ({item.metadata.subscription_plan})
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-center font-semibold">{item.quantity}</td>
                  <td className="py-4 text-right font-semibold">${(item.unit_price / 100).toFixed(2)}</td>
                  <td className="py-4 text-right font-black">${((item.unit_price * item.quantity) / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals Breakdown */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 border-t border-stone-100 dark:border-slate-800 pt-8">
            <div className="flex flex-col gap-3 max-w-xs text-xs">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2 rounded-xl">
                <CheckCircle size={14} />
                <span className="font-bold">Payment Status: {order.payment_status || 'Paid'}</span>
              </div>
              <div className="flex items-center gap-2 text-text-secondary bg-stone-50 dark:bg-slate-800 px-3 py-2 rounded-xl">
                <CreditCard size={14} />
                <span className="font-bold uppercase tracking-wider">Method: {order.payment_collections?.[0]?.payments?.[0]?.provider_id?.toUpperCase() || 'STRIPE'}</span>
              </div>
            </div>

            <div className="w-full md:w-80 flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Subtotal</span>
                <span className="font-bold text-text-primary">${((order.subtotal || 0) / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Estimated Tax (5%)</span>
                <span className="font-bold text-text-primary">${((order.tax_total || 0) / 100).toFixed(2)}</span>
              </div>
              {order.discount_total > 0 && (
                <div className="flex justify-between text-accent-primary font-bold">
                  <span>Discount {getPromoCode() ? `(${getPromoCode()})` : ''}</span>
                  <span>-${((order.discount_total || 0) / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-stone-100 dark:border-slate-800 pt-3 mt-1">
                <span className="text-base font-black text-text-primary">Total Paid</span>
                <span className="text-xl font-black text-accent-primary">${((order.total || 0) / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-stone-100 dark:border-slate-800 mt-12 pt-8 text-center text-xs text-text-secondary">
            <p className="flex items-center justify-center gap-2 font-bold mb-2">
              <Shield size={14} className="text-green-500" /> Secure payment processed via Stripe
            </p>
            <p className="font-medium">Thank you for shopping at Eatsie! Your support helps local organic farmers.</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default InvoiceModal;
