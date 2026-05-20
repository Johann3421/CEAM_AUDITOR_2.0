import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { purchaseOrdersApi } from '../services/api';
import OrderTable from '../components/orders/OrderTable';
import { Search, ChevronLeft, ChevronRight, X, Trash2, SlidersHorizontal, FileDown } from 'lucide-react';

const Orders = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialSearch   = queryParams.get('search')   || '';
  const initialProveedor = queryParams.get('proveedor') || '';
  const initialEntidad   = queryParams.get('entidad')   || '';
  const initialEstado    = queryParams.get('estado_orden') || '';
  const initialCatalogo  = queryParams.get('catalogo')  || '';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(25);
  const [totalResults, setTotalResults] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sort, setSort] = useState({ col: null, dir: 'desc' });

  const [search, setSearch] = useState(initialSearch);
  const [catalogo, setCatalogo] = useState(initialCatalogo);
  const [catalogoOptions, setCatalogoOptions] = useState([]);
  
  // Custom Table Header Filters
  const [estadoOrden, setEstadoOrden] = useState(initialEstado);
  const [entidad, setEntidad] = useState(initialEntidad);
  const [proveedor, setProveedor] = useState(initialProveedor);

  // Load distinct catalogo values from the DB
  useEffect(() => {
    purchaseOrdersApi.getCatalogosFilter()
      .then((res) => setCatalogoOptions(res.data.catalogos || []))
      .catch(() => {});
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        skip: page * limit,
        limit,
        catalogo: catalogo || undefined,
        search: search || undefined,
        estado_orden: estadoOrden || undefined,
        entidad: entidad || undefined,
        proveedor: proveedor || undefined,
      };

      const summaryParams = { ...params };
      delete summaryParams.skip;
      delete summaryParams.limit;

      const [listRes, summaryRes] = await Promise.allSettled([
        purchaseOrdersApi.getAll(params),
        purchaseOrdersApi.getSummary(summaryParams),
      ]);

      if (listRes.status === 'fulfilled') {
        setOrders(listRes.value.data);
      } else {
        console.error('Error fetching orders list:', listRes.reason);
      }

      if (summaryRes.status === 'fulfilled') {
        setTotalResults(summaryRes.value.data?.total ?? null);
      } else {
        setTotalResults(null);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, catalogo, search, estadoOrden, entidad, proveedor]);

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
    setEstadoOrden('');
    setEntidad('');
    setProveedor('');
    setPage(0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await purchaseOrdersApi.exportExcel({
        catalogo:     catalogo     || undefined,
        search:       search       || undefined,
        estado_orden: estadoOrden  || undefined,
        entidad:      entidad      || undefined,
        proveedor:    proveedor    || undefined,
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href    = url;
      const parts = [proveedor, entidad, catalogo].filter(Boolean).map(v => v.slice(0, 18).replace(/\s+/g, '_'));
      a.download = `ordenes_${parts.length ? parts.join('_') : 'todas'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      alert('Error al exportar. Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
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

  const hasFilters = search || catalogo || estadoOrden || entidad || proveedor;

  const activeFilters = [
    catalogo && { key: 'catalogo', label: 'Catálogo', value: catalogo },
    estadoOrden && { key: 'estado', label: 'Estado', value: estadoOrden },
    entidad && { key: 'entidad', label: 'Entidad', value: entidad },
    proveedor && { key: 'proveedor', label: 'Proveedor', value: proveedor },
    search && { key: 'search', label: 'Búsqueda', value: search },
  ].filter(Boolean);

  const removeFilter = (key) => {
    if (key === 'catalogo') setCatalogo('');
    if (key === 'estado') setEstadoOrden('');
    if (key === 'entidad') setEntidad('');
    if (key === 'proveedor') setProveedor('');
    if (key === 'search') setSearch('');
    setPage(0);
  };

  const countLabel = loading
    ? '…'
    : totalResults !== null
      ? `${orders.length} de ${totalResults.toLocaleString('es-PE')} órdenes${activeFilters.length ? ' (con filtros)' : ''}`
      : `${orders.length} resultados en esta página`;

  const toggleSort = (col) => {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { col, dir: 'desc' }
    );
  };

  const sortedOrders = sort.col
    ? [...orders].sort((a, b) => {
        const va = a[sort.col] ?? (sort.dir === 'desc' ? -Infinity : Infinity);
        const vb = b[sort.col] ?? (sort.dir === 'desc' ? -Infinity : Infinity);
        return sort.dir === 'desc' ? vb - va : va - vb;
      })
    : orders;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Órdenes de Compra</h1>
          <p>
            Historial completo de adquisiciones · <strong>{countLabel}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            title={activeFilters.length > 0 ? `Exportar ${totalResults?.toLocaleString('es-PE') || ''} órdenes con filtros activos` : 'Exportar todas las órdenes'}
            style={{
              background: exporting
                ? 'linear-gradient(135deg, #6b7280, #4b5563)'
                : 'linear-gradient(135deg, #059669, #047857)',
              color: '#fff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 18px',
              borderRadius: 10,
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: exporting ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1,
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
              transition: 'all .2s',
              whiteSpace: 'nowrap',
            }}
          >
            <FileDown size={16} />
            {exporting
              ? 'Exportando…'
              : activeFilters.length > 0
                ? `Exportar ${totalResults != null ? totalResults.toLocaleString('es-PE') + ' ' : ''}órdenes`
                : 'Exportar todo'}
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={deleting || loading}
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
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)',
            }}
          >
            <Trash2 size={16} />
            {deleting ? 'Eliminando...' : 'Eliminar Todo'}
          </button>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--c-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <SlidersHorizontal size={13} /> Filtros activos:
          </span>
          {activeFilters.map(f => (
            <span key={f.key} className="filter-chip">
              <strong>{f.label}:</strong>&nbsp;{f.value}
              <button onClick={() => removeFilter(f.key)} aria-label={`Quitar filtro ${f.label}`}>
                <X size={11} />
              </button>
            </span>
          ))}
          <button className="btn btn-sm" onClick={resetFilters} style={{ marginLeft: 4 }}>
            <X size={12} /> Limpiar todo
          </button>
        </div>
      )}

      <div className="toolbar fade-up">
        <form onSubmit={handleSearch} className="toolbar-search">
          <Search size={16} color="var(--c-text-tertiary)" />
          <input
            className="form-input"
            type="text"
            placeholder="Buscar orden, entidad, proveedor..."
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

      <OrderTable 
        orders={sortedOrders} 
        loading={loading} 
        filters={{ entidad, proveedor, estadoOrden }}
        onFilterChange={(f) => {
          if (f.entidad !== undefined) setEntidad(f.entidad);
          if (f.proveedor !== undefined) setProveedor(f.proveedor);
          if (f.estadoOrden !== undefined) setEstadoOrden(f.estadoOrden);
          setPage(0);
        }}
        sort={sort}
        onSort={toggleSort}
      />

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
