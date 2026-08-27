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
  enrichMarcas: () => api.post('/purchase-orders/enrich-marcas'),
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
  getCatalog: (params) => api.get('/fichas/catalog', { params }),
};

export const preciosFichasApi = {
  getStats: () => api.get('/fichas/precio-stats'),
  enrich: () => api.post('/fichas/enrich-precios'),
  exportJson: (params) => api.get('/fichas/export-json', { params }),
};

export const proveedoresApi = {
  getFichas: (params) => api.get('/proveedores/fichas', { params }),
  getKpis: (params) => api.get('/proveedores/kpis', { params }),
  getAccounts: () => api.get('/proveedores/accounts'),
  getCategoriesCount: (params) => api.get('/proveedores/categories-count', { params }),
  reclassify: () => api.post('/proveedores/reclassify'),
  getColumnFilter: (col) => api.get(`/proveedores/filters/${col}`),
  scrape: (params) => api.post('/proveedores/scrape', null, { params }),
  scrapePlazos: (params) => api.post('/proveedores/scrape-plazos', null, { params }),
  getScrapeStatus: () => api.get('/proveedores/scrape-status'),
  exportJson: () => api.get('/proveedores/export-json'),
  clearData: (params) => api.post('/proveedores/clear', null, { params }),
};

export default api;
