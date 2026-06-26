import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Search,
  Clock,
  Shield,
  FileText,
  Copy,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Package,
  Loader2,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import Skeleton from '../components/common/Skeleton';
import apiClient from '../services/apiClient';
import useToast from '../hooks/useToast';
import { resolveMedusaImageUrl, PRODUCT_IMAGE_FALLBACK } from '../utils/medusaImage';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'available', label: 'Available' },
  { id: 'downloaded', label: 'Downloaded' },
  { id: 'expired', label: 'Expired' },
];

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIdx = 0;
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024;
    unitIdx++;
  }
  return `${size.toFixed(1)} ${units[unitIdx]}`;
};

export default function MyDownloads() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const fetchDownloads = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/store/customers/me/downloads');
      setDownloads(res.downloads || []);
    } catch (error) {
      if (error.response?.status !== 401) {
        console.error('[MyDownloads] Fetch error:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDownloads();
  }, []);

  const filteredDownloads = useMemo(() => {
    let result = [...downloads];

    // Filter by tab
    if (activeTab === 'available') {
      result = result.filter(d => !d.is_expired && d.remaining_downloads > 0);
    } else if (activeTab === 'downloaded') {
      result = result.filter(d => d.download_count > 0);
    } else if (activeTab === 'expired') {
      result = result.filter(d => d.is_expired || d.remaining_downloads <= 0);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.product_title?.toLowerCase().includes(q) ||
        d.file_name?.toLowerCase().includes(q) ||
        d.version?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [downloads, activeTab, searchQuery]);

  const handleDownload = async (download) => {
    if (download.is_expired || download.remaining_downloads <= 0) {
      showToast('This download is no longer available', 'error');
      return;
    }

    setDownloadingId(download.id);
    try {
      const token = localStorage.getItem('medusa_customer_token');
      const response = await fetch(`/store/downloads/${download.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Download failed (${response.status})`);
      }

      // Get filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
      const filename = filenameMatch ? filenameMatch[1] : download.file_name || 'download';

      // Create blob and trigger download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Download started!', 'success');
      fetchDownloads(); // Refresh to update counts
    } catch (error) {
      const msg = error.message || 'Download failed';
      showToast(msg, 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCopyLicense = (licenseKey) => {
    navigator.clipboard.writeText(licenseKey);
    showToast('License key copied!', 'success');
  };

  const handleRegenerate = async (download) => {
    try {
      const res = await apiClient.post(`/store/downloads/${download.id}/regenerate`);
      if (res?.remaining_downloads) {
        showToast('Download link refreshed!', 'success');
        fetchDownloads();
      }
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to regenerate', 'error');
    }
  };

  const getTabCount = (tabId) => {
    if (tabId === 'all') return downloads.length;
    return downloads.filter(d => {
      if (tabId === 'available') return !d.is_expired && d.remaining_downloads > 0;
      if (tabId === 'downloaded') return d.download_count > 0;
      if (tabId === 'expired') return d.is_expired || d.remaining_downloads <= 0;
      return true;
    }).length;
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />

      <main className="pt-32 pb-20 container-custom">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4">My Downloads.</h1>
            <p className="text-text-secondary max-w-lg">
              Access and manage all your purchased digital products in one place.
            </p>
          </div>
          <button
            onClick={fetchDownloads}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 
                     border border-stone-100 dark:border-slate-700 text-xs font-black uppercase 
                     tracking-wider hover:border-accent-primary transition-all"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/20'
                  : 'bg-white dark:bg-slate-800 text-text-secondary border border-stone-100 dark:border-slate-700 hover:border-accent-primary/50'
              }`}
            >
              {tab.label}
              <span className="ml-2 opacity-60">({getTabCount(tab.id)})</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
          <input
            type="text"
            placeholder="Search downloads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-slate-800 border-2 border-stone-100 dark:border-slate-700 
                     rounded-2xl py-3.5 pl-12 pr-6 outline-none focus:border-accent-primary 
                     transition-all text-sm font-bold"
          />
        </div>

        {/* Downloads List */}
        {loading ? (
          <div className="flex flex-col gap-6">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-[2rem]" />
            ))}
          </div>
        ) : filteredDownloads.length === 0 ? (
          <div className="py-20 text-center">
            <div className="inline-flex p-8 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-400 dark:text-slate-600 mb-8">
              <Download size={48} />
            </div>
            <h2 className="text-3xl font-black mb-4">
              {searchQuery ? 'No matching downloads' : 'No downloads yet'}
            </h2>
            <p className="text-text-secondary mb-10 max-w-md mx-auto">
              {searchQuery
                ? 'Try adjusting your search or filters.'
                : 'Your purchased digital products will appear here. Browse our digital collection to get started.'}
            </p>
            {!searchQuery && (
              <Button size="lg" onClick={() => navigate('/listing')}>
                Browse Products
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <AnimatePresence>
              {filteredDownloads.map((download, i) => {
                const isDownloadable = !download.is_expired && download.remaining_downloads > 0;
                return (
                  <motion.div
                    key={download.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium 
                             border border-stone-100 dark:border-slate-700 overflow-hidden"
                  >
                    <div className="p-6 md:p-8">
                      <div className="flex flex-col md:flex-row gap-6">
                        {/* Product Thumbnail */}
                        <div className="w-full md:w-24 h-24 rounded-2xl overflow-hidden bg-stone-50 dark:bg-slate-900 shrink-0">
                          <img
                            src={resolveMedusaImageUrl(download.product_thumbnail)}
                            alt={download.product_title}
                            className="w-full h-full object-cover"
                            onError={(e) => e.target.src = PRODUCT_IMAGE_FALLBACK}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-lg font-black text-text-primary truncate">
                              {download.product_title}
                            </h3>
                            {download.version && (
                              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/20 
                                           text-blue-600 dark:text-blue-400 text-[9px] font-black uppercase tracking-wider">
                                v{download.version}
                              </span>
                            )}
                            {download.is_expired && (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/20 
                                           text-red-600 dark:text-red-400 text-[9px] font-black uppercase tracking-wider">
                                Expired
                              </span>
                            )}
                            {!isDownloadable && !download.is_expired && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 
                                           text-amber-600 dark:text-amber-400 text-[9px] font-black uppercase tracking-wider">
                                Exhausted
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-4 md:gap-6 text-xs font-medium text-text-secondary mb-4">
                            {download.file_name && (
                              <span className="flex items-center gap-1">
                                <FileText size={12} />
                                {download.file_name}
                              </span>
                            )}
                            {download.file_size > 0 && (
                              <span>{formatFileSize(download.file_size)}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Download size={12} />
                              {download.download_count} download{download.download_count !== 1 ? 's' : ''}
                            </span>
                            {download.expires_at && (
                              <span className="flex items-center gap-1">
                                <Clock size={12} />
                                Expires {new Date(download.expires_at).toLocaleDateString()}
                              </span>
                            )}
                            <span className="font-bold text-accent-primary">
                              {download.remaining_downloads} remaining
                            </span>
                          </div>

                          {/* License Key */}
                          {download.license_key && (
                            <div className="flex items-center gap-2 mb-4">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl 
                                          bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                                <Shield size={12} className="text-emerald-500" />
                                <code className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                                  {download.license_key}
                                </code>
                                <button
                                  onClick={() => handleCopyLicense(download.license_key)}
                                  className="p-0.5 hover:text-emerald-600 transition-colors"
                                >
                                  <Copy size={12} />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDownload(download)}
                              disabled={!isDownloadable || downloadingId === download.id}
                              className="flex items-center gap-2 px-6 py-3 rounded-xl 
                                       bg-accent-primary hover:bg-accent-secondary disabled:bg-gray-200 
                                       dark:disabled:bg-slate-700 text-white disabled:text-gray-400
                                       font-black text-xs uppercase tracking-wider transition-all active:scale-[0.98]"
                            >
                              {downloadingId === download.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Download size={14} />
                              )}
                              Download
                            </button>

                            {!isDownloadable && !download.is_expired && (
                              <button
                                onClick={() => handleRegenerate(download)}
                                className="flex items-center gap-2 px-4 py-3 rounded-xl
                                         bg-amber-500 hover:bg-amber-600 text-white font-black text-xs 
                                         uppercase tracking-wider transition-all active:scale-[0.98]"
                              >
                                <RefreshCw size={14} />
                                New Link
                              </button>
                            )}

                            <button
                              onClick={() => navigate(`/orders`)}
                              className="flex items-center gap-2 px-4 py-3 rounded-xl
                                       bg-stone-100 dark:bg-slate-700 text-text-secondary hover:text-text-primary
                                       font-black text-xs uppercase tracking-wider transition-all"
                            >
                              View Order
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
}
