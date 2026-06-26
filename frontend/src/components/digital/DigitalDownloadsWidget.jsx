import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Shield,
  Clock,
  FileDown,
  Copy,
  FileText,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCheck,
  Loader2,
} from 'lucide-react';
import apiClient from '../../services/apiClient';
import useToast from '../../hooks/useToast';

/**
 * DigitalDownloadsWidget
 *
 * Displays digital download info for a purchased product in an order.
 * Shows file name, version, remaining downloads, expiry, license key,
 * and download/regenerate buttons.
 *
 * @param {object} props
 * @param {string} props.orderId - The order ID
 * @param {object} props.item - The line item from the order (with metadata)
 * @param {object} props.downloadRecord - Pre-fetched download record (optional)
 */
export default function DigitalDownloadsWidget({ orderId, item, downloadRecord: initialRecord }) {
  const { showToast } = useToast();
  const [downloadRecord, setDownloadRecord] = useState(initialRecord || null);
  const [loading, setLoading] = useState(!initialRecord);
  const [downloading, setDownloading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // Extract digital info from item metadata
  const metadata = item?.metadata || {};
  const isDigital = 
    metadata?.is_digital === true || 
    metadata?.is_digital === 'true' || 
    initialRecord?.is_digital ||
    false;

  const version = downloadRecord?.version || metadata?.version || '1.0.0';
  const remaining = downloadRecord?.remaining_downloads ?? metadata?.remaining_downloads ?? 0;
  const expiresAt = downloadRecord?.expires_at || metadata?.expires_at || null;
  const licenseKey = downloadRecord?.license_key || metadata?.license_key || null;
  const downloadCount = downloadRecord?.download_count || 0;
  const fileName = downloadRecord?.file_name || metadata?.download_file_name || 'Digital Download';
  const fileSize = downloadRecord?.file_size || metadata?.file_size || 0;

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
  const isExhausted = remaining <= 0;

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

  const handleDownload = async () => {
    if (isExpired || isExhausted) {
      showToast('This download is no longer available', 'error');
      return;
    }

    setDownloading(true);
    try {
      let downloadUrl = '';

      // If we have a download record with an ID (dld_xxx), use it
      if (downloadRecord?.id) {
        downloadUrl = `/store/downloads/${downloadRecord.id}`;
      } else if (metadata?.download_assets?.length > 0) {
        // Fallback: use asset ID with order_id
        const assetId = metadata.download_assets[0].id || '';
        downloadUrl = `/store/downloads/${assetId}?order_id=${orderId}`;
      } else if (metadata?.storage_key) {
        // Direct download from product metadata
        downloadUrl = `/store/downloads/asset?order_id=${orderId}&file=${encodeURIComponent(metadata.storage_key)}`;
      } else {
        showToast('No download file available. Contact support.', 'error');
        setDownloading(false);
        return;
      }

      // Trigger file download via fetch + blob
      const token = localStorage.getItem('medusa_customer_token');
      const response = await fetch(downloadUrl, {
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
      const filename = filenameMatch ? filenameMatch[1] : metadata?.file_name || 'download';

      // Get remaining downloads from header
      const remainingHeader = response.headers.get('X-Remaining-Downloads');
      const remainingCount = remainingHeader ? parseInt(remainingHeader, 10) : null;

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

      // Update local state
      setDownloadRecord(prev => ({
        ...prev,
        download_count: (prev?.download_count || 0) + 1,
        remaining_downloads: remainingCount !== null ? remainingCount : Math.max(0, (prev?.remaining_downloads || 0) - 1),
      }));
      showToast('Download started!', 'success');
    } catch (error) {
      const msg = error.message || 'Download failed. Please try again.';
      showToast(msg, 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyLicense = () => {
    if (licenseKey) {
      navigator.clipboard.writeText(licenseKey);
      showToast('License key copied to clipboard!', 'success');
    }
  };

  const handleRegenerate = async () => {
    if (!downloadRecord?.id) {
      showToast('Cannot regenerate this download.', 'error');
      return;
    }

    setRegenerating(true);
    try {
      const res = await apiClient.post(`/store/downloads/${downloadRecord.id}/regenerate`);
      if (res?.remaining_downloads) {
        setDownloadRecord(prev => ({
          ...prev,
          remaining_downloads: res.remaining_downloads,
          download_count: 0,
          last_downloaded_at: null,
        }));
        showToast('Download link refreshed!', 'success');
      }
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to regenerate.';
      showToast(msg, 'error');
    } finally {
      setRegenerating(false);
    }
  };

  if (!isDigital) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 
                 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-5 mt-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
          <Download size={18} />
        </div>
        <div>
          <h4 className="text-sm font-black text-blue-800 dark:text-blue-300">
            Digital Download
          </h4>
          {version && (
            <p className="text-[10px] font-bold text-blue-500/70 dark:text-blue-400/60">
              v{version}
            </p>
          )}
        </div>
        {remaining > 0 && !isExpired && (
          <span className="ml-auto px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 
                         text-[9px] font-black uppercase tracking-wider border border-blue-500/20">
            {remaining} download{remaining !== 1 ? 's' : ''} left
          </span>
        )}
      </div>

      {/* Status warnings */}
      {isExpired && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
            Download expired on {new Date(expiresAt).toLocaleDateString()}
          </span>
        </div>
      )}

      {isExhausted && !isExpired && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
          <AlertCircle size={14} className="text-amber-500 shrink-0" />
          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
            Download limit reached. Request a new link below.
          </span>
        </div>
      )}

      {/* File Info */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {fileName && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/40">
            <FileText size={14} className="text-blue-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                File
              </p>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">
                {fileName}
              </p>
            </div>
          </div>
        )}
        {fileSize > 0 && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/40">
            <FileDown size={14} className="text-blue-500 shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Size
              </p>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                {formatFileSize(fileSize)}
              </p>
            </div>
          </div>
        )}
        {expiresAt && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/40">
            <Clock size={14} className="text-blue-500 shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Expires
              </p>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                {new Date(expiresAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        )}
        {downloadCount > 0 && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/40">
            <Download size={14} className="text-blue-500 shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Downloaded
              </p>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                {downloadCount} time{downloadCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* License Key */}
      {licenseKey && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-white/60 dark:bg-slate-900/40 border border-blue-100 dark:border-blue-900/20">
          <Shield size={14} className="text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-0.5">
              License Key
            </p>
            <code className="text-xs font-mono font-bold text-gray-800 dark:text-gray-200 break-all">
              {licenseKey}
            </code>
          </div>
          <button
            onClick={handleCopyLicense}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-emerald-50 
                     text-gray-500 hover:text-emerald-500 transition-all shrink-0"
            title="Copy License Key"
          >
            <Copy size={14} />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={downloading || isExpired || isExhausted}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl 
                   bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-slate-700
                   text-white disabled:text-gray-500 font-black text-xs uppercase tracking-wider
                   transition-all active:scale-[0.98]"
        >
          {downloading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {downloading ? 'Preparing...' : 'Download'}
        </button>

        {isExhausted && !isExpired && (
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                     bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300
                     text-white disabled:text-gray-500 font-black text-xs uppercase tracking-wider
                     transition-all active:scale-[0.98]"
          >
            {regenerating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            New Link
          </button>
        )}

        {licenseKey && (
          <button
            onClick={handleCopyLicense}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                     bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs 
                     uppercase tracking-wider transition-all active:scale-[0.98]"
          >
            <Copy size={14} />
            License
          </button>
        )}
      </div>
    </motion.div>
  );
}
