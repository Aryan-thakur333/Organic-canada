import React from 'react';
import { ShieldCheck } from 'lucide-react';
import useB2BCompany from '../../hooks/useB2BCompany';

/**
 * B2BPriceBadge — Shows a "B2B Wholesale Price" indicator when the logged-in
 * customer has an approved/active B2B company with wholesale pricing.
 *
 * Usage:
 *   <B2BPriceBadge />   // auto-detects company status via useB2BCompany
 *
 * When the customer is not logged in, doesn't have a company, or the company
 * is not approved, this component renders nothing (null).
 */
export default function B2BPriceBadge({ compact = false }) {
  const { company, isLoading } = useB2BCompany();

  // Don't render while loading or if no approved company
  if (isLoading) return null;
  if (!company) return null;

  const isB2B = company.status === 'approved' || company.status === 'active';
  if (!isB2B) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/25 text-[9px] font-black uppercase tracking-wider">
        <ShieldCheck size={10} />
        B2B
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/25 text-[10px] font-black uppercase tracking-wider">
      <ShieldCheck size={12} />
      B2B Wholesale Price
    </span>
  );
}
