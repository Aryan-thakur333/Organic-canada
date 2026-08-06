import apiClient from './apiClient';

/**
 * Digital Downloads API Service
 *
 * All calls go through centralized apiClient which automatically attaches:
 * - x-publishable-api-key header
 * - Authorization: Bearer <customer_token> header
 * - Correct backend base URL (http://localhost:9000)
 */
export const digitalDownloadsApi = {
  /** GET /store/customers/me/downloads — list all customer downloads */
  getMyDownloads() {
    return apiClient.get('/store/customers/me/downloads');
  },

  /** GET /store/orders/:orderId/downloads — get downloads for a specific order */
  getOrderDownloads(orderId) {
    if (!orderId) {
      return Promise.reject(new Error("orderId is required"));
    }
    return apiClient.get(`/store/orders/${encodeURIComponent(orderId)}/downloads`);
  },

  /**
   * GET /store/downloads/generate-link/:variantId
   * Legacy variant-based download. Returns file blob directly.
   */
  generateDownloadLinkByVariant(variantId, orderId) {
    const params = orderId ? { order_id: orderId } : undefined;
    return apiClient.get(`/store/downloads/generate-link/${variantId}`, {
      params,
      responseType: 'blob',
    });
  },

  /**
   * GET /store/downloads/:assetId?order_id=orderId
   * Secure asset-based download. Returns file blob.
   */
  downloadAsset(assetId, orderId) {
    return apiClient.get(`/store/downloads/${assetId}`, {
      params: { order_id: orderId },
      responseType: 'blob',
    });
  },

  /**
   * GET /store/downloads/:downloadRecordId
   * Download using entitlement record ID (dld_xxx). Returns file blob.
   */
  downloadByRecordId(downloadRecordId) {
    return apiClient.get(`/store/downloads/${downloadRecordId}`, {
      responseType: 'blob',
    });
  },

  /** POST /store/downloads/:id/regenerate — reset download limit */
  regenerateDownload(downloadId) {
    return apiClient.post(`/store/downloads/${downloadId}/regenerate`);
  },
};

export default digitalDownloadsApi;
