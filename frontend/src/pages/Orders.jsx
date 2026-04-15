import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { purchaseOrdersApi } from '../services/api';
import OrderTable from '../components/orders/OrderTable';
import { Search, ChevronLeft, ChevronRight, X, Trash2 } from 'lucide-react';

const Orders = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialSearch = queryParams.get('search') || '';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(25);
  const [deleting, setDeleting] = useState(false);

  const [search, setSearch] = useState(initialSearch);
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
        search: search || undefined,
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

  const handleDeleteAll = async () => {
    if (!window.confirm('⚠️ ¿Estás seguro de que deseas eliminar TODAS las órdenes de compra?\n\nEsta acción no se puede deshacer. Deberás volver a scrapear los datos.')) {
      return;
    }
    setDeleting(true);
    try {
      const res = await purchaseOrdersApi.deleteAll();
      alert(`✅ ${res.data.message}`);
      setPage(0);
      fetchOrders();
    } catch (error) {
      console.error('Error deleting orders:', error);
      alert('❌ Error al eliminar las órdenes');
    } finally {
      setDeleting(false);
    }
  };

  const hasFilters = search || catalogo;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Órdenes de Compra</h1>
          <p>Historial completo de adquisiciones · {orders.length} resultados</p>
        </div>
        <button
          onClick={handleDeleteAll}
          disabled={deleting || loading}
          className="btn"
          style={{
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            color: '#fff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 18px',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: deleting ? 'wait' : 'pointer',
            opacity: deleting ? 0.6 : 1,
            transition: 'opacity 0.2s, transform 0.2s',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
          }}
          onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.transform = 'scale(1.04)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <Trash2 size={16} />
          {deleting ? 'Eliminando...' : 'Borrar Todo'}
        </button>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <form onSubmit={handleSearch} className="toolbar-search">
          <Search size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por orden, entidad, proveedor o nro de parte..."
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
