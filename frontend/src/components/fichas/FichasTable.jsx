import React from 'react';
import { ExternalLink, Package, FileSearch, Tag, Image } from 'lucide-react';

const STATUS_CLASS = {
  ofertada: 'badge-success',
  suspendida: 'badge-warning',
};

const badgeClass = (estado) => {
  if (!estado) return 'badge-info';
  const key = estado.toLowerCase();
  return STATUS_CLASS[key] || 'badge-info';
};

const FichasTable = ({ fichas, loading }) => {
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

  // Detect normalised column names from first row
  const sample = fichas[0];
  const nroParteKey = Object.keys(sample).find((k) => k.includes('nro_parte') || k.includes('cdigo') || k.includes('codigo'));
  const descKey = Object.keys(sample).find((k) => k.includes('descrip'));
  const catKey = Object.keys(sample).find((k) => k.startsWith('cat') && !k.includes('logo'));
  const catalogoKey = Object.keys(sample).find((k) => k.includes('logo') || k === 'catlogo' || k === 'catálogo');

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nro. Parte / Código</th>
              <th>Descripción</th>
              <th>Marca</th>
              <th>Categoría</th>
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
                    style={{
                      maxWidth: 320,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--c-text-secondary)',
                      fontSize: 12,
                    }}
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
                    style={{
                      maxWidth: 160,
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
                  <span className={`badge ${badgeClass(f.estado_ficha_producto)}`}>
                    {f.estado_ficha_producto || 'S/E'}
                  </span>
                </td>
                <td>
                  {f.ficha_tcnica || f.ficha_técnica ? (
                    <a
                      href={f.ficha_tcnica || f.ficha_técnica}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm"
                      title="Ver ficha técnica (PDF)"
                    >
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span style={{ color: 'var(--c-text-tertiary)', fontSize: 12 }}>—</span>
                  )}
                </td>
                <td>
                  {f.imagen ? (
                    <a
                      href={f.imagen}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm"
                      title="Ver imagen"
                    >
                      <Image size={14} />
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

export default FichasTable;
