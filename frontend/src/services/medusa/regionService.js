import apiClient from '../apiClient';

export const regionService = {
  list: (params = {}) => apiClient.get('/store/regions', { params }),
  retrieve: (id) => apiClient.get(`/store/regions/${id}`),
};
