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
  getCatalogosFilter: () => api.get('/purchase-orders/catalogos-filter'),
  getById: (id) => api.get(`/purchase-orders/${id}`),
};

export const scraperApi = {
  getCatalogos: () => api.get('/scraper/catalogos'),
  start: (params) => api.post('/scraper/start', null, { params }),
  getStatus: (taskId) => api.get(`/scraper/status/${taskId}`),
  revoke: (taskId) => api.delete(`/scraper/revoke/${taskId}`),
};

export const fichasApi = {
  getAcuerdos: () => api.get('/scraper/acuerdos'),
  start: (params) => api.post('/scraper/fichas/start', null, { params }),
  getStatus: (taskId) => api.get(`/scraper/status/${taskId}`),
  revoke: (taskId) => api.delete(`/scraper/revoke/${taskId}`),
};

export const fichasProductoApi = {
  getAll: (params) => api.get('/fichas/', { params }),
  getStats: () => api.get('/fichas/stats'),
};

export default api;
