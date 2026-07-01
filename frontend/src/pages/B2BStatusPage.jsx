import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Building2, ChevronLeft, Clock, Loader2, ShieldOff } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import { b2bApi } from '../services/b2bApi';

const statusContent = {
  pending: {
    icon: Clock,
    tone: 'amber',
    title: 'Your B2B application is under admin review.',
    body: 'We received your company application. You can log back in any time to check approval status.',
  },
  rejected: {
    icon: AlertCircle,
    tone: 'red',
    title: 'Your B2B application was not approved.',
    body: 'Review the reason below, update your details, and resubmit your application.',
  },
  suspended: {
    icon: ShieldOff,
    tone: 'red',
    title: 'Your B2B account has been suspended.',
    body: 'Please contact support before placing wholesale orders.',
  },
};

const knownBlockedStatuses = ['pending', 'rejected', 'suspended'];

function currentStatus(pathname) {
  if (pathname.includes('/rejected')) return 'rejected';
  if (pathname.includes('/suspended')) return 'suspended';
  return 'pending';
}

export default function B2BStatusPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const expectedStatus = currentStatus(location.pathname);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const content = useMemo(() => statusContent[expectedStatus], [expectedStatus]);
  const Icon = content.icon;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await b2bApi.getCompany({ signal: controller.signal, forceRefresh: true });
        if (controller.signal.aborted) return;
        const c = res?.company ?? null;
        setCompany(c);

        if (!c) {
          navigate('/b2b/register-company', { replace: true });
        } else if (c.status === 'approved' || c.status === 'active') {
          navigate('/b2b/dashboard', { replace: true });
        } else if (knownBlockedStatuses.includes(c.status) && c.status !== expectedStatus) {
          navigate(`/b2b/${c.status}`, { replace: true });
        } else if (c.status !== expectedStatus) {
          navigate('/b2b/login', { replace: true });
        }
      } catch (error) {
        const isCanceled = error?.name === 'AbortError' || error?.code === 'ERR_CANCELED' || error?.message === 'canceled';
        if (!isCanceled) navigate('/b2b/login', { replace: true });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [expectedStatus, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-40 pb-20 container-custom flex items-center justify-center">
          <Loader2 size={40} className="animate-spin text-accent-primary" />
        </main>
      </div>
    );
  }

  const toneClasses = content.tone === 'amber'
    ? 'bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800/25'
    : 'bg-red-500/10 text-red-600 border-red-200 dark:border-red-800/25';

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <main className="pt-32 pb-20 container-custom">
        <div className="max-w-xl mx-auto bg-white dark:bg-slate-800 rounded-[2.5rem] p-10 shadow-premium border border-stone-100 dark:border-slate-700 text-center">
          <div className={`inline-flex p-6 rounded-full mb-6 ${toneClasses}`}>
            <Icon size={48} />
          </div>
          <h1 className="text-3xl font-black text-text-primary mb-3">{content.title}</h1>
          <p className="text-sm text-text-secondary font-medium leading-relaxed mb-8">{content.body}</p>

          {company && (
            <div className="rounded-2xl bg-stone-50 dark:bg-slate-900/50 p-5 text-left text-sm mb-8 space-y-3">
              <div className="flex justify-between gap-4">
                <span className="text-text-secondary font-medium">Company</span>
                <span className="font-black text-text-primary text-right">{company.company_name}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-text-secondary font-medium">Status</span>
                <span className="font-black text-text-primary capitalize">{company.status}</span>
              </div>
              {company.rejection_reason && (
                <div className="pt-3 border-t border-stone-200 dark:border-slate-700">
                  <span className="text-text-secondary font-medium block mb-1">Reason</span>
                  <span className="font-semibold text-text-primary">{company.rejection_reason}</span>
                </div>
              )}
              {company.admin_note && (
                <div className="pt-3 border-t border-stone-200 dark:border-slate-700">
                  <span className="text-text-secondary font-medium block mb-1">Admin Note</span>
                  <span className="font-semibold text-text-primary">{company.admin_note}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {expectedStatus === 'rejected' && (
              <Button size="lg" className="gap-2" onClick={() => navigate('/b2b/register-company')}>
                <Building2 size={18} /> Update Application
              </Button>
            )}
            <Button variant="secondary" size="lg" className="gap-2" onClick={() => navigate('/')}>
              <ChevronLeft size={18} /> Back Home
            </Button>
          </div>
        </div>
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
