import apiClient from '../apiClient';

export const regionService = {
  list: () => apiClient.get('/store/regions'),
  retrieve: (id) => apiClient.get(`/store/regions/${id}`),
};
