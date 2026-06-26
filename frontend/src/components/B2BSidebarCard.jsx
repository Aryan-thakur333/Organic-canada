import React, { useState, useEffect } from 'react';
import { Building2, ChevronRight, Send, FileText, Loader2, Settings } from 'lucide-react';
import { b2bApi } from '../services/b2bApi';

/**
 * Sidebar card showing the user's B2B company status (or a prompt to register).
 * Inline component meant for use inside Profile.jsx sidebar.
 */
export default function B2BSidebarCard({ navigate }) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await b2bApi.getCompany();
        setCompany(res?.company ?? null);
      } catch {
        setCompany(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-premium border border-stone-100 dark:border-slate-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-slate-700 animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-24 bg-stone-100 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-3 w-16 bg-stone-50 dark:bg-slate-800 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (company) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-premium border border-stone-100 dark:border-slate-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-accent-primary/10 text-accent-primary">
            <Building2 size={16} />
          </div>
          <h4 className="text-sm font-black uppercase tracking-widest flex-1">B2B Wholesale</h4>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
            company.status === 'active'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/25'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/25'
          }`}>
            {company.status}
          </span>
        </div>
        <p className="text-xl font-black text-text-primary mb-1 truncate">{company.company_name}</p>
        <p className="text-xs text-text-secondary font-medium mb-4">
          {company.tax_id ? `Tax ID: ${company.tax_id}` : 'No tax ID'}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate('/b2b')}
            className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-primary text-sm font-bold transition-colors"
          >
            <span className="flex items-center gap-3"><Settings size={16} /> Manage Company</span>
            <ChevronRight size={16} className="text-stone-300" />
          </button>
          <button
            onClick={() => navigate('/b2b/request-quote')}
            className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-primary text-sm font-bold transition-colors"
          >
            <span className="flex items-center gap-3"><Send size={16} /> New Quote</span>
            <ChevronRight size={16} className="text-stone-300" />
          </button>
          <button
            onClick={() => navigate('/account/b2b-quotes')}
            className="flex items-center justify-between p-3 rounded-2xl hover:bg-stone-50 dark:hover:bg-slate-700 text-text-primary text-sm font-bold transition-colors"
          >
            <span className="flex items-center gap-3"><FileText size={16} /> Quote History</span>
            <ChevronRight size={16} className="text-stone-300" />
          </button>
        </div>
      </div>
    );
  }

  // No company — prompt to register
  return (
    <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 shadow-premium border border-stone-100 dark:border-slate-700">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-gradient-to-br from-accent-primary to-blue-500 text-white shadow-lg shadow-accent-primary/20">
          <Building2 size={16} />
        </div>
        <h4 className="text-sm font-black uppercase tracking-widest">B2B Wholesale</h4>
      </div>
      <p className="text-xs text-text-secondary font-medium mb-4 leading-relaxed">
        Register your company to access wholesale pricing, bulk ordering, and dedicated account management.
      </p>
      <button
        onClick={() => navigate('/b2b/register-company')}
        className="w-full flex items-center justify-between p-3 rounded-2xl bg-accent-primary/5 text-accent-primary text-sm font-bold hover:bg-accent-primary/10 transition-colors"
      >
        <span className="flex items-center gap-3"><Building2 size={16} /> Register Company</span>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
