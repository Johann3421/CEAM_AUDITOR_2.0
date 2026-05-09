import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Package, FileSearch, Tag, Image, ChevronDown, Search, X, Check } from 'lucide-react';
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
const FichasTable = ({ fichas, loading, onColFilter, colFilters = {} }) => {
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
              <th>Estado</th>
              <th style={{ width: 50 }}>PDF</th>
              <th style={{ width: 50 }}>Img</th>
            </tr>
          </thead>
          <tbody>
            {fichas.map((f, idx) => (
              <tr key={f[nroParteKey] || idx} className="fade-up">
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--c-brand)', fontFamily: 'monospace', fontSize: 12 }}>
                    {f[nroParteKey] || '—'}
                  </span>
                </td>
                <td>
                  <div
                    style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-secondary)', fontSize: 12 }}
                    title={f[descKey]}
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
                    style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', fontSize: 12, color: 'var(--c-text-secondary)' }}
                    title={f[catKey] || f.categora || f.categoría}
                  >
                    {f[catKey] || f.categora || f.categoría || '—'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${badgeClass(f.estado_ficha_producto)}`}>
                    {f.estado_ficha_producto || 'S/E'}
                  </span>
                </td>
                <td>
                  {f.ficha_tcnica || f.ficha_técnica ? (
                    <a href={f.ficha_tcnica || f.ficha_técnica} target="_blank" rel="noopener noreferrer" className="btn btn-sm" title="Ver ficha técnica (PDF)">
                      <ExternalLink size={14} />
                    </a>
                  ) : <span style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }}>—</span>}
                </td>
                <td>
                  {f.imagen ? (
                    <a href={f.imagen} target="_blank" rel="noopener noreferrer" className="btn btn-sm" title="Ver imagen">
                      <Image size={14} />
                    </a>
                  ) : <span style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FichasTable;
