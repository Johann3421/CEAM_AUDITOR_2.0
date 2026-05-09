import React, { useEffect, useState } from 'react';
import { purchaseOrdersApi } from '../services/api';
import { useNavigate } from 'react-router-dom';

const Providers = () => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    purchaseOrdersApi.getProviders()
      .then(res => setProviders(res.data.providers || []))
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = providers.filter(p => p.nombre_proveedor.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Proveedores</h1>
          <p>Lista de proveedores activos · {providers.length}</p>
        </div>
      </div>

      <div className="toolbar">
        <input className="form-input" placeholder="Buscar proveedor..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right' }}>Órdenes</th>
                <th style={{ textAlign: 'right' }}>Monto (PEN)</th>
                <th style={{ width: 160, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 20 }}>Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 20 }}>Sin proveedores</td></tr>
              ) : (
                filtered.map((p, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--c-text-tertiary)' }}>{i+1}</td>
                    <td style={{ fontWeight: 600 }}>{p.nombre_proveedor}</td>
                    <td style={{ textAlign: 'right' }}>{p.orders}</td>
                    <td style={{ textAlign: 'right' }}>S/ {Number(p.total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-sm" onClick={() => navigate(`/orders?proveedor=${encodeURIComponent(p.nombre_proveedor)}`)}>
                        Ver órdenes
                      </button>
                      <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={async () => {
                        try {
                          const resp = await purchaseOrdersApi.export({ proveedor: p.nombre_proveedor });
                          const url = window.URL.createObjectURL(new Blob([resp.data]));
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `orders_${p.nombre_proveedor.replace(/\s+/g, '_')}.csv`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error(err);
                          alert('Error al descargar CSV');
                        }
                      }}>
                        Descargar CSV
                      </button>
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
