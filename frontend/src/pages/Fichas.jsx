import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fichasProductoApi } from '../services/api';
import FichasTable from '../components/fichas/FichasTable';
import { Search, ChevronLeft, ChevronRight, X } from 'lucide-react';

const Fichas = () => {
  const [searchParams] = useSearchParams();

  const [fichas, setFichas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [limit] = useState(25);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [estado, setEstado] = useState(searchParams.get('estado') || '');
  const [marca, setMarca] = useState(searchParams.get('marca') || '');

  const fetchFichas = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fichasProductoApi.getAll({
        skip: page * limit,
        limit,
        search: search || undefined,
        estado: estado || undefined,
        marca: marca || undefined,
      });
      setFichas(response.data);
    } catch (error) {
      console.error('Error fetching fichas:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, estado, marca]);

  useEffect(() => {
    fetchFichas();
  }, [fetchFichas]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
    fetchFichas();
  };

  const resetFilters = () => {
    setSearch('');
    setEstado('');
    setMarca('');
    setPage(0);
  };

  const hasFilters = search || estado || marca;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Fichas Producto</h1>
          <p>Catálogo de fichas técnicas · {fichas.length} resultados en esta página</p>
        </div>
      </div>

      {(searchParams.get('marca') || searchParams.get('estado') || searchParams.get('search')) && (
        <div style={{ marginBottom: 12 }}>
          <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="badge badge-info">Filtro activo</div>
            <div style={{ flex: 1, color: 'var(--c-text-secondary)' }}>
              {searchParams.get('marca') && <span style={{ marginRight: 12 }}><strong>Marca:</strong> {searchParams.get('marca')}</span>}
              {searchParams.get('estado') && <span style={{ marginRight: 12 }}><strong>Estado:</strong> {searchParams.get('estado')}</span>}
              {searchParams.get('search') && <span><strong>Buscar:</strong> {searchParams.get('search')}</span>}
            </div>
            <button className="btn" onClick={resetFilters}>Limpiar filtros</button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <form onSubmit={handleSearch} className="toolbar-search">
          <Search size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por descripción o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <select
          className="form-select"
          value={estado}
          onChange={(e) => { setEstado(e.target.value); setPage(0); }}
        >
          <option value="">Todos los estados</option>
          <option value="Ofertada">OFERTADA</option>
          <option value="Suspendida">SUSPENDIDA</option>
        </select>

        <input
          type="text"
          className="form-input"
          placeholder="Filtrar por marca..."
          value={marca}
          onChange={(e) => { setMarca(e.target.value); setPage(0); }}
          style={{ maxWidth: 160 }}
        />

        {hasFilters && (
          <button onClick={resetFilters} className="btn" title="Limpiar filtros">
            <X size={14} />
            Limpiar
          </button>
        )}
      </div>

      <FichasTable fichas={fichas} loading={loading} />

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
          disabled={fichas.length < limit || loading}
          className="btn btn-sm"
        >
          Siguiente
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Fichas;
