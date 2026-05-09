import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseOrdersApi, fichasProductoApi } from '../services/api';
import StatCard from '../components/dashboard/StatCard';
import { CatalogBarChart, CategoryPieChart } from '../components/dashboard/Charts';
import { RefreshCw, TrendingUp, Building2, BookOpen, ExternalLink } from 'lucide-react';

const fmt = (date) =>
  new Date(date).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [fichasStats, setFichasStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [ordersRes, fichasRes] = await Promise.allSettled([
        purchaseOrdersApi.getStats(),
        fichasProductoApi.getStats(),
      ]);
      if (ordersRes.status === 'fulfilled') setStats(ordersRes.value.data);
      if (fichasRes.status === 'fulfilled') setFichasStats(fichasRes.value.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = async (proveedor) => {
    try {
      const resp = await purchaseOrdersApi.export({ proveedor });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ordenes_${proveedor.replace(/\s+/g, '_')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      alert('Error al descargar CSV');
    }
  };

  if (loading && !stats) {
    return (
      <div>
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>Cargando análisis de mercado...</p>
        </div>
        <div className="stats-grid">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ height: 14, width: 100, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 32, width: 80 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const lastUpdateLabel = stats?.last_update
    ? `${fmt(stats.last_update)}  ·  ${stats.last_update_source === 'fichas' ? 'Scraper Fichas' : 'Scraper Órdenes'}`
    : null;

  return (
    <div>
      {/* ── Header ───────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>Dashboard</h1>
            <span style={{ color: 'var(--c-border)', fontWeight: 300, fontSize: 22, lineHeight: 1 }}>—</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Fecha de Actualización
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-brand)' }}>
              {stats?.last_update ? fmt(stats.last_update) : '—'}
            </span>
            {stats?.last_update_source && (
              <span className="badge badge-info" style={{ fontSize: 11 }}>
                {stats.last_update_source === 'fichas' ? 'Scraper Fichas' : 'Scraper Órdenes'}
              </span>
            )}
          </div>
          <p style={{ marginTop: 4 }}>Análisis inteligente de órdenes y fichas — Perú Compras</p>
        </div>
        <button onClick={fetchStats} className="btn" disabled={loading} style={{ flexShrink: 0 }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* ── Órdenes KPIs ─────────────────────────────────── */}
      <div className="section-label">Órdenes de Compra</div>
      <div className="stats-grid">
        <StatCard
          label="Total Órdenes"
          value={stats?.total_orders?.toLocaleString('es-PE') || '0'}
          trend="+12% este mes"
          isPositive={true}
          onClick={() => navigate('/orders')}
          title="Ver todas las órdenes"
          tooltip="Total de órdenes de compra registradas en el sistema. Haz clic para ver el listado completo con filtros."
        />
        <StatCard
          label="Monto Total Adjudicado"
          value={stats?.total_amount ? (stats.total_amount / 1_000_000).toFixed(2) + 'M' : '0'}
          prefix="S/ "
          trend="+5.4% vs anterior"
          isPositive={true}
          onClick={() => navigate('/orders')}
          title="Ver órdenes ordenadas por monto"
          tooltip="Suma total en soles de todos los montos adjudicados en las órdenes registradas."
        />
        <StatCard
          label="Proveedores Activos"
          value={stats?.providers_count ?? stats?.top_providers?.length ?? '0'}
          trend="Estable"
          isPositive={true}
          onClick={() => navigate('/providers')}
          title="Ver lista completa de proveedores"
          tooltip="Número de proveedores únicos con órdenes activas. Haz clic para ver el directorio completo con opción de exportar."
        />
        <StatCard
          label="Tasa de Éxito"
          value={stats?.success_rate != null ? `${stats.success_rate}%` : '—'}
          trend="+2.1%"
          isPositive={true}
          tooltip="Porcentaje de órdenes en estado 'aceptado' sobre el total de órdenes. Indica la efectividad del proceso de adjudicación con los proveedores."
        />
      </div>

      {/* ── Fichas KPIs ──────────────────────────────────── */}
      <div className="section-label" style={{ marginTop: 24 }}>Fichas Producto</div>
      <div className="stats-grid">
        <StatCard
          label="Total Fichas"
          value={fichasStats?.total_fichas?.toLocaleString('es-PE') || '0'}
          trend="Catálogos indexados"
          isPositive={true}
          onClick={() => navigate('/fichas-catalogo')}
          title="Ver catálogo completo de fichas"
          tooltip="Total de fichas técnicas de productos indexadas desde el catálogo electrónico de Perú Compras."
        />
        <StatCard
          label="Por Estado"
          value={fichasStats?.by_estado?.[0]?.name || '—'}
          trend={fichasStats?.by_estado?.[0]?.total?.toLocaleString('es-PE') || ''}
          isPositive={true}
          onClick={() => {
            const e = fichasStats?.by_estado?.[0]?.name;
            if (e) navigate(`/fichas-catalogo?estado=${encodeURIComponent(e)}`);
          }}
          title="Ver fichas por estado"
          tooltip="Estado más frecuente en el catálogo. Haz clic para filtrar todas las fichas por este estado."
        />
        <StatCard
          label="Top Marca"
          value={fichasStats?.by_marca?.[0]?.name || '—'}
          trend={`${fichasStats?.by_marca?.[0]?.total?.toLocaleString('es-PE') || '0'} fichas`}
          isPositive={true}
          onClick={() => {
            const m = fichasStats?.by_marca?.[0]?.name;
            if (m) navigate(`/fichas-catalogo?marca=${encodeURIComponent(m)}`);
          }}
          title="Ver todas las fichas de esta marca"
          tooltip="Marca con mayor número de fichas técnicas registradas. Haz clic para ver solo las fichas de esta marca."
        />
        <StatCard
          label="Top Categoría"
          value={fichasStats?.by_categoria?.[0]?.name
            ? fichasStats.by_categoria[0].name.substring(0, 22) + (fichasStats.by_categoria[0].name.length > 22 ? '…' : '')
            : '—'}
          trend={`${fichasStats?.by_categoria?.[0]?.total?.toLocaleString('es-PE') || '0'} fichas`}
          isPositive={true}
          onClick={() => {
            const c = fichasStats?.by_categoria?.[0]?.name;
            if (c) navigate(`/fichas-catalogo?categoria=${encodeURIComponent(c)}`);
          }}
          title="Ver fichas de esta categoría"
          tooltip="Categoría con mayor cantidad de fichas. Haz clic para filtrar el catálogo solo por esta categoría."
        />
      </div>

      {/* ── Charts ───────────────────────────────────────── */}
      <div className="charts-row">
        <CatalogBarChart data={stats?.by_catalogo || []} />
        <CategoryPieChart data={stats?.by_categoria || []} />
      </div>

      {/* ── Top 5 Proveedores ─────────────────────────────── */}
      <div className="card fade-up">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} style={{ color: 'var(--c-success)' }} />
            Top 5 Proveedores con Mayor Monto
          </span>
          <button className="btn btn-sm" onClick={() => navigate('/providers')}>
            <ExternalLink size={13} />
            Ver todos
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right' }}>Monto Adjudicado (PEN)</th>
                <th style={{ width: 80 }}>Estado</th>
                <th style={{ width: 200, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {stats?.top_providers?.length ? stats.top_providers.map((p, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--c-text-tertiary)', fontWeight: 500 }}>{i + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Building2 size={14} style={{ color: 'var(--c-brand)', flexShrink: 0 }} />
                      <span style={{ fontWeight: 500 }}>{p.nombre_proveedor}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    S/ {p.total?.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </td>
                  <td><span className="badge badge-success">Activo</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button
                        className="btn btn-sm"
                        title="Ver órdenes de este proveedor"
                        onClick={() => navigate(`/orders?proveedor=${encodeURIComponent(p.nombre_proveedor)}`)}
                      >
                        Ver órdenes
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        title="Descargar CSV con las órdenes de este proveedor"
                        onClick={() => downloadCSV(p.nombre_proveedor)}
                      >
                        ↓ CSV
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--c-text-tertiary)', padding: 32 }}>
                    Sin datos disponibles
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Top Marcas ───────────────────────────────────── */}
      {fichasStats?.by_marca?.length > 0 && (
        <div className="card fade-up" style={{ marginTop: 16 }}>
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={16} style={{ color: 'var(--c-brand)' }} />
              Top Marcas en Fichas Producto
            </span>
            <span style={{ fontSize: 12, color: 'var(--c-text-tertiary)' }}>Haz clic en una fila para ver sus fichas</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Marca</th>
                  <th style={{ textAlign: 'right' }}>Fichas</th>
                  <th style={{ width: 80, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {fichasStats.by_marca.slice(0, 10).map((row, i) => (
                  <tr
                    key={i}
                    className="clickable-row"
                    role="button"
                    tabIndex={0}
                    title={`Ver fichas de ${row.name}`}
                    onClick={() => navigate(`/fichas-catalogo?marca=${encodeURIComponent(row.name)}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/fichas-catalogo?marca=${encodeURIComponent(row.name)}`); }}
                  >
                    <td style={{ color: 'var(--c-text-tertiary)', fontWeight: 500 }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{row.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {row.total?.toLocaleString('es-PE')}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--c-brand)' }}>Ver →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
