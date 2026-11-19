import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fichasProductoApi } from '../services/api';
import FichasTable from '../components/fichas/FichasTable';
import FichaDetailModal from '../components/fichas/FichaDetailModal';
import {
  Search, ChevronLeft, ChevronRight, X, SlidersHorizontal, FileDown,
  ArrowUpDown, TrendingUp, ShoppingBag, DollarSign, BookOpen, CheckCircle,
  Filter, Laptop, Monitor, Smartphone, Briefcase, Printer, Layers
} from 'lucide-react';

/**
 * 7 Categorías Clave (Ley de Miller & Hick: 7 ± 2 elementos).
 * Permite selección rápida en 1 clic sin tener que tipear nombres largos.
 */
const QUICK_CATEGORIES = [
  { id: '', label: 'Todas', icon: Layers },
  { id: 'COMPUTADORA DE ESCRITORIO', label: 'PCs de Escritorio', icon: Monitor },
  { id: 'COMPUTADORA PORTATIL', label: 'Laptops / Portátiles', icon: Laptop },
  { id: 'ESTACION DE TRABAJO', label: 'Workstations', icon: Briefcase },
  { id: 'COMPUTADORA TODO EN UNO', label: 'Todo en Uno (AIO)', icon: Monitor },
  { id: 'MONITOR', label: 'Monitores', icon: Monitor },
  { id: 'ESCANER', label: 'Escáneres', icon: Printer },
];

const formatMoney = (amount) => {
  if (amount == null || isNaN(amount)) return '—';
  const n = Number(amount);
  if (n === 0) return 'S/ 0.00';
  if (n >= 1_000_000) {
    return `S/ ${(n / 1_000_000).toFixed(2)}M`;
  }
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const Fichas = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Toolbar / URL-driven filters
  const [search,    setSearch]    = useState(searchParams.get('search')    || '');
  const [estado,    setEstado]    = useState(searchParams.get('estado')    || '');
  const [marca,     setMarca]     = useState(searchParams.get('marca')     || '');
  const [categoria, setCategoria] = useState(searchParams.get('categoria') || '');
  const [sortBy,    setSortBy]    = useState('monto_contratado');
  const [sortDir,   setSortDir]   = useState('desc');

  // Modal detail state
  const [selectedFicha, setSelectedFicha] = useState(null);

  // Data
  const [fichas,  setFichas]  = useState([]);
  const [total,   setTotal]   = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(0);
  const [exporting, setExporting] = useState(false);
  const limit = 25;

  // ── Fetch Summary KPIs (Ley de Tesler: Backend calcula los agregados) ───
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fichasProductoApi.getSummary({
        search:    search    || undefined,
        estado:    estado    || undefined,
        marca:     marca     || undefined,
        categoria: categoria || undefined,
      });
      setSummary(res.data);
    } catch (err) {
      console.warn('Could not fetch fichas summary:', err);
    }
  }, [search, estado, marca, categoria]);

  // ── Fetch Table Items ──────────────────────────────────────────────────
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
        sort_by:   sortBy    || undefined,
        sort_dir:  sortDir   || undefined,
      });
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
  }, [page, search, estado, marca, categoria, sortBy, sortDir]);

  useEffect(() => { fetchFichas(); }, [fetchFichas]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  // Sync state whenever URL params change
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
  }, [searchParams]);

  // ── Filters & Handlers ────────────────────────────────────────────────
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

  const handleColFilter = (col, value) => {
    if (col === 'marca')     { setMarca(value);     setPage(0); }
    if (col === 'categoria') { setCategoria(value); setPage(0); }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(0);
  };

  // ── Excel Export ──────────────────────────────────────────────────────
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

  // Count label
  const countLabel = loading
    ? 'Cargando…'
    : total !== null
      ? `${total.toLocaleString('es-PE')} fichas encontradas`
      : `${fichas.length} fichas`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header Principal (Ley de Jakob: Título + Action Primary a la derecha) ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--c-text, #0f172a)' }}>
            Catálogo de Fichas-Producto
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--c-text-secondary, #64748b)' }}>
            Catálogo técnico oficial de Acuerdos Marco · <strong>{countLabel}</strong>
          </p>
        </div>

        {/* Botón de Exportar (Ley de Fitts: Target táctil amplio >44px) */}
        <button
          onClick={handleExport}
          disabled={exporting || loading}
          style={{
            background: exporting
              ? 'linear-gradient(135deg, #64748b, #475569)'
              : 'linear-gradient(135deg, #059669, #047857)',
            color: '#fff',
            border: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 20px',
            minHeight: 44,
            borderRadius: 10,
            fontWeight: 600,
            fontSize: '0.86rem',
            cursor: exporting ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.22)',
            transition: 'all .15s',
            whiteSpace: 'nowrap',
          }}
        >
          <FileDown size={17} />
          {exporting ? 'Generando Excel…' : 'Exportar Excel'}
        </button>
      </div>

      {/* ── Top KPI Summary (Ley de Miller: 4 Chunks temáticos de alto impacto) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 12,
        }}
      >
        <div className="stat-card" style={{ padding: '12px 16px' }}>
          <div className="stat-icon" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
            <BookOpen size={20} />
          </div>
          <div>
            <div className="stat-value">{total != null ? total.toLocaleString('es-PE') : '—'}</div>
            <div className="stat-label">Fichas en Catálogo</div>
          </div>
        </div>

        <div className="stat-card" style={{ padding: '12px 16px' }}>
          <div className="stat-icon" style={{ background: 'rgba(5, 150, 105, 0.1)', color: '#059669' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <div className="stat-value">
              {summary?.monto_total != null ? formatMoney(summary.monto_total) : '—'}
            </div>
            <div className="stat-label">Monto Contratado Total</div>
          </div>
        </div>

        <div className="stat-card" style={{ padding: '12px 16px' }}>
          <div className="stat-icon" style={{ background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7' }}>
            <ShoppingBag size={20} />
          </div>
          <div>
            <div className="stat-value">
              {summary?.ocam_total != null ? summary.ocam_total.toLocaleString('es-PE') : '—'}
            </div>
            <div className="stat-label">Órdenes Formalizadas</div>
          </div>
        </div>

        <div className="stat-card" style={{ padding: '12px 16px' }}>
          <div className="stat-icon" style={{ background: 'rgba(217, 119, 6, 0.1)', color: '#d97706' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="stat-value">
              {summary?.con_ventas != null ? summary.con_ventas.toLocaleString('es-PE') : '—'}
            </div>
            <div className="stat-label">Fichas Adjudicadas (con ventas)</div>
          </div>
        </div>
      </div>

      {/* ── Category Segmented Pills (Ley de Miller & Hick: 7 opciones en 1 clic) ── */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {QUICK_CATEGORIES.map(qc => {
          const Icon = qc.icon;
          const isSelected = categoria === qc.id || (qc.id === '' && !categoria);
          return (
            <button
              key={qc.id}
              onClick={() => { setCategoria(qc.id); setPage(0); }}
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                minHeight: 38,
                borderRadius: 20,
                border: isSelected ? '1px solid var(--c-brand, #2563eb)' : '1px solid var(--c-border, #e2e8f0)',
                background: isSelected ? 'var(--c-brand, #2563eb)' : 'var(--c-surface, #fff)',
                color: isSelected ? '#fff' : 'var(--c-text-secondary, #475569)',
                fontSize: '0.82rem',
                fontWeight: isSelected ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all .15s ease',
              }}
            >
              <Icon size={14} />
              <span>{qc.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Unified Search & Secondary Filters (Ley de Hick & Fitts) ── */}
      <div
        className="card"
        style={{
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Fila 1: Hero Search Bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); setPage(0); fetchFichas(); }}
          style={{ display: 'flex', gap: 10, width: '100%' }}
        >
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--c-text-tertiary, #94a3b8)',
              }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar por descripción, número de parte o marca (ej. HP, Rhinobox, 1K74MBA598, Core i7)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                paddingLeft: 42,
                paddingRight: search ? 36 : 14,
                minHeight: 44,
                fontSize: '0.9rem',
                borderRadius: 10,
                width: '100%',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setPage(0); }}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--c-text-tertiary, #94a3b8)',
                  padding: 4,
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ minHeight: 44, padding: '0 20px', fontWeight: 600, fontSize: '0.88rem' }}
          >
            Buscar
          </button>
        </form>

        {/* Fila 2: Filtros Secundarios y Ordenamiento */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 160 }}>
            <select
              className="form-select"
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [sb, sd] = e.target.value.split(':');
                setSortBy(sb);
                setSortDir(sd);
                setPage(0);
              }}
              style={{ minHeight: 38, fontSize: '0.82rem', fontWeight: 600 }}
              title="Ordenar catálogo"
            >
              <option value="monto_contratado:desc">💰 Mayor Monto Contratado</option>
              <option value="cant_ocam:desc">📦 Más Vendidas (Cant. OCAM)</option>
              <option value="fecha_extraccion:desc">🕒 Más Recientes</option>
              <option value="fecha_primera_carga:asc">📅 Más Antiguas</option>
              <option value="marca:asc">🏷️ Marca (A-Z)</option>
            </select>
          </div>

          <input
            type="text"
            className="form-input"
            placeholder="Filtrar por marca…"
            value={marca}
            onChange={(e) => { setMarca(e.target.value); setPage(0); }}
            style={{ maxWidth: 170, minHeight: 38, fontSize: '0.82rem' }}
          />

          <select
            className="form-select"
            value={estado}
            onChange={(e) => { setEstado(e.target.value); setPage(0); }}
            style={{ maxWidth: 160, minHeight: 38, fontSize: '0.82rem' }}
          >
            <option value="">Estado: Todos</option>
            <option value="Ofertada">OFERTADA</option>
            <option value="Suspendida">SUSPENDIDA</option>
          </select>

          {activeFilters.length > 0 && (
            <button
              onClick={resetAll}
              className="btn btn-sm"
              style={{ minHeight: 38, padding: '0 12px', fontSize: '0.8rem', color: '#dc2626' }}
              title="Limpiar todos los filtros"
            >
              <X size={14} /> Limpiar filtros
            </button>
          )}
        </div>

        {/* Fila 3: Chips de Filtros Activos */}
        {activeFilters.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid var(--c-border-light, #f1f5f9)' }}>
            <span style={{ fontSize: 11, color: 'var(--c-text-tertiary, #94a3b8)', fontWeight: 600 }}>
              Filtros activos:
            </span>
            {activeFilters.map(f => (
              <span key={f.key} className="filter-chip" style={{ fontSize: 11, padding: '3px 8px' }}>
                <strong>{f.label}:</strong>&nbsp;{f.value}
                <button onClick={() => removeFilter(f.key)} aria-label={`Quitar filtro ${f.label}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Table (Ley de Jakob & Miller: 7 columnas ordenables) ── */}
      <FichasTable
        fichas={fichas}
        loading={loading}
        colFilters={{ marca, categoria }}
        onColFilter={handleColFilter}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
        onSelectFicha={setSelectedFicha}
      />

      {/* ── Pagination (Ley de Fitts: Targets cómodos >38px) ── */}
      <div className="pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 0' }}>
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0 || loading}
          className="btn"
          style={{ minHeight: 38, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
        >
          <ChevronLeft size={16} /> Anterior
        </button>

        <span className="pagination-info" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--c-text-secondary, #475569)' }}>
          Página {page + 1} {total !== null && `de ${Math.ceil(total / limit)}`}
        </span>

        <button
          onClick={() => setPage(page + 1)}
          disabled={fichas.length < limit || loading}
          className="btn"
          style={{ minHeight: 38, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
        >
          Siguiente <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Detail Modal (Ley de Miller: 4 Chunks Temáticos + Fitts Targets) ── */}
      {selectedFicha && (
        <FichaDetailModal
          ficha={selectedFicha}
          onClose={() => setSelectedFicha(null)}
        />
      )}
    </div>
  );
};

export default Fichas;
