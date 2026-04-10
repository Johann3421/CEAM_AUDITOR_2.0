import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const purchaseOrdersApi = {
  getAll: (params) => api.get('/purchase-orders/', { params }),
  getStats: () => api.get('/purchase-orders/stats'),
  getById: (id) => api.get(`/purchase-orders/${id}`),
};

export const scraperApi = {
  start: (params) => api.post('/scraper/start', null, { params }),
  getStatus: (taskId) => api.get(`/scraper/status/${taskId}`),
  revoke: (taskId) => api.delete(`/scraper/revoke/${taskId}`),
};

export default api;
