import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseOrdersApi } from '../services/api';
import { Search, ExternalLink, Download, Building2 } from 'lucide-react';

const Providers = () => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [downloading, setDownloading] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    purchaseOrdersApi.getProviders()
      .then(res => setProviders(res.data.providers || []))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = providers.filter(p =>
    p.nombre_proveedor.toLowerCase().includes(search.toLowerCase())
  );

  const downloadCSV = async (nombre_proveedor) => {
    setDownloading(nombre_proveedor);
    try {
      const resp = await purchaseOrdersApi.export({ proveedor: nombre_proveedor });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ordenes_${nombre_proveedor.replace(/\s+/g, '_')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error al descargar CSV');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Proveedores Activos</h1>
          <p>
            {loading
              ? 'Cargando directorio de proveedores…'
              : `${filtered.length} de ${providers.length} proveedores · Puedes ver sus órdenes o descargar en CSV`}
          </p>
        </div>
      </div>

      {/* Buscador */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="toolbar-search">
          <Search size={16} />
          <input
            className="form-input"
            placeholder="Buscar proveedor por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} style={{ color: 'var(--c-brand)' }} />
            Directorio de Proveedores
          </span>
          <span style={{ fontSize: 12, color: 'var(--c-text-tertiary)' }}>
            {loading ? '…' : `${filtered.length} resultados`}
          </span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right' }}>Órdenes</th>
                <th style={{ textAlign: 'right' }}>Monto Total (PEN)</th>
                <th style={{ width: 210, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(5)].map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, borderRadius: 4 }} /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-tertiary)' }}>
                    {search ? `Sin resultados para "${search}"` : 'Sin proveedores disponibles'}
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--c-text-tertiary)', fontWeight: 500 }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Building2 size={14} style={{ color: 'var(--c-brand)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>{p.nombre_proveedor}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{p.orders?.toLocaleString('es-PE')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      S/ {Number(p.total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          className="btn btn-sm"
                          title="Ver todas las órdenes de este proveedor"
                          onClick={() => navigate(`/orders?proveedor=${encodeURIComponent(p.nombre_proveedor)}`)}
                        >
                          <ExternalLink size={12} /> Ver órdenes
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          title="Descargar órdenes en CSV"
                          disabled={downloading === p.nombre_proveedor}
                          onClick={() => downloadCSV(p.nombre_proveedor)}
                        >
                          <Download size={12} />
                          {downloading === p.nombre_proveedor ? '…' : 'CSV'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Providers;
