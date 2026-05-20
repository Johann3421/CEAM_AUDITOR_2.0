import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fichasProductoApi } from '../services/api';
import FichasTable from '../components/fichas/FichasTable';
import { Search, ChevronLeft, ChevronRight, X, SlidersHorizontal, FileDown } from 'lucide-react';

const Fichas = () => {
  const [searchParams] = useSearchParams();

  // Toolbar / URL-driven filters
  const [search,    setSearch]    = useState(searchParams.get('search')    || '');
  const [estado,    setEstado]    = useState(searchParams.get('estado')    || '');
  const [marca,     setMarca]     = useState(searchParams.get('marca')     || '');
  const [categoria, setCategoria] = useState(searchParams.get('categoria') || '');

  // Data
  const [fichas,  setFichas]  = useState([]);
  const [total,   setTotal]   = useState(null);   // total count from backend
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(0);
  const [exporting, setExporting] = useState(false);
  const limit = 25;

  // ── Fetch ──────────────────────────────────────────────────
  const fetchFichas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fichasProductoApi.getAll({
        skip:      page * limit,
        limit,
        search:    search    || undefined,
        estado:    estado    || undefined,
        marca:     marca     || undefined,
        categoria: categoria || undefined,
      });
      // Backend now returns { total, items } — fall back to plain array for safety
      const data = res.data;
      if (Array.isArray(data)) {
        setFichas(data);
        setTotal(null);
      } else {
        setFichas(data.items || []);
        setTotal(data.total ?? null);
      }
    } catch (err) {
      console.error('Error fetching fichas:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, estado, marca, categoria]);

  useEffect(() => { fetchFichas(); }, [fetchFichas]);

  // Sync state whenever the URL params change (e.g. navigating from Dashboard
  // to /fichas-catalogo?marca=X while already on the fichas page).
  useEffect(() => {
    const m = searchParams.get('marca')     || '';
    const c = searchParams.get('categoria') || '';
    const e = searchParams.get('estado')    || '';
    const s = searchParams.get('search')    || '';
    setMarca(m);
    setCategoria(c);
    setEstado(e);
    setSearch(s);
    setPage(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Filters ────────────────────────────────────────────────
  const activeFilters = [
    marca     && { key: 'marca',     label: 'Marca',     value: marca },
    categoria && { key: 'categoria', label: 'Categoría', value: categoria },
    estado    && { key: 'estado',    label: 'Estado',    value: estado },
    search    && { key: 'search',    label: 'Búsqueda',  value: search },
  ].filter(Boolean);

  const removeFilter = (key) => {
    if (key === 'marca')     setMarca('');
    if (key === 'categoria') setCategoria('');
    if (key === 'estado')    setEstado('');
    if (key === 'search')    setSearch('');
    setPage(0);
  };

  const resetAll = () => {
    setSearch(''); setEstado(''); setMarca(''); setCategoria(''); setPage(0);
  };

  // Column-filter handler called from FichasTable header dropdowns
  const handleColFilter = (col, value) => {
    if (col === 'marca')     { setMarca(value);     setPage(0); }
    if (col === 'categoria') { setCategoria(value); setPage(0); }
  };

  // ── Excel export ──────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fichasProductoApi.exportExcel({
        search:    search    || undefined,
        estado:    estado    || undefined,
        marca:     marca     || undefined,
        categoria: categoria || undefined,
      });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const a    = document.createElement('a');
      a.href     = url;
      const parts = [marca, categoria].filter(Boolean).map(v => v.slice(0, 20).replace(/\s+/g, '_'));
      a.download = `fichas_${parts.length ? parts.join('_') : 'todas'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

  // ── Count label ────────────────────────────────────────────
  const countLabel = loading
    ? '…'
    : total !== null
      ? `${fichas.length} de ${total.toLocaleString('es-PE')} fichas${activeFilters.length ? ' (con filtros)' : ''}`
      : `${fichas.length} resultados en esta página`;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Fichas Producto</h1>
          <p>
            Catálogo de fichas técnicas · <strong>{countLabel}</strong>
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading}
          title={activeFilters.length > 0 ? `Exportar ${total?.toLocaleString('es-PE') || ''} fichas con filtros activos` : 'Exportar todas las fichas'}
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
              ? `Exportar ${total != null ? total.toLocaleString('es-PE') + ' ' : ''}fichas`
              : 'Exportar todo'}
        </button>
      </div>

      {/* ── Active filter chips ─────────────────────────────── */}
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
          <button className="btn btn-sm" onClick={resetAll} style={{ marginLeft: 4 }}>
            <X size={12} /> Limpiar todo
          </button>
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="toolbar">
        <form
          onSubmit={(e) => { e.preventDefault(); setPage(0); fetchFichas(); }}
          className="toolbar-search"
        >
          <Search size={16} />
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por descripción, código o marca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <input
          type="text"
          className="form-input"
          placeholder="Marca…"
          value={marca}
          onChange={(e) => { setMarca(e.target.value); setPage(0); }}
          style={{ maxWidth: 160 }}
        />

        <input
          type="text"
          className="form-input"
          placeholder="Categoría…"
          value={categoria}
          onChange={(e) => { setCategoria(e.target.value); setPage(0); }}
          style={{ maxWidth: 200 }}
        />

        <select
          className="form-select"
          value={estado}
          onChange={(e) => { setEstado(e.target.value); setPage(0); }}
        >
          <option value="">Todos los estados</option>
          <option value="Ofertada">OFERTADA</option>
          <option value="Suspendida">SUSPENDIDA</option>
        </select>

        {activeFilters.length > 0 && (
          <button onClick={resetAll} className="btn" title="Limpiar todos los filtros">
            <X size={14} /> Limpiar
          </button>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <FichasTable
        fichas={fichas}
        loading={loading}
        colFilters={{ marca, categoria }}
        onColFilter={handleColFilter}
      />

      {/* ── Pagination ──────────────────────────────────────── */}
      <div className="pagination">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0 || loading}
          className="btn btn-sm"
        >
          <ChevronLeft size={16} /> Anterior
        </button>
        <span className="pagination-info">
          Página {page + 1}
          {total !== null && ` de ${Math.ceil(total / limit)}`}
        </span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={fichas.length < limit || loading}
          className="btn btn-sm"
        >
          Siguiente <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Fichas;
