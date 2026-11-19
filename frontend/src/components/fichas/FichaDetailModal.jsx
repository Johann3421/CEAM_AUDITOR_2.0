import React, { useState } from 'react';
import {
  X, ExternalLink, Image as ImageIcon, FileText, Check, Copy,
  DollarSign, ShoppingBag, ShieldCheck, Tag, Calendar, Layers,
  TrendingUp, Cpu, Wifi, Monitor, CheckCircle, ArrowRight
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
      return kv.length > 1
        ? { key: kv[0].trim(), value: kv.slice(1).join(': ').trim() }
        : { key: 'Detalle', value: p.trim() };
    });
  }

  return features;
}

/**
 * Ley de Miller (Chunking): Agrupa las especificaciones en 4 bloques
 * cohesivos de 3 a 5 items cada uno para reducir carga cognitiva.
 */
function chunkFeatures(features) {
  const chunks = {
    hardware:     { title: 'Hardware Principal',       icon: Cpu,         items: [] },
    connectivity: { title: 'Conectividad & Puertos',   icon: Wifi,        items: [] },
    warranty:     { title: 'Garantía & Sostenibilidad', icon: ShieldCheck, items: [] },
    peripherals:  { title: 'Software & Periféricos',   icon: Monitor,     items: [] },
    others:       { title: 'Otros Atributos',          icon: Layers,      items: [] },
  };

  features.forEach(f => {
    const k = f.key.toUpperCase();
    if (k.includes('PROCESADOR') || k.includes('RAM') || k.includes('ALMACENAMIENTO') || k.includes('DISCO') || k.includes('MODELO')) {
      chunks.hardware.items.push(f);
    } else if (k.includes('LAN') || k.includes('WLAN') || k.includes('WIFI') || k.includes('HDMI') || k.includes('VGA') || k.includes('USB') || k.includes('BLUETOOTH') || k.includes('PUERTO') || k.includes('VIDEO')) {
      chunks.connectivity.items.push(f);
    } else if (k.includes('GARANTIA') || k.includes('G. F') || k.includes('RAEE') || k.includes('EMPAQUE')) {
      chunks.warranty.items.push(f);
    } else if (k.includes('SIST') || k.includes('OPERATIVO') || k.includes('SUITE') || k.includes('OFIMATICA') || k.includes('TECLADO') || k.includes('MOUSE') || k.includes('OPTICA')) {
      chunks.peripherals.items.push(f);
    } else {
      chunks.others.items.push(f);
    }
  });

  return Object.values(chunks).filter(c => c.items.length > 0);
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

  // Características estructuradas y chunking (Ley de Miller)
  const rawFeatures = parseDescriptionFeatures(desc);
  const featureChunks = chunkFeatures(rawFeatures);

  // Copiar especificaciones al portapapeles en formato limpio
  const handleCopySpecs = () => {
    let textToCopy = `FICHA TÉCNICA: ${nroParte} - ${marca}\n`;
    textToCopy += `CATEGORÍA: ${cat}\n`;
    textToCopy += `DESCRIPCIÓN:\n${desc}\n\n`;
    if (rawFeatures.length > 0) {
      textToCopy += `CARACTERÍSTICAS TÉCNICAS:\n`;
      rawFeatures.forEach(f => {
        textToCopy += `• ${f.key}: ${f.value}\n`;
      });
    }
    if (montoContratado > 0) {
      textToCopy += `\nMONTO CONTRATADO TOTAL: ${formatMoney(montoContratado)} (${cantOcam} OCAMs formalizadas)\n`;
    }
    if (pdfUrl) {
      textToCopy += `ENLACE PDF OFICIAL: ${pdfUrl}\n`;
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
        padding: '16px',
      }}
    >
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--c-surface, #ffffff)',
          color: 'var(--c-text, #1e293b)',
          borderRadius: 14,
          maxWidth: 860,
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid var(--c-border, #e2e8f0)',
          overflow: 'hidden',
          animation: 'fadeUp .2s ease-out',
        }}
      >
        {/* Header (Ley de Jakob & Fitts: botón de cierre amplio en esquina) */}
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
            <span style={{ fontSize: '0.82rem', color: 'var(--c-text-secondary, #64748b)', fontWeight: 600 }}>
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
              padding: 8,
              minWidth: 38,
              minHeight: 38,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg, #f1f5f9)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body scrollable con Chunks limpios */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          
          {/* Main Hero Card: Img + Info */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              background: 'var(--c-bg-subtle, #f8fafc)',
              padding: 16,
              borderRadius: 12,
              border: '1px solid var(--c-border, #e2e8f0)',
            }}
          >
            {imgUrl ? (
              <div
                style={{
                  width: 130,
                  height: 130,
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
                  background: 'var(--c-surface, #fff)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--c-text-tertiary, #94a3b8)',
                  flexShrink: 0,
                  border: '1px solid var(--c-border, #e2e8f0)',
                }}
              >
                <ImageIcon size={32} />
              </div>
            )}

            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--c-brand, #2563eb)' }}>
                  {marca}
                </span>
                <span style={{ color: 'var(--c-border, #cbd5e1)' }}>|</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: 'var(--c-text, #0f172a)' }}>
                  {nroParte}
                </span>
              </div>

              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.4, margin: '0 0 10px 0', color: 'var(--c-text, #0f172a)' }}>
                {desc.split(' : ')[0] || desc.slice(0, 80)}
              </h2>

              <p style={{ fontSize: '0.8rem', color: 'var(--c-text-secondary, #64748b)', margin: 0, lineHeight: 1.4 }}>
                Catálogo: <strong>{catalogo}</strong>
              </p>
            </div>
          </div>

          {/* KPI Cards: Contratación Oficial Perú Compras (Ley de Miller: 3 Chunks Máximo) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <div
              style={{
                background: '#fff',
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--c-border, #e2e8f0)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#059669', marginBottom: 6 }}>
                <DollarSign size={18} />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Monto Contratado Total
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--c-text, #0f172a)' }}>
                {formatMoney(montoContratado)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--c-text-tertiary, #94a3b8)', marginTop: 2 }}>
                {montoContratado > 0 ? 'Compras formales del Estado' : 'Sin compras registradas aún'}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid var(--c-border, #e2e8f0)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2563eb', marginBottom: 6 }}>
                <ShoppingBag size={18} />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Órdenes Formalizadas (OCAM)
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
                  background: '#fff',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid var(--c-border, #e2e8f0)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d97706', marginBottom: 6 }}>
                  <TrendingUp size={18} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
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

          {/* Desglose Estructurado en 4 Chunks Temáticos (Ley de Miller & Hick) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, color: 'var(--c-text, #0f172a)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={16} /> Especificaciones Técnicas por Módulos
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--c-text-tertiary, #94a3b8)' }}>
                {rawFeatures.length} características detectadas
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: 12,
              }}
            >
              {featureChunks.map((chunk, cIdx) => {
                const Icon = chunk.icon;
                return (
                  <div
                    key={cIdx}
                    style={{
                      border: '1px solid var(--c-border, #e2e8f0)',
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: '#fff',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 12px',
                        background: 'var(--c-bg-subtle, #f8fafc)',
                        borderBottom: '1px solid var(--c-border-light, #f1f5f9)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: 'var(--c-text-secondary, #475569)',
                      }}
                    >
                      <Icon size={14} style={{ color: 'var(--c-brand, #2563eb)' }} />
                      <span>{chunk.title}</span>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <tbody>
                        {chunk.items.map((item, i) => (
                          <tr
                            key={i}
                            style={{
                              borderBottom: i < chunk.items.length - 1 ? '1px solid var(--c-border-light, #f1f5f9)' : 'none',
                            }}
                          >
                            <td
                              style={{
                                padding: '6px 12px',
                                fontWeight: 600,
                                color: 'var(--c-text-secondary, #64748b)',
                                width: '42%',
                                verticalAlign: 'top',
                              }}
                            >
                              {item.key}
                            </td>
                            <td
                              style={{
                                padding: '6px 12px',
                                color: 'var(--c-text, #0f172a)',
                                width: '58%',
                              }}
                            >
                              {item.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Descripción cruda completa (colapsable) */}
          <div style={{ background: 'var(--c-bg-subtle, #f8fafc)', padding: '12px 16px', borderRadius: 8, fontSize: '0.78rem', color: 'var(--c-text-secondary, #64748b)', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, display: 'block', marginBottom: 4 }}>Descripción Oficial Completa:</span>
            {desc}
          </div>

          {/* Trazabilidad */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--c-text-tertiary, #94a3b8)', flexWrap: 'wrap', gap: 8, borderTop: '1px solid var(--c-border-light, #f1f5f9)', paddingTop: 10 }}>
            <span>Primera carga en el sistema: {formatDate(ficha.fecha_primera_carga)}</span>
            <span>Última extracción: {formatDate(ficha.fecha_extraccion)}</span>
          </div>
        </div>

        {/* Footer actions (Ley de Fitts: Botones principales en zona de alcance con target táctil grande >44px) */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--c-border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--c-bg-subtle, #f8fafc)',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
            <button
              onClick={handleCopySpecs}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '10px 18px',
                minHeight: 42,
                cursor: 'pointer',
                background: copied ? '#16a34a' : 'var(--c-brand, #2563eb)',
                borderColor: copied ? '#16a34a' : 'var(--c-brand, #2563eb)',
                transition: 'all .2s',
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? '¡Copiado para Cotizador!' : 'Copiar para Cotizador'}
            </button>

            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  padding: '10px 16px',
                  minHeight: 42,
                  textDecoration: 'none',
                  background: '#fff',
                  border: '1px solid var(--c-border, #cbd5e1)',
                  color: 'var(--c-text, #1e293b)',
                }}
              >
                <FileText size={16} /> Ficha Técnica Oficial (PDF) <ExternalLink size={13} />
              </a>
            )}
          </div>

          <button
            onClick={onClose}
            className="btn"
            style={{
              padding: '10px 22px',
              minHeight: 42,
              fontSize: '0.85rem',
              fontWeight: 600,
              background: '#fff',
              border: '1px solid var(--c-border, #cbd5e1)',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
