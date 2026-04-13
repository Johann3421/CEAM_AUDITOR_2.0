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

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nro. Orden</th>
              <th>Entidad</th>
              <th>Proveedor</th>
              <th>Publicación</th>
              <th>Nro. Parte</th>
              <th style={{ textAlign: 'right' }}>P. Unitario</th>
              <th style={{ textAlign: 'right' }}>Monto (PEN)</th>
              <th>Estado</th>
              <th style={{ width: 60 }}>Doc</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="fade-up">
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--c-brand)' }}>
                    {order.nro_orden_fisica}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Building2 size={13} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                    <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {order.nombre_entidad}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={13} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                    <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-secondary)' }}>
                      {order.nombre_proveedor}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--c-text-secondary)', fontSize: 12 }}>
                    <Calendar size={12} />
                    {order.fecha_publicacion
                      ? new Date(order.fecha_publicacion).toLocaleDateString('es-PE')
                      : '—'}
                  </div>
                </td>
                <td>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--c-text-secondary)' }}>
                    {order.nro_parte || '—'}
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                  {order.precio_unitario != null
                    ? Number(order.precio_unitario).toLocaleString('es-PE', { minimumFractionDigits: 2 })
                    : '—'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
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
                  }`}>
                    {order.estado_orden || 'S/E'}
                  </span>
                </td>
                <td>
                  {order.orden_digitalizada ? (
                    <a
                      href={order.orden_digitalizada}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm"
                      title="Descargar orden digitalizada (PDF)"
                      download
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
