import React, { useEffect, useState } from 'react';
import { purchaseOrdersApi } from '../services/api';
import StatCard from '../components/dashboard/StatCard';
import { CatalogBarChart, CategoryPieChart } from '../components/dashboard/Charts';
import { RefreshCw, TrendingUp } from 'lucide-react';

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
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) return <div className="p-10 text-center">Cargando análisis...</div>;

  return (
    <div className="animate-fade">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1>Auditoría de Mercado</h1>
          <p className="subtitle">Análisis inteligente de Perú Compras</p>
        </div>
        <button onClick={fetchStats} className="nav-link" style={{ border: '1px solid var(--border-color)' }}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      <div className="dashboard-grid">
        <StatCard 
          label="Total Órdenes" 
          value={stats?.total_orders.toLocaleString() || '0'} 
          trend="+12% este mes" 
          isPositive={true} 
        />
        <StatCard 
          label="Monto Total" 
          value={(stats?.total_amount / 1000000).toFixed(2) + 'M'} 
          prefix="S/ " 
          trend="+5.4% vs prev" 
          isPositive={true} 
        />
        <StatCard 
          label="Proveedores Activos" 
          value="42" 
          trend="Estable" 
          isPositive={true} 
        />
        <StatCard 
          label="Tasa de Éxito Scraper" 
          value="98.5%" 
          trend="+2.1%" 
          isPositive={true} 
        />
      </div>

      <div className="chart-grid">
        <CatalogBarChart data={stats?.by_catalogo || []} />
        <CategoryPieChart data={stats?.by_categoria || []} />
      </div>

      <div className="glass-effect p-8">
        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <TrendingUp size={20} className="text-green-600" />
          Top 5 Proveedores con Mayor Monto
        </h3>
        <div className="data-table-container">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right' }}>Monto Adjudicado (PEN)</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {stats?.top_providers.map((provider, i) => (
                <tr key={i}>
                  <td className="font-medium text-blue-600">{provider.nombre_proveedor}</td>
                  <td style={{ textAlign: 'right' }}>{provider.total.toLocaleString()}</td>
                  <td>
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-600">
                      Activo
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
