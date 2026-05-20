import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const purchaseOrdersApi = {
  getAll: (params) => api.get('/purchase-orders/', { params }),
  getSummary: (params) => api.get('/purchase-orders/summary', { params }),
  getStats: () => api.get('/purchase-orders/stats'),
  getCatalogosFilter: () => api.get('/purchase-orders/catalogos-filter'),
  getColumnFilter: (col) => api.get(`/purchase-orders/filters/${col}`),
  getById: (id) => api.get(`/purchase-orders/${id}`),
  deleteAll: () => api.delete('/purchase-orders/all'),
  getProviders: () => api.get('/purchase-orders/providers'),
  export: (params) => api.get('/purchase-orders/export', { params, responseType: 'blob' }),
  exportExcel: (params) => api.get('/purchase-orders/export-excel', { params, responseType: 'blob' }),
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
  getSummary: (params) => api.get('/fichas/summary', { params }),
  getColumnFilter: (col) => api.get(`/fichas/filters/${col}`),
  deleteAll: () => api.delete('/fichas/all'),
  exportExcel: (params) => api.get('/fichas/export', { params, responseType: 'blob' }),
};

export const preciosFichasApi = {
  getStats: () => api.get('/fichas/precio-stats'),
  enrich: () => api.post('/fichas/enrich-precios'),
};

export default api;
