import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Ticket, ToggleLeft, ToggleRight, RefreshCw, Tag, AlertCircle, Copy, Check } from 'lucide-react';
import Button from '../common/Button';
import apiClient from '../../services/apiClient';
import useToast from '../../hooks/useToast';

const AdminCouponsView = () => {
  const { showToast } = useToast();
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [copiedCode, setCopiedCode] = useState('');

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/coupons');
      setPromotions(res.promotions || []);
    } catch (err) {
      showToast('Failed to load promotions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPromotions(); }, []);

  const handleToggle = async (promo) => {
    const newStatus = promo.status === 'active' ? 'draft' : 'active';
    setTogglingId(promo.id);
    try {
      await apiClient.patch(`/admin/coupons/${promo.id}`, { status: newStatus });
      setPromotions(prev => prev.map(p => p.id === promo.id ? { ...p, status: newStatus } : p));
      showToast(`Coupon ${newStatus === 'active' ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      showToast('Failed to update coupon', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 1800);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black text-text-primary">Coupons.</h2>
          <p className="text-sm text-text-secondary mt-1">Manage active promotions. Enable, disable, and monitor usage.</p>
        </div>
        <button
          onClick={fetchPromotions}
          className="flex items-center gap-2 text-sm font-bold text-accent-primary hover:text-accent-secondary transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 overflow-hidden">
        <div className="p-8 border-b border-stone-50 dark:border-slate-700 flex items-center gap-3">
          <Ticket className="text-accent-primary" size={22} />
          <span className="text-xl font-black">All Promotions ({promotions.length})</span>
        </div>

        {loading ? (
          <div className="p-8 flex flex-col gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-stone-50 dark:bg-slate-900 rounded-2xl animate-pulse" />)}
          </div>
        ) : promotions.length === 0 ? (
          <div className="py-20 text-center text-text-secondary">
            <AlertCircle className="mx-auto mb-4 opacity-30" size={48} />
            <p className="font-bold">No promotions found. Seed them via <code className="text-accent-primary">POST /store/promotions</code>.</p>
            <Button className="mt-6" size="sm" onClick={async () => {
              try {
                await apiClient.post('/store/promotions');
                fetchPromotions();
                showToast('Default promotions seeded!', 'success');
              } catch {
                showToast('Seeding failed', 'error');
              }
            }}>
              Seed Default Coupons
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-stone-50 dark:bg-slate-900/50">
                <tr>
                  {['Code', 'Type', 'Value', 'Used', 'Limit', 'Status', 'Toggle'].map(h => (
                    <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50 dark:divide-slate-700/50">
                {promotions.map((promo, i) => (
                  <motion.tr
                    key={promo.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="hover:bg-stone-50/50 dark:hover:bg-slate-900/20 transition-colors group"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-stone-50 dark:bg-slate-900 px-4 py-2 rounded-xl">
                          <Tag size={13} className="text-accent-primary" />
                          <span className="font-black text-sm tracking-wide text-text-primary">{promo.code}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(promo.code)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-text-secondary hover:text-accent-primary transition-all"
                        >
                          {copiedCode === promo.code ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-xs font-bold uppercase text-text-secondary bg-stone-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg">
                        {promo.application_method?.type || 'percentage'}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="font-black text-accent-primary">
                        {promo.application_method?.type === 'percentage'
                          ? `${promo.application_method?.value || 0}%`
                          : `$${promo.application_method?.value || 0}`}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-bold text-text-primary">{promo.used ?? 0}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-bold text-text-secondary">{promo.limit ?? '∞'}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        promo.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                          : 'bg-stone-100 text-stone-500 dark:bg-slate-900 dark:text-slate-500'
                      }`}>
                        {promo.status}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <button
                        disabled={togglingId === promo.id}
                        onClick={() => handleToggle(promo)}
                        className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-40"
                      >
                        {promo.status === 'active' ? (
                          <><ToggleRight size={24} className="text-green-500" /> <span className="text-green-600">Enabled</span></>
                        ) : (
                          <><ToggleLeft size={24} className="text-stone-400" /> <span className="text-stone-500">Disabled</span></>
                        )}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminCouponsView;
