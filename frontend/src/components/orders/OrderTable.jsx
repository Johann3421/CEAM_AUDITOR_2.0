import React from 'react';
import { ExternalLink, FileText, Building2, User, Calendar, Download, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { purchaseOrdersApi } from '../../services/api';
import HeaderFilter from '../HeaderFilter';

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const OrderTable = ({ orders, loading, filters = {}, onFilterChange = () => {}, sort, onSort }) => {
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {prods.map((p, idx) => (
              <div key={idx} style={{
                fontSize: 11, background: 'var(--c-bg)',
                border: '1px solid var(--c-border)',
                borderRadius: 7, overflow: 'hidden',
              }}>
                {/* P/N row */}
                <div style={{
                  padding: '4px 8px',
                  borderBottom: '1px solid var(--c-border)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: 'rgba(37,99,235,0.1)', color: 'var(--c-brand)',
                    fontWeight: 700, letterSpacing: 0.4, flexShrink: 0,
                  }}>P/N</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--c-text)', letterSpacing: 0.3 }}>
                    {p.nro_parte || '—'}
                  </span>
                </div>
                {/* Price row */}
                <div style={{
                  padding: '4px 8px',
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: 4,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Precio unit.</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-secondary)', fontWeight: 500 }}>
                      S/ {fmt(p.precio_unitario)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Subtotal <span style={{ color: 'var(--c-warning)', fontWeight: 700 }}>s/IGV</span></span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--c-text)' }}>
                      S/ {fmt(p.total)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      }
    } catch (e) {}
    return (
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--c-text-secondary)' }}>
        {nro_parte_str || '—'}
      </span>
    );
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="table-wrap">
        {/* table-layout:fixed + colgroup = columns NEVER shift between pages */}
        <table
          className="data-table"
          style={{ fontSize: '0.85rem', tableLayout: 'fixed', minWidth: 900 }}
        >
          <colgroup>
            <col style={{ width: 148 }} /> {/* Nro. Orden */}
            <col style={{ width: 160 }} /> {/* Entidad */}
            <col style={{ width: 165 }} /> {/* Proveedor / Marca */}
            <col style={{ width: 92 }}  /> {/* Publicación */}
            <col />                        {/* Productos — fills remaining space */}
            <col style={{ width: 118 }} /> {/* Total */}
            <col style={{ width: 104 }} /> {/* Estado */}
            <col style={{ width: 52 }}  /> {/* Doc */}
          </colgroup>
          <thead>
            <tr>
              <th>Nro. Orden</th>
              <th>
                <HeaderFilter 
                  title="Entidad" 
                  column="entidad" 
                  currentFilter={filters.entidad}
                  onFilterChange={(v) => onFilterChange({ entidad: v })}
                  apiCall={purchaseOrdersApi.getColumnFilter}
                />
              </th>
              <th>
                <HeaderFilter 
                  title="Proveedor / Marca" 
                  column="proveedor" 
                  currentFilter={filters.proveedor} 
                  onFilterChange={(v) => onFilterChange({ proveedor: v })}
                  apiCall={purchaseOrdersApi.getColumnFilter}
                />
              </th>
              <th>Publicación</th>
              <th>
                <div>Productos</div>
                <div style={{ fontSize: 9, fontWeight: 400, color: 'var(--c-text-tertiary)', marginTop: 1, letterSpacing: 0.3 }}>
                  P/N · Precio unit. · Subtotal <span style={{ color: 'var(--c-warning)', fontWeight: 600 }}>sin IGV</span>
                </div>
              </th>
              <th
                style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                onClick={() => onSort && onSort('monto_total')}
                title="Ordenar por total"
              >
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Total (PEN)
                    {!sort || sort.col !== 'monto_total'
                      ? <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />
                      : sort.dir === 'desc'
                        ? <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                        : <ArrowUp size={12} style={{ color: 'var(--c-brand)' }} />}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--c-success)', letterSpacing: 0.3 }}>con IGV</span>
                </div>
              </th>
              <th>
                <HeaderFilter 
                  title="Estado" 
                  column="estado" 
                  currentFilter={filters.estadoOrden}
                  onFilterChange={(v) => onFilterChange({ estadoOrden: v })}
                  apiCall={purchaseOrdersApi.getColumnFilter}
                />
              </th>
              <th style={{ textAlign: 'center' }}>Doc</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="fade-up">
                <td style={{ overflow: 'hidden' }}>
                  <span style={{ fontWeight: 600, color: 'var(--c-brand)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.orden_electronica || order.nro_orden_fisica || '—'}
                  </span>
                </td>
                <td style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <Building2 size={13} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.nombre_entidad}>
                      {order.nombre_entidad}
                    </span>
                  </div>
                </td>
                <td style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={13} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                      <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-secondary)' }} title={order.nombre_proveedor}>
                        {order.nombre_proveedor}
                      </span>
                    </div>
                    {order.marca && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: 'var(--c-brand)',
                        background: 'rgba(37,99,235,0.08)', borderRadius: 4,
                        padding: '1px 6px', alignSelf: 'flex-start', letterSpacing: 0.3,
                      }}>
                        {order.marca}
                      </span>
                    )}
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
                  {order.monto_total != null ? `S/ ${fmt(order.monto_total)}` : '—'}
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
