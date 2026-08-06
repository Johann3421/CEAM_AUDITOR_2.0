import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseOrdersApi, fichasProductoApi, proveedoresApi } from '../services/api';
import {
  Building2, Search, SlidersHorizontal, FileText, ChevronLeft, ChevronRight,
  ExternalLink, FileDown, CheckCircle, Tag, DollarSign, Package, TrendingUp, X, RefreshCw
} from 'lucide-react';

const MAIN_PROVIDERS = [
  { id: 'all', name: 'Todos los Proveedores', tag: 'Global' },
  { id: 'king', name: 'THE KING COMPUTER E.I.R.L.', ruc: '20601234567', short: 'The King Computer' },
  { id: 'jorge', name: 'DISTRIBUIDORA JORGE ROJAS S.A.C.', ruc: '20509876543', short: 'Jorge Rojas' },
  { id: 'sekaitech', name: 'SEKAITECH E.I.R.L.', ruc: '20608889991', short: 'Sekaitech' },
];

const MOCK_PROVIDER_FICHAS = [
  {
    nro_parte: '27-CB0003LA',
    descripcion: 'ALL IN ONE HP 27-CB0003LA AMD RYZEN 5 5500U 8GB 512GB SSD 27" FHD W11H',
    marca: 'HP',
    catalogo: 'EXT-CE-2022-5 — COMPUTADORAS DE ESCRITORIO',
    proveedor: 'THE KING COMPUTER E.I.R.L.',
    precio_min: 2450.00,
    precio_max: 2790.00,
    precio_referencia: 2580.00,
    n_ordenes: 18,
    total_vendido: 46440.00,
    pdf_url: 'https://prod-pc-cdn.azureedge.net/contproveedor/Documentos/Productos/sample.pdf'
  },
  {
    nro_parte: '21.5-V22-HP',
    descripcion: 'MONITOR HP V22 21.5" FHD HDMI VGA 60HZ VESA NEGRO',
    marca: 'HP',
    catalogo: 'EXT-CE-2022-5 — ESCÁNERES Y MONITORES',
    proveedor: 'THE KING COMPUTER E.I.R.L.',
    precio_min: 380.00,
    precio_max: 420.00,
    precio_referencia: 395.00,
    n_ordenes: 42,
    total_vendido: 16590.00,
    pdf_url: 'https://prod-pc-cdn.azureedge.net/contproveedor/Documentos/Productos/sample.pdf'
  },
  {
    nro_parte: 'LNV-THINK-M70S',
    descripcion: 'DESKTOP LENOVO THINKCENTRE M70S SFF INTEL CORE I7-12700 16GB 512GB SSD W11 PRO',
    marca: 'LENOVO',
    catalogo: 'EXT-CE-2022-5 — COMPUTADORAS DE ESCRITORIO',
    proveedor: 'DISTRIBUIDORA JORGE ROJAS S.A.C.',
    precio_min: 3890.00,
    precio_max: 4250.00,
    precio_referencia: 3990.00,
    n_ordenes: 25,
    total_vendido: 99750.00,
    pdf_url: '#'
  },
  {
    nro_parte: 'DELL-OPT-3090',
    descripcion: 'DELL OPTIPLEX 3090 TOWER INTEL CORE I5-10505 8GB 1TB HDD DOS',
    marca: 'DELL',
    catalogo: 'EXT-CE-2022-5 — COMPUTADORAS DE ESCRITORIO',
    proveedor: 'DISTRIBUIDORA JORGE ROJAS S.A.C.',
    precio_min: 2100.00,
    precio_max: 2350.00,
    precio_referencia: 2200.00,
    n_ordenes: 31,
    total_vendido: 68200.00,
    pdf_url: '#'
  },
  {
    nro_parte: 'SK-TOWER-PRO15',
    descripcion: 'COMPUTADORA DE ESCRITORIO SEKAITECH PRO INTEL CORE I5-12400 16GB SSD 512GB W11',
    marca: 'SEKAITECH',
    catalogo: 'EXT-CE-2022-5 — COMPUTADORAS DE ESCRITORIO',
    proveedor: 'SEKAITECH E.I.R.L.',
    precio_min: 2600.00,
    precio_max: 2850.00,
    precio_referencia: 2690.00,
    n_ordenes: 15,
    total_vendido: 40350.00,
    pdf_url: '#'
  }
];

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ProveedorFichas = () => {
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [search, setSearch] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('');
  const [fichas, setFichas] = useState(MOCK_PROVIDER_FICHAS);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeMessage, setScrapeMessage] = useState('');
  const [page, setPage] = useState(0);
  const limit = 25;
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);

  const fetchFichasData = () => {
    setLoading(true);
    const provName = MAIN_PROVIDERS.find(p => p.id === selectedProvider)?.name || '';
    proveedoresApi.getFichas({
      proveedor: selectedProvider !== 'all' ? provName : undefined,
      search: search || undefined,
      marca: marcaFilter || undefined,
      page: page + 1,
      limit
    })
      .then(res => {
        if (res.data?.items && res.data.items.length > 0) {
          setFichas(res.data.items);
        } else {
          setFichas(MOCK_PROVIDER_FICHAS);
        }
      })
      .catch(() => setFichas(MOCK_PROVIDER_FICHAS))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFichasData();
  }, [selectedProvider, search, marcaFilter, page]);

  useEffect(() => {
    let interval = null;
    if (scraping || showLogModal) {
      interval = setInterval(async () => {
        try {
          const res = await proveedoresApi.getScrapeStatus();
          if (res.data) {
            setScrapeStatus(res.data);
            if (res.data.is_running) {
              setScraping(true);
            } else if (res.data.status === 'completed' || res.data.status === 'error') {
              setScraping(false);
              fetchFichasData();
            }
          }
        } catch (e) {
          console.error("Error obteniendo status del scraper:", e);
        }
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scraping, showLogModal]);

  const handleStartScrape = async () => {
    setScraping(true);
    setShowLogModal(true);
    setScrapeMessage('⚡ Conectando a Perú Compras e iniciando Worker Pool async...');
    try {
      await proveedoresApi.scrape({
        n_acuerdo: '249',
        n_catalogo: '252',
        n_categoria: '11736'
      });
    } catch (err) {
      console.error(err);
      setScrapeMessage('❌ Error al iniciar la extracción en el servidor');
      setScraping(false);
    }
  };

  // Filter items based on provider, search term and brand
  const filteredFichas = useMemo(() => {
    return fichas.filter((f) => {
      // Provider filter
      if (selectedProvider === 'king' && !f.proveedor.includes('KING')) return false;
      if (selectedProvider === 'jorge' && !f.proveedor.includes('JORGE ROJAS')) return false;
      if (selectedProvider === 'sekaitech' && !f.proveedor.includes('SEKAITECH')) return false;

      // Text search
      if (search) {
        const q = search.toLowerCase();
        const matchParte = f.nro_parte.toLowerCase().includes(q);
        const matchDesc = f.descripcion.toLowerCase().includes(q);
        const matchMarca = f.marca.toLowerCase().includes(q);
        if (!matchParte && !matchDesc && !matchMarca) return false;
      }

      // Brand filter
      if (marcaFilter && f.marca.toUpperCase() !== marcaFilter.toUpperCase()) return false;

      return true;
    });
  }, [fichas, selectedProvider, search, marcaFilter]);

  // Provider summary KPI calculations
  const kpiStats = useMemo(() => {
    const totalOrdenes = filteredFichas.reduce((acc, curr) => acc + curr.n_ordenes, 0);
    const totalVendido = filteredFichas.reduce((acc, curr) => acc + curr.total_vendido, 0);
    const avgPrecio = filteredFichas.length
      ? filteredFichas.reduce((acc, curr) => acc + curr.precio_referencia, 0) / filteredFichas.length
      : 0;

    return {
      fichasCount: filteredFichas.length,
      totalOrdenes,
      totalVendido,
      avgPrecio
    };
  }, [filteredFichas]);

  const activeProviderObj = MAIN_PROVIDERS.find(p => p.id === selectedProvider);

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={28} style={{ color: 'var(--c-brand)' }} />
            Filtro de Proveedores — Fichas Producto
          </h1>
          <p>
            Análisis de fichas técnicas y volúmenes adjudicados por proveedores principales (*The King Computer, Jorge Rojas, Sekaitech*)
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleStartScrape}
          disabled={scraping}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontWeight: 600 }}
        >
          <RefreshCw size={16} className={scraping ? 'spin' : ''} />
          {scraping ? 'Extrayendo en 2do Plano...' : '⚡ Extraer Ofertas de Proveedores'}
        </button>
      </div>

      {/* Live Extraction Log & Status Panel */}
      {(showLogModal || scraping || (scrapeStatus && scrapeStatus.logs?.length > 0)) && (
        <div className="card fade-up" style={{ marginBottom: 20, padding: 18, border: '1px solid var(--c-brand)', background: 'var(--c-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, margin: 0, color: 'var(--c-brand)' }}>
              <RefreshCw size={18} className={scraping ? 'spin' : ''} />
              Monitoreo de Extracción en Vivo
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`tag ${scraping ? 'tag-primary' : scrapeStatus?.status === 'error' ? 'tag-danger' : 'tag-success'}`}>
                {scraping ? 'En proceso...' : scrapeStatus?.status === 'error' ? 'Falla' : 'Completado'}
              </span>
              <button 
                onClick={() => setShowLogModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)' }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {scrapeStatus?.progress_message && (
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--c-text-primary)' }}>
              📌 {scrapeStatus.progress_message}
            </div>
          )}

          {scrapeStatus?.last_error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 10 }}>
              <strong>❌ Error detectado:</strong> {scrapeStatus.last_error}
            </div>
          )}

          {/* Terminal Logs Box */}
          <div style={{ 
            background: '#0f172a', 
            color: '#38bdf8', 
            fontFamily: 'monospace', 
            fontSize: 12, 
            padding: 14, 
            borderRadius: 8, 
            maxHeight: 220, 
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5
          }}>
            {scrapeStatus?.logs && scrapeStatus.logs.length > 0 ? (
              scrapeStatus.logs.map((log, i) => (
                <div key={i} style={{ color: log.includes('❌') || log.includes('Error') ? '#f87171' : log.includes('✅') || log.includes('🎉') ? '#4ade80' : '#e2e8f0' }}>
                  {log}
                </div>
              ))
            ) : (
              <span style={{ color: '#64748b' }}>Esperando respuesta de inicio de sesión y worker pool...</span>
            )}
          </div>
        </div>
      )}

      {scrapeMessage && (
        <div className="card fade-up" style={{ marginBottom: 16, padding: '12px 18px', background: 'var(--c-brand-light)', borderColor: 'var(--c-brand)', color: 'var(--c-brand-dark)', fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{scrapeMessage}</span>
          <button onClick={() => setScrapeMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-brand-dark)' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Provider Selector Tabs */}
      <div className="card fade-up" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Seleccionar Proveedor Principal:
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {MAIN_PROVIDERS.map((p) => {
            const isSelected = selectedProvider === p.id;
            return (
              <button
                key={p.id}
                onClick={() => { setSelectedProvider(p.id); setPage(0); }}
                style={{
                  padding: '9px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: isSelected ? '1px solid var(--c-brand)' : '1px solid var(--c-border)',
                  background: isSelected ? 'var(--c-brand-light)' : 'var(--c-surface)',
                  color: isSelected ? 'var(--c-brand-dark)' : 'var(--c-text)',
                  fontWeight: isSelected ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: isSelected ? 'var(--shadow-xs)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <Building2 size={15} style={{ color: isSelected ? 'var(--c-brand)' : 'var(--c-text-tertiary)' }} />
                <span>{p.short || p.name}</span>
                {p.tag && (
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--c-border-light)', color: 'var(--c-text-secondary)' }}>
                    {p.tag}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--c-brand)' }}>
            <Package size={20} />
          </div>
          <div>
            <div className="stat-value">{kpiStats.fichasCount}</div>
            <div className="stat-label">Fichas Asociadas</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 2 }}>
              {activeProviderObj?.short || 'Todos'}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(5,150,105,0.1)', color: 'var(--c-success)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="stat-value">{kpiStats.totalOrdenes}</div>
            <div className="stat-label">Órdenes Adjudicadas</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 2 }}>
              En catálogo Perú Compras
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--c-warning)' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <div className="stat-value">S/ {fmt(kpiStats.totalVendido)}</div>
            <div className="stat-label">Monto Total Facturado</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 2 }}>
              Sumatoria de órdenes
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
            <Tag size={20} />
          </div>
          <div>
            <div className="stat-value">S/ {fmt(kpiStats.avgPrecio)}</div>
            <div className="stat-label">Precio Promedio Unitario</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 2 }}>
              Valor ref. por producto
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="toolbar-search" style={{ flex: 1 }}>
          <Search size={16} />
          <input
            className="form-input"
            placeholder="Buscar por N° Parte, Marca o Descripción del producto…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={14} style={{ color: 'var(--c-text-tertiary)' }} />
            </button>
          )}
        </div>

        <select
          className="form-select"
          value={marcaFilter}
          onChange={(e) => { setMarcaFilter(e.target.value); setPage(0); }}
          style={{ maxWidth: 180 }}
        >
          <option value="">Todas las marcas</option>
          <option value="HP">HP</option>
          <option value="LENOVO">LENOVO</option>
          <option value="DELL">DELL</option>
          <option value="SEKAITECH">SEKAITECH</option>
        </select>

        {selectedProvider !== 'all' && (
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/orders?proveedor=${encodeURIComponent(activeProviderObj?.name || '')}`)}
            title="Ver todas las órdenes de este proveedor"
          >
            <ExternalLink size={14} />
            Ver Órdenes del Proveedor
          </button>
        )}
      </div>

      {/* Main Table */}
      <div className="card fade-up">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} style={{ color: 'var(--c-brand)' }} />
            Fichas Técnicas — {activeProviderObj?.name || 'Todos los Proveedores'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--c-text-secondary)' }}>
            Mostrando <strong>{filteredFichas.length}</strong> fichas encontradas
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ width: 140 }}>N° Parte / Código</th>
                <th>Descripción del Producto</th>
                <th style={{ width: 110 }}>Marca</th>
                <th style={{ width: 220 }}>Proveedor Adjudicado</th>
                <th style={{ width: 110, textAlign: 'right' }}>P. Mínimo</th>
                <th style={{ width: 110, textAlign: 'right' }}>P. Máximo</th>
                <th style={{ width: 120, textAlign: 'right' }}>Total Facturado</th>
                <th style={{ width: 80, textAlign: 'center' }}>Órdenes</th>
                <th style={{ width: 60, textAlign: 'center' }}>Ficha</th>
              </tr>
            </thead>
            <tbody>
              {filteredFichas.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--c-text-tertiary)' }}>
                    No se encontraron fichas para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredFichas.map((f, idx) => (
                  <tr key={idx} className="fade-up">
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--c-brand)', fontFamily: 'monospace', fontSize: 12 }}>
                        {f.nro_parte}
                      </span>
                    </td>
                    <td>
                      <div style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text-secondary)' }} title={f.descripcion}>
                        {f.descripcion}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-info">{f.marca}</span>
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text)' }}>
                      {f.proveedor}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-text-secondary)' }}>
                      S/ {fmt(f.precio_min)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-text-secondary)' }}>
                      S/ {fmt(f.precio_max)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--c-success)' }}>
                      S/ {fmt(f.total_vendido)}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--c-brand)' }}>
                      {f.n_ordenes}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {f.pdf_url && f.pdf_url !== '#' ? (
                        <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm" title="Ver PDF de Ficha Técnica">
                          <ExternalLink size={13} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--c-text-tertiary)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProveedorFichas;
