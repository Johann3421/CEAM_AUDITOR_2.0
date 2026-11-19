import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ExternalLink, Package, FileSearch, Tag, Image, ChevronDown,
  Search, X, Check, FileText, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { fichasProductoApi } from '../../services/api';

const STATUS_CLASS = {
  ofertada:   'badge-success',
  suspendida: 'badge-warning',
};
const badgeClass = (e) => STATUS_CLASS[e?.toLowerCase()] || 'badge-info';

/* ── Excel-style column filter dropdown ───────────────────── */
const ColFilter = ({ colName, apiKey, activeValue, onApply, onClear }) => {
  const [open, setOpen]     = useState(false);
  const [values, setValues] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(activeValue || '');
  const [pos, setPos]       = useState({ top: 0, left: 0, width: 200 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  const active = !!activeValue;

  const openDropdown = async () => {
    if (open) { setOpen(false); return; }
    // position relative to button
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top:   rect.bottom + window.scrollY + 4,
      left:  rect.left   + window.scrollX,
      width: Math.max(220, rect.width),
    });
    setOpen(true);
    if (values.length === 0) {
      try {
        const res = await fichasProductoApi.getColumnFilter(apiKey);
        setValues(res.data.values || []);
      } catch { setValues([]); }
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target) &&
        btnRef.current  && !btnRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = values.filter(v => v.toLowerCase().includes(search.toLowerCase()));

  const apply = () => {
    onApply(selected);
    setOpen(false);
  };
  const clear = () => {
    setSelected('');
    onClear();
    setOpen(false);
  };

  const dropdown = open && createPortal(
    <div
      ref={dropRef}
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
        background: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
      }}
    >
      {/* Search */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--c-border-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Search size={13} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar…"
          style={{
            border: 'none', outline: 'none', width: '100%',
            fontSize: 12, fontFamily: 'inherit', background: 'transparent',
          }}
        />
        {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--c-text-tertiary)', display: 'flex' }}><X size={12} /></button>}
      </div>

      {/* List */}
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 10px', color: 'var(--c-text-tertiary)', fontSize: 12, textAlign: 'center' }}>Sin resultados</div>
        ) : filtered.map(v => (
          <div
            key={v}
            onClick={() => setSelected(v === selected ? '' : v)}
            style={{
              padding: '7px 10px',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: selected === v ? 'var(--c-brand-light)' : 'transparent',
              color:      selected === v ? 'var(--c-brand)' : 'var(--c-text)',
            }}
            onMouseEnter={e => { if (selected !== v) e.currentTarget.style.background = 'var(--c-bg)'; }}
            onMouseLeave={e => { if (selected !== v) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ width: 14, flexShrink: 0 }}>
              {selected === v && <Check size={12} />}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--c-border-light)', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={clear}
          className="btn btn-sm"
          style={{ fontSize: 11 }}
        >
          Limpiar
        </button>
        <button
          onClick={apply}
          className="btn btn-sm btn-primary"
          style={{ fontSize: 11 }}
          disabled={!selected}
        >
          Aplicar
        </button>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={openDropdown}
        title={active ? `Filtro activo: ${activeValue}` : 'Filtrar por esta columna'}
        style={{
          background: active ? 'var(--c-brand)' : 'transparent',
          color:      active ? '#fff' : 'var(--c-text-tertiary)',
          border:     active ? 'none' : 'none',
          borderRadius: 4,
          cursor: 'pointer',
          padding: '2px 4px',
          display: 'inline-flex',
          alignItems: 'center',
          marginLeft: 4,
          transition: 'all .15s',
        }}
      >
        <ChevronDown size={12} />
      </button>
      {dropdown}
    </>
  );
};

/* ── Main table ───────────────────────────────────────────── */
const FichasTable = ({
  fichas,
  loading,
  onColFilter,
  colFilters = {},
  sortBy,
  sortDir,
  onSort,
  onSelectFicha,
}) => {
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

  if (!fichas || fichas.length === 0) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="empty-state">
          <FileSearch size={40} />
          <p>No se encontraron fichas con los filtros actuales.</p>
        </div>
      </div>
    );
  }

  const sample = fichas[0];
  const nroParteKey = Object.keys(sample).find(k => k.includes('nro_parte') || k.includes('cdigo') || k.includes('codigo'));
  const descKey     = Object.keys(sample).find(k => k.includes('descrip'));
  const catKey      = Object.keys(sample).find(k => k.startsWith('cat') && !k.includes('logo'));

  const renderSortIcon = (field) => {
    if (sortBy !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4 }} />;
    }
    return sortDir === 'asc'
      ? <ArrowUp size={13} style={{ color: 'var(--c-brand)', marginLeft: 4 }} />
      : <ArrowDown size={13} style={{ color: 'var(--c-brand)', marginLeft: 4 }} />;
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nro. Parte / Código</th>
              <th>Descripción</th>
              <th>
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  Marca
                  <ColFilter
                    colName="marca"
                    apiKey="marca"
                    activeValue={colFilters.marca || ''}
                    onApply={v => onColFilter('marca', v)}
                    onClear={() => onColFilter('marca', '')}
                  />
                </span>
              </th>
              <th>
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  Categoría
                  <ColFilter
                    colName="categoría"
                    apiKey="categoria"
                    activeValue={colFilters.categoria || ''}
                    onApply={v => onColFilter('categoria', v)}
                    onClear={() => onColFilter('categoria', '')}
                  />
                </span>
              </th>
              <th>
                <button
                  type="button"
                  onClick={() => onSort && onSort('monto_contratado')}
                  style={{
                    background: 'none',
                    border: 'none',
                    font: 'inherit',
                    color: sortBy === 'monto_contratado' ? 'var(--c-brand)' : 'inherit',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: 0,
                    fontWeight: 600,
                  }}
                  title="Ordenar por Monto Contratado"
                >
                  Monto Contratado
                  {renderSortIcon('monto_contratado')}
                </button>
              </th>
              <th>
                <button
                  type="button"
                  onClick={() => onSort && onSort('cant_ocam')}
                  style={{
                    background: 'none',
                    border: 'none',
                    font: 'inherit',
                    color: sortBy === 'cant_ocam' ? 'var(--c-brand)' : 'inherit',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: 0,
                    fontWeight: 600,
                  }}
                  title="Ordenar por Cantidad de Órdenes OCAM"
                >
                  OCAM
                  {renderSortIcon('cant_ocam')}
                </button>
              </th>
              <th>Estado</th>
              <th style={{ width: 80, textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {fichas.map((f, idx) => {
              const part = f[nroParteKey] || '—';
              const monto = Number(f.monto_contratado || 0);
              const ocam = Number(f.cant_ocam || 0);
              const pdf = f.ficha_tcnica || f.ficha_técnica;

              return (
                <tr key={part || idx} className="fade-up">
                  <td>
                    <button
                      type="button"
                      onClick={() => onSelectFicha && onSelectFicha(f)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: 'var(--c-brand)',
                        fontFamily: 'monospace',
                        fontSize: 12,
                      }}
                      title="Ver detalle completo"
                    >
                      {part}
                    </button>
                  </td>
                  <td>
                    <div
                      style={{
                        maxWidth: 280,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--c-text-secondary)',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                      title={f[descKey]}
                      onClick={() => onSelectFicha && onSelectFicha(f)}
                    >
                      {f[descKey] || '—'}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag size={12} style={{ color: 'var(--c-text-tertiary)', flexShrink: 0 }} />
                      <span style={{ fontSize: 12 }}>{f.marca || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        maxWidth: 140,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                        fontSize: 12,
                        color: 'var(--c-text-secondary)',
                      }}
                      title={f[catKey] || f.categora || f.categoría}
                    >
                      {f[catKey] || f.categora || f.categoría || '—'}
                    </span>
                  </td>
                  <td>
                    {monto > 0 ? (
                      <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--c-text)' }}>
                        S/ {monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td>
                    {ocam > 0 ? (
                      <span
                        className="badge badge-info"
                        style={{ fontWeight: 700, fontSize: 11, padding: '2px 8px' }}
                        title={`${ocam.toLocaleString('es-PE')} órdenes formalizadas`}
                      >
                        {ocam.toLocaleString('es-PE')}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }}>0</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${badgeClass(f.estado_ficha_producto)}`}>
                      {f.estado_ficha_producto || 'S/E'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => onSelectFicha && onSelectFicha(f)}
                        className="btn btn-sm"
                        style={{ padding: '3px 7px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                        title="Ver ficha técnica, KPIs y especificaciones"
                      >
                        <FileText size={13} />
                        Detalles
                      </button>

                      {pdf && (
                        <a
                          href={pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          style={{ padding: '3px 6px', color: 'var(--c-text-secondary)' }}
                          title="Ficha técnica oficial (PDF)"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FichasTable;
