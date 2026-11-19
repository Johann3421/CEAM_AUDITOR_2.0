import React, { useState } from 'react';
import {
  X, ExternalLink, Image as ImageIcon, FileText, Check, Copy,
  DollarSign, ShoppingBag, ShieldCheck, Tag, Calendar, Layers,
  TrendingUp, Info
} from 'lucide-react';

/**
 * Parsea el texto estándar de descripción de ficha de Perú Compras
 * en pares clave-valor limpios.
 */
function parseDescriptionFeatures(desc) {
  if (!desc) return [];
  const text = String(desc).trim();

  // Si tiene el formato clásico "CATEGORIA : CAMPO: VALOR CAMPO: VALOR..."
  const clean = text.includes(' : ') ? text.split(' : ').slice(1).join(' : ') : text;
  
  // Buscar patrones CAMPO: VALOR
  const regex = /([A-ZÁÉÍÓÚÑ0-9\.\s]+?):\s*([^:]+?)(?=(?:\s+[A-ZÁÉÍÓÚÑ0-9\.\s]+?:|$))/g;
  const features = [];
  let match;

  while ((match = regex.exec(clean)) !== null) {
    const key = match[1].trim();
    let val = match[2].trim();

    // Limpiar restos si pegó al siguiente campo
    if (key && val && key.length < 35) {
      features.push({ key, value: val });
    }
  }

  // Fallback si la descripción no sigue el patrón CAMPO:
  if (features.length === 0) {
    const parts = clean.split(/[,;\.]\s+/).filter(p => p.trim().length > 0);
    return parts.map(p => {
      const kv = p.split(/:\s*/);
      return kv.length > 1 ? { key: kv[0].trim(), value: kv.slice(1).join(': ').trim() } : { key: 'Detalle', value: p.trim() };
    });
  }

  return features;
}

const formatMoney = (amount) => {
  if (amount == null || isNaN(amount)) return '—';
  const n = Number(amount);
  if (n === 0) return 'S/ 0.00';
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const s = String(dateStr).slice(0, 10);
    const parts = s.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  } catch (_) {}
  return String(dateStr);
};

export default function FichaDetailModal({ ficha, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!ficha) return null;

  const nroParte = ficha.nro_parte_o_código_único_de_identificación ||
                   ficha.nro_parte_o_cdigo_nico_de_identificacin ||
                   ficha.nro_parte || '—';
  const desc = ficha.descripción_fichaproducto ||
               ficha.descripcin_fichaproducto ||
               ficha.descripcion || '';
  const cat = ficha.categoría || ficha.categora || ficha.categoria || '—';
  const catalogo = ficha.catálogo || ficha.catalogo || '—';
  const acuerdo = ficha.acuerdo_marco || 'EXT-CE-2022-5';
  const marca = ficha.marca || '—';
  const estado = ficha.estado_ficha_producto || 'OFERTADA';
  const pdfUrl = ficha.ficha_tcnica || ficha.ficha_técnica || null;
  const imgUrl = ficha.imagen || null;

  const montoContratado = Number(ficha.monto_contratado || 0);
  const cantOcam = Number(ficha.cant_ocam || 0);

  // Características estructuradas
  const features = parseDescriptionFeatures(desc);

  // Copiar especificaciones al portapapeles en formato limpio
  const handleCopySpecs = () => {
    let textToCopy = `FICHA TÉCNICA: ${nroParte} - ${marca}\n`;
    textToCopy += `CATEGORÍA: ${cat}\n`;
    textToCopy += `DESCRIPCIÓN:\n${desc}\n\n`;
    if (features.length > 0) {
      textToCopy += `CARACTERÍSTICAS:\n`;
      features.forEach(f => {
        textToCopy += `• ${f.key}: ${f.value}\n`;
      });
    }
    if (montoContratado > 0) {
      textToCopy += `\nMONTO CONTRATADO: ${formatMoney(montoContratado)} (${cantOcam} OCAMs)\n`;
    }
    if (pdfUrl) {
      textToCopy += `PDF OFICIAL: ${pdfUrl}\n`;
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--c-surface, #ffffff)',
          color: 'var(--c-text, #1e293b)',
          borderRadius: 14,
          maxWidth: 820,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--c-border, #e2e8f0)',
          overflow: 'hidden',
          animation: 'fadeUp .2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--c-border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--c-bg-subtle, #f8fafc)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              className={`badge ${estado.toLowerCase() === 'ofertada' ? 'badge-success' : 'badge-warning'}`}
              style={{ fontWeight: 700, fontSize: '0.75rem', padding: '4px 10px', borderRadius: 20 }}
            >
              {estado}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--c-text-secondary, #64748b)', fontWeight: 600 }}>
              {cat}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary, #94a3b8)' }}>• {acuerdo}</span>
          </div>

          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--c-text-tertiary, #94a3b8)',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body scrollable */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Main info row: Image + Title/Part */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {imgUrl ? (
              <div
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 10,
                  border: '1px solid var(--c-border, #e2e8f0)',
                  overflow: 'hidden',
                  background: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <img
                  src={imgUrl}
                  alt={nroParte}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            ) : (
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 10,
                  background: 'var(--c-bg-subtle, #f1f5f9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--c-text-tertiary, #94a3b8)',
                  flexShrink: 0,
                }}
              >
                <ImageIcon size={36} />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--c-brand, #2563eb)' }}>
                  {marca}
                </span>
                <span style={{ color: 'var(--c-border, #cbd5e1)' }}>|</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.9rem', color: 'var(--c-text, #0f172a)' }}>
                  {nroParte}
                </span>
              </div>

              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.4, margin: '0 0 10px 0', color: 'var(--c-text, #0f172a)' }}>
                {desc.split(' : ')[0] || desc.slice(0, 80)}
              </h2>

              {/* Botones de acción rápida */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                {pdfUrl && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.8rem',
                      textDecoration: 'none',
                    }}
                  >
                    <FileText size={14} /> Ficha Técnica Oficial (PDF) <ExternalLink size={12} />
                  </a>
                )}

                <button
                  onClick={handleCopySpecs}
                  className="btn btn-sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.8rem',
                    background: copied ? 'rgba(22, 163, 74, 0.12)' : 'var(--c-surface, #fff)',
                    color: copied ? '#16a34a' : 'var(--c-text, #1e293b)',
                    borderColor: copied ? '#16a34a' : 'var(--c-border, #cbd5e1)',
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? '¡Copiado al portapapeles!' : 'Copiar para Cotizador'}
                </button>
              </div>
            </div>
          </div>

          {/* KPI Cards: Contratación Oficial Perú Compras */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            <div
              style={{
                background: 'var(--c-bg-subtle, #f8fafc)',
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--c-border, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#059669', marginBottom: 6 }}>
                <DollarSign size={18} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Monto Contratado Total
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-text, #0f172a)' }}>
                {formatMoney(montoContratado)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--c-text-tertiary, #94a3b8)', marginTop: 2 }}>
                {montoContratado > 0 ? 'Compras formales registradas en CEAM' : 'Sin órdenes emitidas aún'}
              </div>
            </div>

            <div
              style={{
                background: 'var(--c-bg-subtle, #f8fafc)',
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--c-border, #e2e8f0)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2563eb', marginBottom: 6 }}>
                <ShoppingBag size={18} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Órdenes de Compra (OCAM)
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-text, #0f172a)' }}>
                {cantOcam > 0 ? `${cantOcam.toLocaleString('es-PE')} órdenes` : '0 órdenes'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--c-text-tertiary, #94a3b8)', marginTop: 2 }}>
                {cantOcam > 0 && montoContratado > 0
                  ? `Promedio: ${formatMoney(montoContratado / cantOcam)} por orden`
                  : 'Ficha sin compras en el visor'}
              </div>
            </div>

            {ficha.precio_min != null && (
              <div
                style={{
                  background: 'var(--c-bg-subtle, #f8fafc)',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid var(--c-border, #e2e8f0)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d97706', marginBottom: 6 }}>
                  <TrendingUp size={18} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Rango Histórico Órdenes
                  </span>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--c-text, #0f172a)' }}>
                  {formatMoney(ficha.precio_min)} - {formatMoney(ficha.precio_max)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--c-text-tertiary, #94a3b8)', marginTop: 2 }}>
                  Mediana: {formatMoney(ficha.precio_mediana)} ({ficha.n_ordenes_precio || 0} compras)
                </div>
              </div>
            )}
          </div>

          {/* Desglose de Características Técnicas */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, color: 'var(--c-text, #0f172a)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={16} /> Especificaciones Técnicas Estructuradas
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary, #94a3b8)' }}>
                {features.length} campos detectados
              </span>
            </div>

            <div
              style={{
                border: '1px solid var(--c-border, #e2e8f0)',
                borderRadius: 10,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <tbody>
                  {features.map((f, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: i < features.length - 1 ? '1px solid var(--c-border-light, #f1f5f9)' : 'none',
                        background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-subtle, #f8fafc)',
                      }}
                    >
                      <td
                        style={{
                          padding: '8px 14px',
                          fontWeight: 600,
                          color: 'var(--c-text-secondary, #475569)',
                          width: '35%',
                          verticalAlign: 'top',
                        }}
                      >
                        {f.key}
                      </td>
                      <td
                        style={{
                          padding: '8px 14px',
                          color: 'var(--c-text, #0f172a)',
                          width: '65%',
                        }}
                      >
                        {f.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Descripción cruda completa */}
          <div style={{ background: 'var(--c-bg-subtle, #f8fafc)', padding: '12px 16px', borderRadius: 8, fontSize: '0.78rem', color: 'var(--c-text-secondary, #64748b)', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>Descripción Oficial Completa:</span>
            {desc}
          </div>

          {/* Footer info / Trazabilidad */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--c-text-tertiary, #94a3b8)', flexWrap: 'wrap', gap: 8, borderTop: '1px solid var(--c-border-light, #f1f5f9)', paddingTop: 10 }}>
            <span>Primera carga: {formatDate(ficha.fecha_primera_carga)}</span>
            <span>Última extracción: {formatDate(ficha.fecha_extraccion)}</span>
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--c-border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--c-bg-subtle, #f8fafc)',
          }}
        >
          <button onClick={onClose} className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '0.85rem' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
