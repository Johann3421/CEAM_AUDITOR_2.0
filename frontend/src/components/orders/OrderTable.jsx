import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, FileText, Building2, User, Calendar, Download, Filter, Search, Check } from 'lucide-react';
import { purchaseOrdersApi } from '../../services/api';

const HeaderFilter = ({ title, column, currentFilter, onFilterChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const popoverRef = useRef();

  useEffect(() => {
    if (isOpen && options.length === 0) {
      setLoading(true);
      purchaseOrdersApi.getColumnFilter(column)
        .then(res => setOptions(res.data.values))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, column, options.length]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative' }}>
      {title}
      <div 
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        style={{ 
          cursor: 'pointer', 
          padding: 4, 
          borderRadius: 4, 
          background: currentFilter || isOpen ? 'var(--c-brand-light)' : 'transparent',
          color: currentFilter ? 'var(--c-brand)' : 'var(--c-text-tertiary)',
          display: 'flex', alignItems: 'center'
        }}
      >
        <Filter size={12} strokeWidth={currentFilter ? 3 : 2} />
      </div>
      
      {isOpen && (
        <div ref={popoverRef} className="card fade-up" style={{
          position: 'absolute', top: 24, left: 0, zIndex: 100, 
          width: 260, minHeight: 100, maxHeight: 350, display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: 0, overflow: 'hidden'
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={14} color="var(--c-text-tertiary)" />
            <input 
              autoFocus
              type="text" 
              placeholder="Buscar..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: 13 }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {loading ? (
              <div style={{ padding: '12px', textAlign: 'center', fontSize: 12, color: 'var(--c-text-tertiary)' }}>Cargando...</div>
            ) : (
              <>
                <div 
                  onClick={() => { onFilterChange(''); setIsOpen(false); }}
                  style={{ 
                    padding: '6px 16px', fontSize: 12, cursor: 'pointer', 
                    background: !currentFilter ? 'var(--c-bg)' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8
                  }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: !currentFilter ? 'var(--c-brand)' : 'transparent' }}>
                    {!currentFilter && <Check size={10} color="#fff" />}
                  </div>
                  (Seleccionar todo)
                </div>
                {filteredOptions.map((opt, idx) => {
                  const isSelected = currentFilter === opt;
                  return (
                    <div 
                      key={idx}
                      onClick={() => { onFilterChange(opt); setIsOpen(false); }}
                      style={{ 
                        padding: '6px 16px', fontSize: 12, cursor: 'pointer', 
                        display: 'flex', alignItems: 'flex-start', gap: 8
                      }}
                    >
                      <div style={{ width: 14, height: 14, marginTop: 2, flexShrink: 0, borderRadius: 3, border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSelected ? 'var(--c-brand)' : 'transparent' }}>
                        {isSelected && <Check size={10} color="#fff" />}
                      </div>
                      <span style={{ lineHeight: 1.3 }}>{opt}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const OrderTable = ({ orders, loading, filters = {}, onFilterChange = () => {} }) => {
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
              <th>
                <HeaderFilter 
                  title="Entidad" 
                  column="entidad" 
                  currentFilter={filters.entidad}
                  onFilterChange={(v) => onFilterChange({ entidad: v })}
                />
              </th>
              <th>
                <HeaderFilter 
                  title="Proveedor" 
                  column="proveedor" 
                  currentFilter={filters.proveedor} 
                  onFilterChange={(v) => onFilterChange({ proveedor: v })}
                />
              </th>
              <th style={{ width: 90 }}>Publicación</th>
              <th style={{ minWidth: 260 }}>Productos (P/N - Unitario - Total)</th>
              <th style={{ textAlign: 'right', width: 100 }}>Total (PEN)</th>
              <th style={{ width: 100 }}>
                <HeaderFilter 
                  title="Estado" 
                  column="estado" 
                  currentFilter={filters.estadoOrden}
                  onFilterChange={(v) => onFilterChange({ estadoOrden: v })}
                />
              </th>
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
