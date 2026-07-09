import React, { useState } from 'react';
import { ExternalLink, FileText, Building2, User, Calendar, Download, ArrowUp, ArrowDown, ChevronsUpDown, ChevronDown, ChevronUp, Package, MapPin, ClipboardList, Info } from 'lucide-react';
import { purchaseOrdersApi } from '../../services/api';
import HeaderFilter from '../HeaderFilter';

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    <div className="card" style={{ marginTop: 16, overflow: 'visible' }}>
      <div className="table-wrap">
        <table
          className="data-table"
          style={{ fontSize: '0.85rem', tableLayout: 'fixed', minWidth: 1000, borderCollapse: 'collapse' }}
        >
          <colgroup>
            <col style={{ width: 45 }} />  {/* Expand/Collapse Chevron */}
            <col style={{ width: 140 }} /> {/* Nro. Orden */}
            <col style={{ width: 180 }} /> {/* Entidad */}
            <col style={{ width: 180 }} /> {/* Proveedor / Marca */}
            <col style={{ width: 95 }}  /> {/* Publicación */}
            <col style={{ width: 230 }} /> {/* Productos (Resumen) */}
            <col style={{ width: 110 }} /> {/* Total */}
            <col style={{ width: 100 }} /> {/* Estado */}
            <col style={{ width: 50 }}  /> {/* Doc */}
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: 45 }}></th>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Package size={12} />
                  Productos
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
                    <td style={{ textAlign: 'center', padding: '10px 0' }}>
                      {isExpanded ? (
                        <ChevronUp size={16} style={{ color: 'var(--c-brand)' }} />
                      ) : (
                        <ChevronDown size={16} style={{ color: 'var(--c-text-tertiary)' }} />
                      )}
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, color: 'var(--c-brand)' }}>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                          <User size={13} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-secondary)' }} title={order.nombre_proveedor}>
                            {order.nombre_proveedor}
                          </span>
                        </div>
                        {order.marca && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: 'var(--c-brand)',
                            background: 'rgba(37,99,235,0.08)', borderRadius: 4,
                            padding: '1px 5px', alignSelf: 'flex-start', letterSpacing: 0.3,
                            textTransform: 'uppercase'
                          }}>
                            {order.marca}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-text-secondary)', fontSize: 11 }}>
                        <Calendar size={11} style={{ flexShrink: 0 }} />
                        {order.fecha_publicacion
                          ? new Date(order.fecha_publicacion).toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric'})
                          : '—'}
                      </div>
                    </td>
                    <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--c-text-secondary)', fontWeight: 500 }}>
                        {hasProds 
                          ? `${prods.length} ${prods.length === 1 ? 'ítem' : 'ítems'} (${prods.map(p => p.nro_parte).join(', ')})`
                          : order.nro_parte || '—'}
                      </span>
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
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
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

                  {isExpanded && (
                    <tr style={{ background: '#f8fafc' }}>
                      <td colSpan={9} style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)' }}>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '3fr 2fr', 
                          gap: 20,
                          background: '#fff',
                          border: '1px solid var(--c-border)',
                          borderRadius: 8,
                          padding: 16,
                          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
                        }}>
                          {/* Left Column: Product detail list */}
                          <div>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--c-border-light)', paddingBottom: 6 }}>
                              <ClipboardList size={14} style={{ color: 'var(--c-brand)' }} />
                              Detalle de Ítems / Productos
                            </h4>
                            
                            {hasProds ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {prods.map((p, idx) => (
                                  <div key={idx} style={{
                                    border: '1px solid var(--c-border-light)',
                                    borderRadius: 6,
                                    overflow: 'hidden',
                                    background: '#fafbfc'
                                  }}>
                                    <div style={{
                                      padding: '6px 10px',
                                      background: '#f1f5f9',
                                      borderBottom: '1px solid var(--c-border-light)',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{
                                          fontSize: 9, padding: '2px 5px', borderRadius: 3,
                                          background: 'rgba(37,99,235,0.1)', color: 'var(--c-brand)',
                                          fontWeight: 700, letterSpacing: 0.4
                                        }}>P/N</span>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--c-text)' }}>
                                          {p.nro_parte || '—'}
                                        </span>
                                      </div>
                                    </div>
                                    <div style={{
                                      padding: '8px 10px',
                                      display: 'grid',
                                      gridTemplateColumns: '1fr 1fr',
                                      gap: 12
                                    }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase' }}>Precio unitario</span>
                                        <span style={{ fontWeight: 500, color: 'var(--c-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                                          S/ {fmt(p.precio_unitario)}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                                        <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase' }}>Subtotal (Sin IGV)</span>
                                        <span style={{ fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
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
                              <div style={{ marginTop: 12 }}>
                                <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Descripción Completa del Scraper</span>
                                <div style={{ fontSize: 11, color: 'var(--c-text-secondary)', padding: 8, background: '#f8fafc', borderRadius: 4, border: '1px solid var(--c-border-light)', lineHeight: 1.4 }}>
                                  {order.detalle_producto}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right Column: Order Info Metadata Sheet */}
                          <div style={{ borderLeft: '1px solid var(--c-border-light)', paddingLeft: 20 }}>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--c-border-light)', paddingBottom: 6 }}>
                              <Info size={14} style={{ color: 'var(--c-brand)' }} />
                              Ficha de la Orden
                            </h4>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div>
                                <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block' }}>Entidad Compradora</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)' }}>{order.nombre_entidad || '—'}</span>
                                {order.ruc_entidad && (
                                  <span style={{ fontSize: 10, color: 'var(--c-text-secondary)', display: 'block', marginTop: 2 }}>RUC: {order.ruc_entidad}</span>
                                )}
                              </div>

                              <div>
                                <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block' }}>Proveedor Adjudicado</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)' }}>{order.nombre_proveedor || '—'}</span>
                                {order.ruc_proveedor && (
                                  <span style={{ fontSize: 10, color: 'var(--c-text-secondary)', display: 'block', marginTop: 2 }}>RUC: {order.ruc_proveedor}</span>
                                )}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                  <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block' }}>Catálogo</span>
                                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-text-secondary)' }}>{order.catalogo || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block' }}>Categoría</span>
                                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-text-secondary)' }}>{order.categoria || '—'}</span>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                  <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block' }}>Acuerdo Marco</span>
                                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-text-secondary)' }}>{order.codigo_acuerdo_marco || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'block' }}>Moneda / Plazo</span>
                                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-text-secondary)' }}>
                                    {order.moneda} / {order.plazo_entrega_dias != null ? `${order.plazo_entrega_dias} días` : '—'}
                                  </span>
                                </div>
                              </div>

                              {order.logistica_entrega && (
                                <div style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 10 }}>
                                  <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                    <MapPin size={10} />
                                    Lugar de Entrega
                                  </span>
                                  <span style={{ fontSize: 11, color: 'var(--c-text-secondary)', lineHeight: 1.3, display: 'block' }}>
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
