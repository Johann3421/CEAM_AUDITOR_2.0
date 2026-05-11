import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { preciosFichasApi, fichasProductoApi } from '../services/api';
import {
  DollarSign, Zap, TrendingUp, AlertTriangle, CheckCircle,
  Loader2, RefreshCw, ChevronLeft, ChevronRight, Info, Search,
  ArrowUp, ArrowDown, ChevronsUpDown, Filter
} from 'lucide-react';
import HeaderFilter from '../components/HeaderFilter';

// ─── Volatility badge ────────────────────────────────────────────────────────

const VolBadge = ({ vol }) => {
  if (vol == null) return <span style={{ color: 'var(--c-text-tertiary)' }}>—</span>;
  const v = parseFloat(vol);
  if (v < 20) return <span className="badge badge-success">Baja {v.toFixed(1)}%</span>;
  if (v <= 50) return <span className="badge badge-warning">Media {v.toFixed(1)}%</span>;
  return <span className="badge badge-error">Alta {v.toFixed(1)}%</span>;
};

// ─── Stat card ────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, sub, icon: Icon, color, filtered }) => (
  <div className="stat-card" style={filtered ? { outline: '2px solid rgba(37,99,235,0.18)', outlineOffset: 2 } : {}}>
    <div className="stat-icon" style={{ background: `${color}18`, color }}>
      <Icon size={20} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <div className="stat-value">{value}</div>
        {filtered && (
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10,
            background: 'rgba(37,99,235,0.12)', color: 'var(--c-brand)',
            fontWeight: 700, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>FILTRO</span>
        )}
      </div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

const PreciosFichas = () => {
  const navigate = useNavigate();
  const [stats, setStats]           = useState(null);
  const [fichas, setFichas]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [enriching, setEnriching]   = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);
  const [page, setPage]             = useState(0);
  const [soloConPrecio, setSoloConPrecio] = useState(false);
  const [sort, setSort]             = useState({ col: null, dir: 'desc' });
  const [filteredStats, setFilteredStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentSearch, setCurrentSearch] = useState('');
  const [filters, setFilters] = useState({ 
    marca: '', acuerdo_marco: '', nro_parte: '',
    precio_referencia: '', precio_min: '', precio_max: '',
    volatilidad: '', ordenes: ''
  });
  const limit = 50;

  const fetchStats = useCallback(async () => {
    try {
      const r = await preciosFichasApi.getStats();
      setStats(r.data);
    } catch (_) {}
  }, []);

  const fetchFichas = useCallback(async () => {
    setLoading(true);
    try {
      const params = { skip: page * limit, limit };
      const summaryParams = {};
      const addParam = (key, val) => { params[key] = val; summaryParams[key] = val; };
      if (soloConPrecio) addParam('con_precio', true);
      if (currentSearch) addParam('search', currentSearch);
      if (filters.marca) addParam('marca', filters.marca);
      if (filters.acuerdo_marco) addParam('acuerdo_marco', filters.acuerdo_marco);
      if (filters.nro_parte) addParam('nro_parte', filters.nro_parte);
      if (filters.precio_min) addParam('precio_min', filters.precio_min);
      if (filters.precio_max) addParam('precio_max', filters.precio_max);
      if (filters.volatilidad) addParam('volatilidad', filters.volatilidad);

      const [fichasRes, summaryRes] = await Promise.all([
        fichasProductoApi.getAll(params),
        fichasProductoApi.getSummary(summaryParams),
      ]);
      const data = fichasRes.data;
      setFichas(Array.isArray(data) ? data : (data?.items || []));
      setFilteredStats(summaryRes.data);
    } catch (_) {} finally {
      setLoading(false);
    }
  }, [page, soloConPrecio, currentSearch, filters]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchFichas(); }, [fetchFichas]);
  
  // Reset page to 0 when toggle changes
  useEffect(() => { setPage(0); }, [soloConPrecio]);

  const toggleSort = (col) => {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { col, dir: 'desc' }
    );
  };

  const sorted = sort.col
    ? [...fichas].sort((a, b) => {
        const va = a[sort.col] ?? (sort.dir === 'desc' ? -Infinity : Infinity);
        const vb = b[sort.col] ?? (sort.dir === 'desc' ? -Infinity : Infinity);
        return sort.dir === 'desc' ? vb - va : va - vb;
      })
    : fichas;

  const hasFilters = soloConPrecio || !!currentSearch ||
    Object.values(filters).some(v => !!v);
  const displayStats = filteredStats || stats;

  const handleEnrich = async () => {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const r = await preciosFichasApi.enrich();
      setEnrichResult({ ok: true, ...r.data });
      fetchStats();
      fetchFichas();
    } catch (e) {
      setEnrichResult({ ok: false, error: e?.response?.data?.detail || e.message });
    } finally {
      setEnriching(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentSearch(searchTerm);
    setPage(0);
  };

  const fmt = (n) =>
    n == null ? '—' : new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 }).format(n);

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Precios por Fichas</h1>
          <p>Enriquece las fichas-producto con precios de referencia extraídos de las órdenes de compra</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleEnrich}
          disabled={enriching}
          style={{ flexShrink: 0 }}
        >
          {enriching ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
          {enriching ? 'Calculando...' : 'Enriquecer Precios'}
        </button>
      </div>

      {/* Info banner */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '14px 18px', marginBottom: 24,
        background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.22)',
        borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--c-text-secondary)', lineHeight: 1.6,
      }}>
        <Info size={16} style={{ color: 'var(--c-brand)', marginTop: 2, flexShrink: 0 }} />
        <span>
          El algoritmo cruza cada <code style={{ background: 'var(--c-bg)', padding: '1px 6px', borderRadius: 4 }}>nro_parte</code> de las fichas con todas las órdenes de compra que lo mencionan.
          Dado que una misma ficha puede tener <strong>múltiples precios</strong> según la cotización, se usa{' '}
          <strong>clustering por vecindad-ε (5%)</strong>: los precios se agrupan en clases de equivalencia por
          proximidad, se elige el cluster más denso (zona de precio de consenso) y se toma su mediana como{' '}
          <strong>precio de referencia</strong>. La <em>volatilidad</em> mide el spread entre mínimo y máximo
          relativo a la mediana global.
        </span>
      </div>

      {/* Enrich result */}
      {enrichResult && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 'var(--radius)', fontSize: 13,
          background: enrichResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${enrichResult.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
          color: enrichResult.ok ? 'var(--c-success)' : 'var(--c-danger)',
        }}>
          {enrichResult.ok
            ? `✅ Enriquecimiento completado — ${enrichResult.enriched} fichas con precio / ${enrichResult.total_fichas} total (${enrichResult.coverage_pct}% cobertura) · ${enrichResult.not_found} sin match en órdenes`
            : `❌ Error: ${enrichResult.error}`}
        </div>
      )}

      {/* KPI cards */}
      {displayStats && (
        <>
          {hasFilters && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
              fontSize: 12, color: 'var(--c-brand)', fontWeight: 500 }}>
              <Filter size={13} />
              Estadísticas actualizadas según filtros activos
            </div>
          )}
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <StatCard
              label="Total fichas"
              value={(displayStats.total ?? 0).toLocaleString('es-PE')}
              icon={DollarSign} color="var(--c-brand)" filtered={hasFilters}
            />
            <StatCard
              label="Con precio"
              value={(displayStats.con_precio ?? 0).toLocaleString('es-PE')}
              sub={`${displayStats.coverage_pct ?? 0}% cobertura`}
              icon={CheckCircle} color="var(--c-success)" filtered={hasFilters}
            />
            <StatCard
              label="Sin precio"
              value={(displayStats.sin_precio ?? 0).toLocaleString('es-PE')}
              sub="Sin match en órdenes"
              icon={AlertTriangle} color="var(--c-warning)" filtered={hasFilters}
            />
            <StatCard
              label="Volatilidad alta"
              value={((displayStats.volatilidad?.alta) ?? 0).toLocaleString('es-PE')}
              sub="Spread > 50%"
              icon={TrendingUp} color="var(--c-danger)" filtered={hasFilters}
            />
          </div>
        </>
      )}

      {/* Volatility distribution */}
      {displayStats && (displayStats.con_precio ?? 0) > 0 && (
        <div className="card fade-up" style={{ marginBottom: 24, padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
            <strong style={{ color: 'var(--c-text)' }}>Distribución de volatilidad{hasFilters ? ' (filtrada)' : ''}:</strong>
            <span><span className="badge badge-success">Baja (&lt;20%)</span> {displayStats.volatilidad?.baja ?? 0} fichas</span>
            <span><span className="badge badge-warning">Media (20–50%)</span> {displayStats.volatilidad?.media ?? 0} fichas</span>
            <span><span className="badge badge-error">Alta (&gt;50%)</span> {displayStats.volatilidad?.alta ?? 0} fichas</span>
            {stats?.enriquecido_at && (
              <span style={{ color: 'var(--c-text-tertiary)', marginLeft: 'auto', fontSize: 11 }}>
                Última actualización: {new Date(stats.enriquecido_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar" style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 250 }}>
          <div className="search-input" style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--c-text-tertiary)' }} />
            <input
              type="text"
              placeholder="Buscar por Nro Parte, Marca o Descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 'var(--radius)', border: '1px solid var(--c-border)', fontSize: 13 }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px' }}>Buscar</button>
        </form>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer',
          padding: '7px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--c-border)',
          background: soloConPrecio ? 'rgba(34,197,94,0.08)' : 'var(--c-surface)',
          transition: 'background 0.15s' }}>
          <input
            type="checkbox"
            checked={soloConPrecio}
            onChange={(e) => setSoloConPrecio(e.target.checked)}
            style={{ accentColor: 'var(--c-success)', width: 15, height: 15 }}
          />
          <span style={{ color: soloConPrecio ? 'var(--c-success)' : 'var(--c-text-secondary)', fontWeight: soloConPrecio ? 600 : 400 }}>
            Solo fichas con precio
          </span>
        </label>
        <button className="btn" onClick={fetchFichas} disabled={loading} title="Recargar" style={{ padding: '8px 16px' }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Recargar
        </button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--c-text-tertiary)',
          padding: '6px 12px', borderRadius: 'var(--radius)', background: 'rgba(234,179,8,0.08)',
          border: '1px solid rgba(234,179,8,0.25)' }}>
          ℹ️ Precios <strong style={{ color: 'var(--c-warning)' }}>sin IGV</strong>
        </span>
      </div>

      {/* Table */}
      <div className="card fade-up" style={{ marginTop: 0 }}>
        {/* Row count bar */}
        {!loading && displayStats && (
          <div style={{ padding: '10px 16px 0', fontSize: 12, color: 'var(--c-text-secondary)',
            display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>
              Mostrando <strong>{fichas.length}</strong> de{' '}
              <strong>{(displayStats.total ?? 0).toLocaleString('es-PE')}</strong> fichas
              {hasFilters && <span style={{ color: 'var(--c-brand)', marginLeft: 4 }}>(con filtros)</span>}
            </span>
            {sort.col && (
              <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                background: 'rgba(37,99,235,0.08)', color: 'var(--c-brand)', fontSize: 11 }}>
                Ordenado por {sort.col === 'precio_referencia' ? 'P. Referencia'
                  : sort.col === 'precio_min' ? 'P. Mínimo'
                  : sort.col === 'precio_max' ? 'P. Máximo'
                  : sort.col === 'precio_volatilidad' ? 'Volatilidad'
                  : 'Órdenes'} {sort.dir === 'desc' ? '↓' : '↑'}
              </span>
            )}
          </div>
        )}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <HeaderFilter 
                    title="Nro. Parte" 
                    column="nro_parte" 
                    currentFilter={filters.nro_parte}
                    onFilterChange={(v) => { setFilters(prev => ({...prev, nro_parte: v})); setPage(0); }}
                    apiCall={fichasProductoApi.getColumnFilter}
                  />
                </th>
                <th>
                  <HeaderFilter 
                    title="Marca" 
                    column="marca" 
                    currentFilter={filters.marca}
                    onFilterChange={(v) => { setFilters(prev => ({...prev, marca: v})); setPage(0); }}
                    apiCall={fichasProductoApi.getColumnFilter}
                  />
                </th>
                <th>
                  <HeaderFilter 
                    title="Acuerdo Marco" 
                    column="acuerdo_marco" 
                    currentFilter={filters.acuerdo_marco}
                    onFilterChange={(v) => { setFilters(prev => ({...prev, acuerdo_marco: v})); setPage(0); }}
                    apiCall={fichasProductoApi.getColumnFilter}
                  />
                </th>
                <th
                  style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort('precio_referencia')}
                  title="Ordenar por precio de referencia"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    P. Referencia
                    {sort.col !== 'precio_referencia'
                      ? <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />
                      : sort.dir === 'desc'
                        ? <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                        : <ArrowUp size={12} style={{ color: 'var(--c-brand)' }} />}
                  </span>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort('precio_min')} title="Ordenar por precio mínimo">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    P. Mínimo
                    {sort.col !== 'precio_min'
                      ? <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />
                      : sort.dir === 'desc'
                        ? <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                        : <ArrowUp size={12} style={{ color: 'var(--c-brand)' }} />}
                  </span>
                </th>
                <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort('precio_max')} title="Ordenar por precio máximo">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    P. Máximo
                    {sort.col !== 'precio_max'
                      ? <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />
                      : sort.dir === 'desc'
                        ? <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                        : <ArrowUp size={12} style={{ color: 'var(--c-brand)' }} />}
                  </span>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort('precio_volatilidad')} title="Ordenar por volatilidad">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Volatilidad
                    {sort.col !== 'precio_volatilidad'
                      ? <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />
                      : sort.dir === 'desc'
                        ? <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                        : <ArrowUp size={12} style={{ color: 'var(--c-brand)' }} />}
                  </span>
                </th>
                <th
                  style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort('n_ordenes_precio')}
                  title="Ordenar por número de órdenes"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Órdenes
                    {sort.col !== 'n_ordenes_precio'
                      ? <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />
                      : sort.dir === 'desc'
                        ? <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                        : <ArrowUp size={12} style={{ color: 'var(--c-brand)' }} />}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((__, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>
                    ))}
                  </tr>
                ))
              ) : fichas.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--c-text-tertiary)' }}>
                    No hay fichas{soloConPrecio ? ' con precio' : ''} en esta página.
                  </td>
                </tr>
              ) : (
                sorted.map((f, idx) => {
                  const nroParte = f.nro_parte_o_cdigo_nico_de_identificacin
                    || f['nro_parte_o_código_único_de_identificación']
                    || f.nro_parte || '—';
                  const acuerdo = f.acuerdo_marco || '—';
                  const shortAcuerdo = acuerdo.match(/([A-Z]{2,}-[A-Z]{2,}-\d{4}-\d+)/i)?.[1] || acuerdo.split(' ')[0];

                  return (
                    <tr key={idx} className="fade-up">
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--c-brand)' }}>
                          {nroParte}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{f.marca || '—'}</td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--c-text-tertiary)' }}>{shortAcuerdo}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: f.precio_referencia ? 'var(--c-text)' : 'var(--c-text-tertiary)' }}>
                        {fmt(f.precio_referencia)}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-text-secondary)' }}>
                        {f.orden_min ? (
                          <div
                            onClick={() => navigate(`/orders?search=${f.orden_min}`)}
                            title={`Ir a orden: ${f.orden_min}`}
                            style={{ cursor: 'pointer', color: 'var(--c-brand)', textDecoration: 'underline' }}
                          >
                            {fmt(f.precio_min)}
                          </div>
                        ) : (
                          fmt(f.precio_min)
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-text-secondary)' }}>
                        {f.orden_max ? (
                          <div
                            onClick={() => navigate(`/orders?search=${f.orden_max}`)}
                            title={`Ir a orden: ${f.orden_max}`}
                            style={{ cursor: 'pointer', color: 'var(--c-brand)', textDecoration: 'underline' }}
                          >
                            {fmt(f.precio_max)}
                          </div>
                        ) : (
                          fmt(f.precio_max)
                        )}
                      </td>
                      <td><VolBadge vol={f.precio_volatilidad} /></td>
                      <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--c-text-tertiary)' }}>
                        {f.n_ordenes_precio ?? '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="pagination">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0 || loading}
          className="btn btn-sm"
        >
          <ChevronLeft size={16} /> Anterior
        </button>
        <span className="pagination-info">Página {page + 1}</span>
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

export default PreciosFichas;
