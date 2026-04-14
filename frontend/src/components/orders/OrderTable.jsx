import React from 'react';
import { ExternalLink, FileText, Building2, User, Calendar, Download } from 'lucide-react';

const OrderTable = ({ orders, loading }) => {
  if (loading) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ padding: 20 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 40, marginBottom: 8 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="empty-state">
          <FileText size={40} />
          <p>No se encontraron órdenes con los filtros actuales.</p>
        </div>
      </div>
    );
  }

  const renderProductos = (nro_parte_str) => {
    try {
      const prods = JSON.parse(nro_parte_str);
      if (Array.isArray(prods)) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {prods.map((p, idx) => (
              <div 
                key={idx} 
                style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap',
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  gap: 8, 
                  fontSize: 11, 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-color)',
                  padding: '4px 6px', 
                  borderRadius: 6 
                }}
              >
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--c-text-primary)' }}>
                  {p.nro_parte}
                </span>
                <div style={{ display: 'flex', gap: 12, color: 'var(--c-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  <span title="Precio Unitario">U: {p.precio_unitario?.toLocaleString('es-PE', {minimumFractionDigits:2})}</span>
                  <span style={{fontWeight: 600, color: 'var(--c-text-primary)'}} title="SubTotal">S/ {p.total?.toLocaleString('es-PE', {minimumFractionDigits:2})}</span>
                </div>
              </div>
            ))}
          </div>
        );
      }
    } catch (e) {
      // Si no es JSON (datos antiguos), cae al fallback
    }
    return (
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--c-text-secondary)' }}>
        {nro_parte_str || '—'}
      </span>
    );
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="table-wrap">
        <table className="data-table" style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={{ width: 140 }}>Nro. Orden</th>
              <th>Entidad</th>
              <th>Proveedor</th>
              <th style={{ width: 90 }}>Publicación</th>
              <th style={{ minWidth: 260 }}>Productos (P/N - Unitario - Total)</th>
              <th style={{ textAlign: 'right', width: 100 }}>Total (PEN)</th>
              <th style={{ width: 100 }}>Estado</th>
              <th style={{ width: 50, textAlign: 'center' }}>Doc</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="fade-up">
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--c-brand)' }}>
                    {order.orden_electronica || order.nro_orden_fisica || '—'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Building2 size={13} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                    <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.nombre_entidad}>
                      {order.nombre_entidad}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={13} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                    <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-secondary)' }} title={order.nombre_proveedor}>
                      {order.nombre_proveedor}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-text-secondary)', fontSize: 11 }}>
                    <Calendar size={11} />
                    {order.fecha_publicacion
                      ? new Date(order.fecha_publicacion).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric'})
                      : '—'}
                  </div>
                </td>
                <td>
                  {renderProductos(order.nro_parte)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-primary)' }}>
                  {order.monto_total != null
                    ? Number(order.monto_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })
                    : '—'}
                </td>
                <td>
                  <span className={`badge ${
                    order.estado_orden?.toLowerCase().includes('aceptada')
                      ? 'badge-success'
                      : order.estado_orden?.toLowerCase().includes('pend')
                        ? 'badge-warning'
                        : 'badge-info'
                  }`} style={{ fontSize: 10, padding: '2px 6px' }}>
                    {order.estado_orden || 'S/E'}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {order.orden_digitalizada ? (
                    <a
                      href={order.orden_digitalizada}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm"
                      title="Descargar orden digitalizada (PDF)"
                      download
                      style={{ padding: 4 }}
                    >
                      <Download size={14} />
                    </a>
                  ) : order.pdf_url ? (
                    <a
                      href={order.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm"
                      title="Ver PDF"
                      style={{ padding: 4 }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrderTable;
