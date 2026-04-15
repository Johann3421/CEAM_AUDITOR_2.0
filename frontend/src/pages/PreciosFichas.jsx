import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { preciosFichasApi, fichasProductoApi } from '../services/api';
import {
  DollarSign, Zap, TrendingUp, AlertTriangle, CheckCircle,
  Loader2, RefreshCw, ChevronLeft, ChevronRight, Info, Search
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

const StatCard = ({ label, value, sub, icon: Icon, color }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: `${color}18`, color }}>
      <Icon size={20} />
    </div>
    <div>
      <div className="stat-value">{value}</div>
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
  const [searchTerm, setSearchTerm] = useState('');
  const [currentSearch, setCurrentSearch] = useState('');
  const [filters, setFilters] = useState({ marca: '', acuerdo_marco: '' });
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
      if (soloConPrecio) params.con_precio = true;
      if (currentSearch) params.search = currentSearch;
      if (filters.marca) params.marca = filters.marca;
      if (filters.acuerdo_marco) params.acuerdo_marco = filters.acuerdo_marco;
      
      const r = await fichasProductoApi.getAll(params);
      setFichas(r.data);
    } catch (_) {} finally {
      setLoading(false);
    }
  }, [page, soloConPrecio, currentSearch, filters]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchFichas(); }, [fetchFichas]);
  
  // Reset page to 0 when toggle changes to avoid empty pagination pages
  useEffect(() => { setPage(0); }, [soloConPrecio]);

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
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <StatCard
            label="Total fichas"
            value={stats.total.toLocaleString('es-PE')}
            icon={DollarSign}
            color="var(--c-brand)"
          />
          <StatCard
            label="Con precio"
            value={stats.con_precio.toLocaleString('es-PE')}
            sub={`${stats.coverage_pct}% cobertura`}
            icon={CheckCircle}
            color="var(--c-success)"
          />
          <StatCard
            label="Sin precio"
            value={stats.sin_precio.toLocaleString('es-PE')}
            sub="Sin match en órdenes"
            icon={AlertTriangle}
            color="var(--c-warning)"
          />
          <StatCard
            label="Volatilidad alta"
            value={(stats.volatilidad?.alta ?? 0).toLocaleString('es-PE')}
            sub="Spread > 50%"
            icon={TrendingUp}
            color="var(--c-danger)"
          />
        </div>
      )}

      {/* Volatility distribution */}
      {stats && stats.con_precio > 0 && (
        <div className="card fade-up" style={{ marginBottom: 24, padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
            <strong style={{ color: 'var(--c-text)' }}>Distribución de volatilidad:</strong>
            <span><span className="badge badge-success">Baja (&lt;20%)</span> {stats.volatilidad?.baja ?? 0} fichas</span>
            <span><span className="badge badge-warning">Media (20–50%)</span> {stats.volatilidad?.media ?? 0} fichas</span>
            <span><span className="badge badge-error">Alta (&gt;50%)</span> {stats.volatilidad?.alta ?? 0} fichas</span>
            {stats.enriquecido_at && (
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

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={soloConPrecio}
            onChange={(e) => setSoloConPrecio(e.target.checked)}
          />
          Solo fichas con precio
        </label>
        <button className="btn" onClick={fetchFichas} disabled={loading} title="Recargar" style={{ padding: '8px 16px' }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Recargar
        </button>
      </div>

      {/* Table */}
      <div className="card fade-up" style={{ marginTop: 0 }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nro. Parte</th>
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
                <th style={{ textAlign: 'right' }}>P. Referencia</th>
                <th style={{ textAlign: 'right' }}>P. Mínimo</th>
                <th style={{ textAlign: 'right' }}>P. Máximo</th>
                <th>Volatilidad</th>
                <th style={{ textAlign: 'center' }}>Órdenes</th>
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
                fichas.map((f, idx) => {
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
