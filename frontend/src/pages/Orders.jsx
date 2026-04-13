import React, { useState, useEffect, useCallback } from 'react';
import { purchaseOrdersApi } from '../services/api';
import OrderTable from '../components/orders/OrderTable';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(25);

  const [search, setSearch] = useState('');
  const [catalogo, setCatalogo] = useState('');
  const [catalogoOptions, setCatalogoOptions] = useState([]);

  // Load distinct catalogo values from the DB
  useEffect(() => {
    purchaseOrdersApi.getCatalogosFilter()
      .then((res) => setCatalogoOptions(res.data.catalogos || []))
      .catch(() => {});
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await purchaseOrdersApi.getAll({
        skip: page * limit,
        limit,
        catalogo: catalogo || undefined,
        nombre_entidad: search || undefined,
      });
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, catalogo, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
    fetchOrders();
  };

  const resetFilters = () => {
    setSearch('');
    setCatalogo('');
    setPage(0);
  };

  const hasFilters = search || catalogo;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Órdenes de Compra</h1>
          <p>Historial completo de adquisiciones · {orders.length} resultados</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <form onSubmit={handleSearch} className="toolbar-search">
          <Search size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por entidad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="form-select"
          value={catalogo}
          onChange={(e) => { setCatalogo(e.target.value); setPage(0); }}
        >
          <option value="">Todos los catálogos</option>
          {catalogoOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {hasFilters && (
          <button onClick={resetFilters} className="btn" title="Limpiar filtros">
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      <OrderTable orders={orders} loading={loading} />

      {/* Pagination */}
      <div className="pagination">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0 || loading}
          className="btn btn-sm"
        >
          <ChevronLeft size={16} />
          Anterior
        </button>
        <span className="pagination-info">Página {page + 1}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={orders.length < limit || loading}
          className="btn btn-sm"
        >
          Siguiente
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Orders;
