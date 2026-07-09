import React, { useState } from 'react';
import { ExternalLink, FileText, Building2, User, Calendar, Download, ArrowUp, ArrowDown, ChevronsUpDown, ChevronDown, ChevronUp, Package, MapPin, ClipboardList, Info } from 'lucide-react';
import { purchaseOrdersApi } from '../../services/api';
import HeaderFilter from '../HeaderFilter';

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getStatusConfig = (status) => {
  if (!status) return { label: 'S/E', className: 'badge-info' };
  const s = status.toUpperCase();
  if (s.includes('CONCLU')) {
    return { label: 'Concluida', className: 'badge-success' };
  }
  if (s.includes('PENDIENTE') || s.includes('PEND')) {
    if (s.includes('ACEPTADA') || s.includes('ACEPT')) {
      return { label: 'Aceptada (Pend.)', className: 'badge-warning' };
    }
    return { label: 'Pendiente', className: 'badge-warning' };
  }
  if (s.includes('RECHAZADA') || s.includes('ANULADA')) {
    return { label: s.includes('RECHAZADA') ? 'Rechazada' : 'Anulada', className: 'badge-danger' };
  }
  if (s.includes('ACEPTADA') || s.includes('ACEPT')) {
    return { label: 'Aceptada', className: 'badge-success' };
  }
  return { label: status, className: 'badge-info' };
};

const OrderTable = ({ orders, loading, filters = {}, onFilterChange = () => {}, sort, onSort }) => {
  const [expandedRows, setExpandedRows] = useState({});

  const toggleRow = (id) => {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

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
    <div className="card" style={{ marginTop: 16, overflow: 'visible', padding: 0 }}>
      <div className="table-wrap" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table
          className="data-table"
          style={{ fontSize: '0.85rem', tableLayout: 'fixed', minWidth: 1250, borderCollapse: 'collapse' }}
        >
          <colgroup>
            <col style={{ width: 50 }} />   {/* Expand/Collapse Chevron */}
            <col style={{ width: 150 }} />  {/* Nro. Orden */}
            <col />                         {/* Entidad — flexible, fills remaining space */}
            <col style={{ width: 250 }} />  {/* Proveedor / Marca */}
            <col style={{ width: 110 }} />  {/* Publicación */}
            <col style={{ width: 220 }} />  {/* Productos (Resumen) */}
            <col style={{ width: 120 }} />  {/* Total */}
            <col style={{ width: 170 }} />  {/* Estado */}
            <col style={{ width: 60 }} />   {/* Doc */}
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: 50 }}></th>
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
              <th>Productos</th>
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
              <th>Estado</th>
              <th style={{ textAlign: 'center' }}>Doc</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isExpanded = !!expandedRows[order.id];
              let prods = [];
              try {
                prods = JSON.parse(order.nro_parte);
              } catch (e) {}
              const hasProds = Array.isArray(prods) && prods.length > 0;

              return (
                <React.Fragment key={order.id}>
                  <tr 
                    className={`fade-up ${isExpanded ? 'row-expanded' : ''}`}
                    style={{ 
                      cursor: 'pointer', 
                      backgroundColor: isExpanded ? 'rgba(37,99,235,0.03)' : 'inherit',
                      transition: 'all 0.15s ease'
                    }}
                    onClick={() => toggleRow(order.id)}
                  >
                    <td style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: isExpanded ? 'rgba(37,99,235,0.1)' : 'transparent',
                        transition: 'background-color 0.2s'
                      }}>
                        {isExpanded ? (
                          <ChevronUp size={14} style={{ color: 'var(--c-brand)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ color: 'var(--c-text-tertiary)' }} />
                        )}
                      </div>
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--c-brand)', letterSpacing: '0.2px' }}>
                        {order.orden_electronica || order.nro_orden_fisica || '—'}
                      </span>
                    </td>
                    <td style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        <Building2 size={14} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={order.nombre_entidad}>
                          {order.nombre_entidad}
                        </span>
                      </div>
                    </td>
                    <td style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                          <User size={14} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text)', fontWeight: 500 }} title={order.nombre_proveedor}>
                            {order.nombre_proveedor}
                          </span>
                        </div>
                        {order.marca && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, color: 'var(--c-brand)',
                            background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.15)',
                            borderRadius: 4, padding: '1px 6px', alignSelf: 'flex-start', letterSpacing: 0.5,
                            textTransform: 'uppercase'
                          }}>
                            {order.marca}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--c-text-secondary)', fontSize: 12 }}>
                        <Calendar size={13} style={{ flexShrink: 0, color: 'var(--c-text-tertiary)' }} />
                        {order.fecha_publicacion
                          ? new Date(order.fecha_publicacion).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric'})
                          : '—'}
                      </div>
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {hasProds && (
                          <span style={{
                            fontSize: 10,
                            background: 'var(--c-border-light)',
                            color: 'var(--c-text-secondary)',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid var(--c-border)',
                            flexShrink: 0
                          }}>
                            {prods.length} {prods.length === 1 ? 'ítem' : 'ítems'}
                          </span>
                        )}
                        <span style={{ color: 'var(--c-text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {hasProds ? prods.map(p => p.nro_parte).join(', ') : order.nro_parte || '—'}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-primary)', fontSize: 14 }}>
                      {order.monto_total != null ? `S/ ${fmt(order.monto_total)}` : '—'}
                    </td>
                    <td>
                      {(() => {
                        const statusCfg = getStatusConfig(order.estado_orden);
                        return (
                          <span 
                            className={`badge ${statusCfg.className}`} 
                            style={{ fontSize: 10, padding: '4px 8px', borderRadius: 4, fontWeight: 700 }}
                            title={order.estado_orden}
                          >
                            {statusCfg.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {order.orden_digitalizada ? (
                        <a
                          href={order.orden_digitalizada}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          title="Descargar orden digitalizada (PDF)"
                          download
                          style={{ padding: 6, borderRadius: 6 }}
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
                          style={{ padding: 6, borderRadius: 6 }}
                        >
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr style={{ background: '#f8fafc' }}>
                      <td colSpan={9} style={{ padding: '16px 24px', borderBottom: '1px solid var(--c-border)' }}>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1.4fr 1fr', 
                          gap: 24,
                          background: '#fff',
                          border: '1px solid var(--c-border)',
                          borderRadius: 12,
                          padding: 20,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                        }}>
                          {/* Left Column: Product detail list */}
                          <div>
                            <h4 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--c-border-light)', paddingBottom: 10 }}>
                              <ClipboardList size={16} style={{ color: 'var(--c-brand)' }} />
                              Detalle de Ítems / Productos
                            </h4>
                            
                            {hasProds ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {prods.map((p, idx) => (
                                  <div key={idx} style={{
                                    border: '1px solid var(--c-border)',
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    background: '#fafbfc'
                                  }}>
                                    <div style={{
                                      padding: '8px 12px',
                                      background: '#f1f5f9',
                                      borderBottom: '1px solid var(--c-border-light)',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{
                                          fontSize: 9, padding: '2px 6px', borderRadius: 4,
                                          background: 'var(--c-brand)', color: '#fff',
                                          fontWeight: 700, letterSpacing: 0.5
                                        }}>P/N</span>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--c-text)', fontSize: 12 }}>
                                          {p.nro_parte || '—'}
                                        </span>
                                      </div>
                                    </div>
                                    <div style={{
                                      padding: '10px 12px',
                                      display: 'grid',
                                      gridTemplateColumns: '1fr 1fr',
                                      gap: 16
                                    }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Precio unitario</span>
                                        <span style={{ fontWeight: 600, color: 'var(--c-text-secondary)', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                                          S/ {fmt(p.precio_unitario)}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                                        <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Subtotal (Sin IGV)</span>
                                        <span style={{ fontWeight: 700, color: 'var(--c-brand)', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                                          S/ {fmt(p.total)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ padding: 12, background: 'var(--c-bg)', borderRadius: 6, color: 'var(--c-text-secondary)', fontFamily: 'monospace', fontSize: 12 }}>
                                {order.nro_parte || '—'}
                              </div>
                            )}

                            {order.detalle_producto && (
                              <div style={{ marginTop: 16 }}>
                                <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: 6, fontWeight: 600 }}>Descripción Completa del Scraper</span>
                                <div style={{ fontSize: 12, color: 'var(--c-text-secondary)', padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid var(--c-border-light)', lineHeight: 1.5 }}>
                                  {order.detalle_producto}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right Column: Order Info Metadata Sheet */}
                          <div style={{ borderLeft: '1px solid var(--c-border-light)', paddingLeft: 24 }}>
                            <h4 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--c-border-light)', paddingBottom: 10 }}>
                              <Info size={16} style={{ color: 'var(--c-brand)' }} />
                              Ficha de la Orden
                            </h4>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                              <div>
                                <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>Entidad Compradora</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{order.nombre_entidad || '—'}</span>
                                {order.ruc_entidad && (
                                  <span style={{ fontSize: 11, color: 'var(--c-text-secondary)', display: 'block', marginTop: 2, fontFamily: 'monospace' }}>RUC: {order.ruc_entidad}</span>
                                )}
                              </div>

                              <div>
                                <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>Proveedor Adjudicado</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{order.nombre_proveedor || '—'}</span>
                                {order.ruc_proveedor && (
                                  <span style={{ fontSize: 11, color: 'var(--c-text-secondary)', display: 'block', marginTop: 2, fontFamily: 'monospace' }}>RUC: {order.ruc_proveedor}</span>
                                )}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                  <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>Catálogo</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-secondary)' }}>{order.catalogo || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>Categoría</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-secondary)' }}>{order.categoria || '—'}</span>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                  <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>Acuerdo Marco</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-secondary)' }}>{order.codigo_acuerdo_marco || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>Moneda / Plazo</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-secondary)' }}>
                                    {order.moneda} / {order.plazo_entrega_dias != null ? `${order.plazo_entrega_dias} días` : '—'}
                                  </span>
                                </div>
                              </div>

                              {order.logistica_entrega && (
                                <div style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 12 }}>
                                  <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, fontWeight: 600 }}>
                                    <MapPin size={12} style={{ color: 'var(--c-brand)' }} />
                                    Lugar de Entrega
                                  </span>
                                  <span style={{ fontSize: 12, color: 'var(--c-text-secondary)', lineHeight: 1.4, display: 'block' }}>
                                    {order.logistica_entrega}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrderTable;
