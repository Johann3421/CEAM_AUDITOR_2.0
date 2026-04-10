import React, { useEffect, useState } from 'react';
import { purchaseOrdersApi } from '../services/api';
import StatCard from '../components/dashboard/StatCard';
import { CatalogBarChart, CategoryPieChart } from '../components/dashboard/Charts';
import { RefreshCw, TrendingUp, Building2 } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await purchaseOrdersApi.getStats();
      setStats(response.data);
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
          <p>Análisis inteligente de órdenes — Perú Compras</p>
        </div>
        <button onClick={fetchStats} className="btn" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Total Órdenes"
          value={stats?.total_orders?.toLocaleString() || '0'}
          trend="+12% este mes"
          isPositive={true}
        />
        <StatCard
          label="Monto Total Adjudicado"
          value={stats?.total_amount ? (stats.total_amount / 1000000).toFixed(2) + 'M' : '0'}
          prefix="S/ "
          trend="+5.4% vs anterior"
          isPositive={true}
        />
        <StatCard
          label="Proveedores Activos"
          value="42"
          trend="Estable"
          isPositive={true}
        />
        <StatCard
          label="Tasa de Éxito"
          value="98.5%"
          trend="+2.1%"
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
    </div>
  );
};

export default Dashboard;
