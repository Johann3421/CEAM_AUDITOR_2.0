import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseOrdersApi, fichasProductoApi } from '../services/api';
import StatCard from '../components/dashboard/StatCard';
import { CatalogBarChart, CategoryPieChart } from '../components/dashboard/Charts';
import { RefreshCw, TrendingUp, Building2, BookOpen } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [fichasStats, setFichasStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats();
  }, []);

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

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Dashboard</h1>
          <p>Análisis inteligente de órdenes y fichas — Perú Compras</p>
          {stats?.last_update && (
            <div style={{ fontSize: 12, color: 'var(--c-text-secondary)', marginTop: 6 }}>
              Última actualización: {new Date(stats.last_update).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })} · Fuente: {stats.last_update_source === 'fichas' ? 'Fichas' : 'Órdenes'}
            </div>
          )}
        </div>
        <button onClick={fetchStats} className="btn" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Órdenes KPIs */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Órdenes de Compra
        </span>
      </div>
      <div className="stats-grid">
        <StatCard
          label="Total Órdenes"
          value={stats?.total_orders?.toLocaleString() || '0'}
          trend="+12% este mes"
          isPositive={true}
          onClick={() => navigate('/orders')}
          title="Ver todas las órdenes"
        />
        <StatCard
          label="Monto Total Adjudicado"
          value={stats?.total_amount ? (stats.total_amount / 1000000).toFixed(2) + 'M' : '0'}
          prefix="S/ "
          trend="+5.4% vs anterior"
          isPositive={true}
          onClick={() => navigate('/orders')}
          title="Ir a órdenes (filtro por monto)"
        />
        <StatCard
          label="Proveedores Activos"
          value={stats?.providers_count || (stats?.top_providers?.length || '0')}
          trend="Estable"
          isPositive={true}
          onClick={() => navigate('/providers')}
          title="Ver lista de proveedores activos"
        />
        <StatCard
          label="Tasa de Éxito"
          value={stats?.success_rate ? `${stats.success_rate}%` : '—'}
          trend="+2.1%"
          isPositive={true}
          title="Tasa de éxito: basada en órdenes concretadas vs total"
        />
      </div>

      {/* Fichas KPIs */}
      <div style={{ marginTop: 24, marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Fichas Producto
        </span>
      </div>
      <div className="stats-grid">
        <StatCard
          label="Total Fichas"
          value={fichasStats?.total_fichas?.toLocaleString() || '0'}
          trend="Catálogos indexados"
          isPositive={true}
          onClick={() => navigate('/fichas-catalogo')}
          title="Ver ficheros indexados"
        />
        <StatCard
          label="Por Estado"
          value={fichasStats?.by_estado?.[0]?.name || '—'}
          trend={fichasStats?.by_estado?.[0]?.total?.toLocaleString() || ''}
          isPositive={true}
        />
        <StatCard
          label="Top Marca"
          value={fichasStats?.by_marca?.[0]?.name || '—'}
          trend={fichasStats?.by_marca?.[0]?.total?.toLocaleString() + ' fichas' || ''}
          isPositive={true}
          onClick={() => {
            const m = fichasStats?.by_marca?.[0]?.name;
            if (m) navigate(`/fichas?marca=${encodeURIComponent(m)}`);
          }}
          title="Ver fichas filtradas por esta marca"
        />
        <StatCard
          label="Top Categoría"
          value={fichasStats?.by_categoria?.[0]?.name
            ? fichasStats.by_categoria[0].name.substring(0, 22) + (fichasStats.by_categoria[0].name.length > 22 ? '…' : '')
            : '—'}
          trend={fichasStats?.by_categoria?.[0]?.total?.toLocaleString() + ' fichas' || ''}
          isPositive={true}
        />
      </div>

      <div className="charts-row">
        <CatalogBarChart data={stats?.by_catalogo || []} />
        <CategoryPieChart data={stats?.by_categoria || []} />
      </div>

      {/* Top Providers Table */}
      <div className="card fade-up">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} style={{ color: 'var(--c-success)' }} />
            Top 5 Proveedores con Mayor Monto
          </span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right' }}>Monto Adjudicado (PEN)</th>
                <th>Estado</th>
                <th style={{ width: 120, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {stats?.top_providers?.map((provider, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--c-text-tertiary)', fontWeight: 500 }}>{i + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Building2 size={14} style={{ color: 'var(--c-brand)', flexShrink: 0 }} />
                      <span style={{ fontWeight: 500 }}>{provider.nombre_proveedor}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    S/ {provider.total?.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span className="badge badge-success">Activo</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        try {
                          const resp = await purchaseOrdersApi.export({ proveedor: provider.nombre_proveedor });
                          const url = window.URL.createObjectURL(new Blob([resp.data]));
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `orders_${provider.nombre_proveedor.replace(/\s+/g, '_')}.csv`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error('Export failed', err);
                          alert('Error al descargar CSV');
                        }
                      }}
                    >
                      Descargar
                    </button>
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--c-text-tertiary)', padding: 32 }}>
                    Sin datos disponibles
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Marcas Fichas Table */}
      {fichasStats?.by_marca?.length > 0 && (
        <div className="card fade-up" style={{ marginTop: 16 }}>
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={16} style={{ color: 'var(--c-brand)' }} />
              Top Marcas en Fichas Producto
            </span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Marca</th>
                  <th style={{ textAlign: 'right' }}>Fichas</th>
                </tr>
              </thead>
              <tbody>
                {fichasStats.by_marca.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--c-text-tertiary)', fontWeight: 500 }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{row.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {row.total?.toLocaleString()}
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
