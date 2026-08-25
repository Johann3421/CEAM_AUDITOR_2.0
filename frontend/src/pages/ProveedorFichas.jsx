import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { proveedoresApi } from '../services/api';
import HeaderFilter from '../components/HeaderFilter';
import {
  Building2, Search, FileText, ChevronLeft, ChevronRight,
  ExternalLink, Tag, DollarSign, Package, TrendingUp, X, RefreshCw,
  Code, Copy, Check, Cpu, HardDrive, Monitor, Download,
  ArrowUp, ArrowDown, ChevronsUpDown, Filter, Layers, CheckCircle2, ChevronDown, ChevronUp,
  Laptop, MonitorCheck, Printer, Sparkles, Tv, Smartphone, Server, Zap, Projector
} from 'lucide-react';

const MAIN_PROVIDERS = [
  { id: 'all', name: 'Todos los Proveedores', tag: 'Global' },
  { id: 'sekaitech', name: 'SEKAITECH E.I.R.L.', ruc: '20608889991', short: 'Sekaitech' },
  { id: 'king', name: 'THE KING COMPUTER E.I.R.L.', ruc: '20601234567', short: 'The King Computer' },
  { id: 'jorge', name: 'DISTRIBUIDORA JORGE ROJAS S.A.C.', ruc: '20509876543', short: 'Jorge Rojas' },
];

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseSpecs = (desc = '') => {
  if (!desc) return { marca: 'VARIOS', modelo: 'Computadora / Dispositivo' };

  const getMatch = (regex) => {
    const m = desc.match(regex);
    return m ? m[1].trim() : null;
  };

  // 1. Procesador
  let proc = getMatch(/PROCESADOR:\s*([^;]+?)(?=\s+RAM:|\s+ALMACENAMIENTO:|$)/i);
  if (proc) {
    proc = proc.replace(/INTEL CORE/i, '').replace(/AMD RYZEN/i, 'Ryzen').trim();
    proc = proc.replace(/\s+/g, ' ');
  }

  // 2. RAM
  let ram = getMatch(/RAM:\s*([^;]+?)(?=\s+ALMACENAMIENTO:|\s+PANTALLA:|$)/i);
  if (ram) {
    const mRam = ram.match(/(\d+\s*GB(?:\s+DDR\d)?)/i);
    ram = mRam ? mRam[1] : `${ram.split(' ')[0]} GB`;
  }

  // 3. Disco
  let disco = getMatch(/ALMACENAMIENTO:\s*([^;]+?)(?=\s+PANTALLA:|\s+LAN:|$)/i);
  if (disco) {
    const mDisco = disco.match(/(\d+\s*(?:GB|TB)(?:\s*(?:SSD|HDD|NVMe))?)/i);
    disco = mDisco ? mDisco[1] : disco.split(' ')[0];
  }

  // 4. Pantalla
  let pantalla = getMatch(/PANTALLA:\s*([^;]+?)(?=\s+LAN:|\s+WLAN:|$)|\b(\d+(?:\.\d+)?\s*(?:\"|PULGADAS))\b/i);
  if (pantalla) {
    const mPan = pantalla.match(/(\d+(?:\.\d+)?\s*(?:\"|PULGADAS)?)/i);
    const size = mPan ? mPan[1].replace(/PULGADAS/i, '"') : '';
    const isFhd = /1920X1080|FHD/i.test(pantalla);
    pantalla = `${size}${size && !size.includes('"') ? '"' : ''} ${isFhd ? 'FHD' : ''}`.trim();
  }

  // 5. Sistema Operativo
  let so = getMatch(/SIST\.\s*OPER:\s*([^;]+?)(?=\s+UNIDAD|\s+TECLADO:|$)/i);
  if (so) {
    const soUp = so.toUpperCase();
    if (soUp.includes('WINDOWS 11 PRO') || soUp.includes('W11 PRO')) so = 'Win 11 Pro';
    else if (soUp.includes('WINDOWS 11 HOME') || soUp.includes('W11H')) so = 'Win 11 Home';
    else if (soUp.includes('WINDOWS 10')) so = 'Win 10 Pro';
    else if (soUp.includes('UBUNTU')) so = 'Ubuntu';
    else if (soUp.includes('FREE') || soUp.includes('NO TIENE') || soUp.includes('DOS')) so = 'FreeDOS';
    else so = so.split(' ').slice(0, 2).join(' ');
  }

  // 6. Modelo y Marca desde bloque UNIDAD
  let marca = '';
  let modelo = '';
  const unidadMatch = desc.match(/UNIDAD\s+([A-Z0-9_-]+)\s+(.+?)(?:\s+SIST\.\s+MANEJO|$)/i);
  if (unidadMatch) {
    marca = unidadMatch[1].toUpperCase();
    const rest = unidadMatch[2].trim();
    const tokens = rest.split(/\s+/);
    if (tokens.length > 1) {
      let rawMod = tokens.slice(0, -1).join(' ');
      if (rawMod.toUpperCase().startsWith(marca)) {
        rawMod = rawMod.slice(marca.length).trim();
      }
      modelo = rawMod;
    } else {
      modelo = rest;
    }
  }

  // Fallback de Marca
  if (!marca || marca === 'VARIOS' || marca === 'OPTICA') {
    for (const b of ['HP', 'LENOVO', 'DELL', 'ADVANCE', 'M4X', 'ASUS', 'ACER']) {
      if (new RegExp(`\\b${b}\\b`, 'i').test(desc)) {
        marca = b;
        break;
      }
    }
  }

  return {
    marca: marca || 'VARIOS',
    modelo: modelo || 'Computadora / Dispositivo',
    proc,
    ram,
    disco,
    pantalla,
    so
  };
};

const ProveedorFichas = () => {
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [fichas, setFichas] = useState([]);
  const [totalFichas, setTotalFichas] = useState(0);
  const [categoriesCount, setCategoriesCount] = useState({
    total: 0, desktop: 0, laptop: 0, aio: 0, monitor: 0,
    impresora: 0, escaner: 0, tablet: 0, workstation: 0,
    servidor: 0, proyector: 0, ups: 0
  });
  const [loading, setLoading] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedJsonItem, setSelectedJsonItem] = useState(null);
  const [copied, setCopied] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [expandedDescId, setExpandedDescId] = useState(null);

  const fetchCategoriesCount = () => {
    proveedoresApi.getCategoriesCount()
      .then(res => {
        if (res.data) {
          setCategoriesCount(res.data);
        }
      })
      .catch(() => {});
  };

  const handleReclassify = async () => {
    setReclassifying(true);
    try {
      await proveedoresApi.reclassify();
      fetchCategoriesCount();
      fetchFichasData();
    } catch (e) {
      console.error(e);
    } finally {
      setReclassifying(false);
    }
  };

  const fetchFichasData = () => {
    setLoading(true);
    const provName = MAIN_PROVIDERS.find(p => p.id === selectedProvider)?.name || '';
    
    proveedoresApi.getFichas({
      proveedor: selectedProvider !== 'all' ? provName : undefined,
      search: search || undefined,
      marca: marcaFilter || undefined,
      categoria: activeTab !== 'all' ? activeTab : undefined,
      stock_filter: stockFilter || undefined,
      sort_by: sortBy || undefined,
      page: page + 1,
      limit
    })
      .then(res => {
        if (res.data?.items && res.data.items.length > 0) {
          setFichas(res.data.items);
          setTotalFichas(res.data.total || res.data.items.length);
        } else {
          setFichas([]);
          setTotalFichas(0);
        }
      })
      .catch(() => {
        setFichas([]);
        setTotalFichas(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCategoriesCount();
  }, []);

  useEffect(() => {
    fetchFichasData();
  }, [selectedProvider, activeTab, search, marcaFilter, stockFilter, sortBy, page, limit]);

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
              fetchCategoriesCount();
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
    try {
      await proveedoresApi.scrape({});
    } catch (err) {
      console.error(err);
      setScraping(false);
    }
  };

  const handleDownloadFullJson = async () => {
    setExportingJson(true);
    try {
      const res = await proveedoresApi.exportJson();
      const data = res.data;
      if (Array.isArray(data) && data.length > 0) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `perucompras_ofertas_proveedores_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert("Aún no hay ofertas guardadas en la base de datos para exportar.");
      }
    } catch (e) {
      console.error("Error exportando JSON:", e);
      alert("Error al descargar el JSON de ofertas.");
    } finally {
      setExportingJson(false);
    }
  };

  const handleCopyJson = () => {
    if (selectedJsonItem) {
      navigator.clipboard.writeText(JSON.stringify(selectedJsonItem, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleSort = (col) => {
    if (col === 'precio') {
      if (sortBy === 'precio_asc') setSortBy('precio_desc');
      else if (sortBy === 'precio_desc') setSortBy('');
      else setSortBy('precio_asc');
    } else if (col === 'stock') {
      if (sortBy === 'stock_desc') setSortBy('');
      else setSortBy('stock_desc');
    } else if (col === 'marca') {
      if (sortBy === 'marca_asc') setSortBy('');
      else setSortBy('marca_asc');
    }
    setPage(0);
  };

  const hasActiveFilters = Boolean(search || marcaFilter || stockFilter || sortBy || selectedProvider !== 'all' || activeTab !== 'all');

  const clearAllFilters = () => {
    setSearch('');
    setMarcaFilter('');
    setStockFilter('');
    setSortBy('');
    setSelectedProvider('all');
    setActiveTab('all');
    setPage(0);
  };

  const kpiStats = useMemo(() => {
    const totalStock = fichas.reduce((acc, curr) => acc + (curr.existencia_stock || 0), 0);
    const avgPrecio = fichas.length
      ? fichas.reduce((acc, curr) => acc + (curr.precio_ofertado || curr.precio_referencia || 0), 0) / fichas.length
      : 0;

    return {
      fichasCount: totalFichas || fichas.length,
      totalStock,
      avgPrecio
    };
  }, [fichas, totalFichas]);

  const CATEGORY_BUTTONS = [
    { id: 'all', label: 'Todas las Ofertas', count: categoriesCount.total, icon: Layers },
    { id: 'desktop', label: '🖥️ Computadoras de Escritorio', count: categoriesCount.desktop, icon: Monitor },
    { id: 'laptop', label: '💻 Laptops / Portátiles', count: categoriesCount.laptop, icon: Laptop },
    { id: 'aio', label: '🖥️ Todo en Uno (AIO)', count: categoriesCount.aio, icon: MonitorCheck },
    { id: 'monitor', label: '📺 Monitores', count: categoriesCount.monitor, icon: Tv },
    { id: 'impresora', label: '🖨️ Impresoras / Multifuncionales', count: categoriesCount.impresora, icon: Printer },
    { id: 'escaner', label: '📠 Escáneres', count: categoriesCount.escaner, icon: Printer },
    { id: 'tablet', label: '📱 Tablets', count: categoriesCount.tablet, icon: Smartphone },
    { id: 'workstation', label: '⚙️ Estaciones de Trabajo', count: categoriesCount.workstation, icon: Cpu },
    { id: 'servidor', label: '🗄️ Servidores', count: categoriesCount.servidor, icon: Server },
    { id: 'proyector', label: '📽️ Proyectores', count: categoriesCount.proyector, icon: Projector },
    { id: 'ups', label: '🔋 UPS / Energía', count: categoriesCount.ups, icon: Zap },
  ];

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 700, margin: 0 }}>
            <Building2 size={24} style={{ color: 'var(--c-brand)' }} />
            Ofertas y Fichas de Proveedores — Perú Compras
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--c-text-secondary)', fontSize: 13 }}>
            Catálogo completo con clasificación estructurada por tipo de producto (Desktop, Laptops, AIO y Escáneres)
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleReclassify}
            disabled={reclassifying}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}
            title="Reorganizar automáticamente todas las ofertas según especificaciones técnicas"
          >
            <Sparkles size={15} className={reclassifying ? 'spin' : ''} />
            {reclassifying ? 'Reclasificando...' : 'Reclasificar Catálogo'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleDownloadFullJson}
            disabled={exportingJson || totalFichas === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}
            title="Descargar todas las ofertas en un archivo .json"
          >
            <Download size={15} />
            {exportingJson ? 'Generando...' : '📥 Descargar JSON'}
          </button>

          <button
            className="btn btn-primary"
            onClick={handleStartScrape}
            disabled={scraping}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600 }}
          >
            <RefreshCw size={15} className={scraping ? 'spin' : ''} />
            {scraping ? 'Extrayendo Catálogos...' : '⚡ Extraer Todo el Catálogo'}
          </button>
        </div>
      </div>

      {/* Category Quick Tabs with Real Counts */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16 }}>
        {CATEGORY_BUTTONS.map(tab => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setPage(0); }}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: isSelected ? '1px solid var(--c-brand)' : '1px solid var(--c-border)',
                background: isSelected ? 'var(--c-brand)' : 'var(--c-surface)',
                color: isSelected ? '#fff' : 'var(--c-text-secondary)',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: isSelected ? '0 2px 6px rgba(37,99,235,0.2)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                color: isSelected ? '#fff' : 'var(--c-text-primary)',
                padding: '1px 7px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700
              }}>
                {tab.count ? tab.count.toLocaleString('es-PE') : (categoriesCount.total ? '0' : '...')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Live Extraction Log & Status Panel */}
      {(showLogModal || scraping || (scrapeStatus && scrapeStatus.logs?.length > 0)) && (
        <div className="card fade-up" style={{ marginBottom: 20, padding: 16, border: '1px solid var(--c-brand)', background: 'var(--c-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, margin: 0, color: 'var(--c-brand)' }}>
              <RefreshCw size={16} className={scraping ? 'spin' : ''} />
              Extracción Multicatálogo en Vivo (Perú Compras)
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`tag ${scraping ? 'tag-primary' : scrapeStatus?.status === 'error' ? 'tag-danger' : 'tag-success'}`}>
                {scraping ? `Procesando combinaciones (${scrapeStatus?.combos_completed || 0}/${scrapeStatus?.combos_total || '...'})` : scrapeStatus?.status === 'error' ? 'Falla' : 'Completado'}
              </span>
              <button 
                onClick={() => setShowLogModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {scrapeStatus?.progress_message && (
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: 'var(--c-text-primary)' }}>
              📌 {scrapeStatus.progress_message}
            </div>
          )}

          {scrapeStatus?.last_error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
              <strong>❌ Error detectado:</strong> {scrapeStatus.last_error}
            </div>
          )}

          {/* Live Browser Screenshot Preview */}
          {scrapeStatus?.latest_screenshot && (
            <div style={{ marginBottom: 12, background: '#f8fafc', border: '1px solid var(--c-border)', borderRadius: 6, padding: 8, textAlign: 'center' }}>
              <img 
                src={scrapeStatus.latest_screenshot} 
                alt="Vista en vivo del navegador" 
                style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, border: '1px solid #cbd5e1' }} 
              />
            </div>
          )}

          {/* Terminal Logs Box */}
          <div style={{ 
            background: '#0f172a', 
            color: '#38bdf8', 
            fontFamily: 'monospace', 
            fontSize: 11, 
            padding: 12, 
            borderRadius: 6, 
            maxHeight: 160, 
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.4
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

      {/* KPI Stats Bar */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--c-brand)' }}>
            <Package size={18} />
          </div>
          <div>
            <div className="stat-value">{kpiStats.fichasCount.toLocaleString('es-PE')}</div>
            <div className="stat-label">Ofertas en Vista Actual</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(5,150,105,0.1)', color: 'var(--c-success)' }}>
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="stat-value">{kpiStats.totalStock} unid.</div>
            <div className="stat-label">Stock en Página Actual</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--c-warning)' }}>
            <DollarSign size={18} />
          </div>
          <div>
            <div className="stat-value">USD {fmt(kpiStats.avgPrecio)}</div>
            <div className="stat-label">Precio Promedio Ofertado</div>
          </div>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="card fade-up" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="toolbar-search" style={{ flex: 1, minWidth: 260 }}>
            <Search size={15} />
            <input
              className="form-input"
              placeholder="Buscar por N° Parte, Marca, Procesador o Modelo…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              style={{ fontSize: 13 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={14} style={{ color: 'var(--c-text-tertiary)' }} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-secondary)' }}>Stock:</span>
            <select
              className="form-select"
              value={stockFilter}
              onChange={(e) => { setStockFilter(e.target.value); setPage(0); }}
              style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
            >
              <option value="">Todos</option>
              <option value="with_stock">Con stock (&gt; 0)</option>
              <option value="zero_stock">Sin stock (0)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-secondary)' }}>Proveedor:</span>
            <select
              className="form-select"
              value={selectedProvider}
              onChange={(e) => { setSelectedProvider(e.target.value); setPage(0); }}
              style={{ minWidth: 160, fontSize: 12, padding: '4px 8px' }}
            >
              {MAIN_PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>{p.short || p.name}</option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={clearAllFilters}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}
            >
              <X size={13} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="card fade-up" style={{ padding: 0, overflow: 'visible', border: '1px solid var(--c-border)' }}>
        <div className="card-header" style={{ padding: '12px 18px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
            <FileText size={16} style={{ color: 'var(--c-brand)' }} />
            Listado de Ofertas ({CATEGORY_BUTTONS.find(b => b.id === activeTab)?.label})
          </span>
          <span style={{ fontSize: 12, color: 'var(--c-text-secondary)' }}>
            Mostrando <strong>{fichas.length}</strong> de <strong>{totalFichas.toLocaleString('es-PE')}</strong> ofertas (Pág. {page + 1} de {Math.max(1, Math.ceil(totalFichas / limit))})
          </span>
        </div>

        <div className="table-wrap" style={{ overflow: 'visible' }}>
          <table className="data-table" style={{ fontSize: '0.84rem', width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--c-border)' }}>
                {/* 1. Marca & Código */}
                <th style={{ width: 160, padding: '10px 14px' }}>
                  <HeaderFilter
                    title="Marca & Código"
                    column="marca"
                    currentFilter={marcaFilter}
                    onFilterChange={(v) => { setMarcaFilter(v); setPage(0); }}
                    apiCall={proveedoresApi.getColumnFilter}
                  />
                </th>

                {/* 2. Ficha Técnica / Especificaciones */}
                <th style={{ padding: '10px 14px' }}>
                  <span>Ficha Técnica / Especificaciones</span>
                </th>

                {/* 3. Estado */}
                <th style={{ width: 90, textAlign: 'center', padding: '10px 14px' }}>
                  <span>Estado</span>
                </th>

                {/* 4. Precio Ofertado */}
                <th 
                  onClick={() => toggleSort('precio')}
                  style={{ width: 140, textAlign: 'right', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Precio"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <span>Precio Ofertado</span>
                    {sortBy === 'precio_asc' ? (
                      <ArrowUp size={12} style={{ color: 'var(--c-brand)' }} />
                    ) : sortBy === 'precio_desc' ? (
                      <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                    ) : (
                      <ChevronsUpDown size={12} style={{ color: 'var(--c-text-tertiary)' }} />
                    )}
                  </div>
                </th>

                {/* 5. Stock */}
                <th 
                  onClick={() => toggleSort('stock')}
                  style={{ width: 90, textAlign: 'center', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Existencias"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span>Stock</span>
                    {sortBy === 'stock_desc' ? (
                      <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                    ) : (
                      <ChevronsUpDown size={12} style={{ color: 'var(--c-text-tertiary)' }} />
                    )}
                  </div>
                </th>

                {/* 6. Datos / Acciones */}
                <th style={{ width: 100, textAlign: 'center', padding: '10px 14px' }}>
                  <span>Datos</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 36, color: 'var(--c-text-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={16} className="spin" />
                      <span>Cargando ofertas de la base de datos...</span>
                    </div>
                  </td>
                </tr>
              ) : fichas.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 36, color: 'var(--c-text-tertiary)' }}>
                    No se encontraron ofertas en esta categoría. Puedes hacer clic en <strong>Reclasificar Catálogo</strong> o <strong>⚡ Extraer Todo el Catálogo</strong>.
                  </td>
                </tr>
              ) : (
                fichas.map((f, idx) => {
                  const specs = parseSpecs(f.descripcion);
                  const isExpanded = expandedDescId === f.id;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--c-border)', transition: 'background 0.1s' }}>
                      {/* Marca & Nro Parte */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{ 
                            display: 'inline-block',
                            padding: '1px 6px', 
                            borderRadius: 4, 
                            fontSize: 10, 
                            fontWeight: 700, 
                            background: f.marca === 'HP' ? '#eff6ff' : f.marca === 'LENOVO' ? '#fef2f2' : f.marca === 'DELL' ? '#f0fdf4' : f.marca === 'ADVANCE' ? '#fdf2f8' : '#f1f5f9',
                            color: f.marca === 'HP' ? '#1d4ed8' : f.marca === 'LENOVO' ? '#b91c1c' : f.marca === 'DELL' ? '#15803d' : f.marca === 'ADVANCE' ? '#be185d' : '#334155',
                            width: 'fit-content'
                          }}>
                            {f.marca || 'VARIOS'}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: 'var(--c-text-primary)' }}>
                            {f.nro_parte || 'S/N'}
                          </span>
                        </div>
                      </td>

                      {/* Ficha Tecnica / Especificaciones */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {/* Titulo Limpio (sin repetir marca) */}
                          <div style={{ fontWeight: 600, color: 'var(--c-text-primary)', fontSize: 13 }}>
                            {f.marca} {specs.modelo}
                          </div>

                          {/* Chips Compactos de Specs */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                            {specs.proc && (
                              <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                                ⚡ {specs.proc}
                              </span>
                            )}
                            {specs.ram && (
                              <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                                💾 {specs.ram}
                              </span>
                            )}
                            {specs.disco && (
                              <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                                💽 {specs.disco}
                              </span>
                            )}
                            {specs.pantalla && (
                              <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                                🖥️ {specs.pantalla}
                              </span>
                            )}
                            {specs.so && (
                              <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                                🪟 {specs.so}
                              </span>
                            )}
                            <button
                              onClick={() => setExpandedDescId(isExpanded ? null : f.id)}
                              style={{ 
                                background: 'none', 
                                border: 'none', 
                                cursor: 'pointer', 
                                padding: '1px 4px', 
                                fontSize: 10, 
                                color: 'var(--c-brand)', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: 2 
                              }}
                              title="Ver texto técnico completo"
                            >
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              <span>{isExpanded ? 'Ocultar' : 'Detalles'}</span>
                            </button>
                          </div>

                          {/* Detalle Desplegable si el usuario hace click */}
                          {isExpanded && (
                            <div style={{ marginTop: 4, padding: '6px 10px', background: '#f1f5f9', borderRadius: 4, fontSize: 11, color: '#334155', lineHeight: 1.4 }}>
                              {f.descripcion}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '10px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '2px 7px', 
                          borderRadius: 10, 
                          fontSize: 10, 
                          fontWeight: 600, 
                          background: '#ecfdf5', 
                          color: '#047857',
                          border: '1px solid #a7f3d0'
                        }}>
                          {f.estado || 'VIGENTE'}
                        </span>
                      </td>

                      {/* Precio */}
                      <td style={{ padding: '10px 14px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text-primary)', fontFamily: 'monospace' }}>
                            {f.moneda || 'USD'} {fmt(f.precio_ofertado || f.precio_referencia)}
                          </span>
                          <span style={{ fontSize: 9, color: 'var(--c-text-tertiary)' }}>
                            P. Unitario Vigente
                          </span>
                        </div>
                      </td>

                      {/* Stock */}
                      <td style={{ padding: '10px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '2px 6px', 
                          borderRadius: 4, 
                          fontSize: 11, 
                          fontWeight: 600,
                          background: (f.existencia_stock > 0) ? '#eff6ff' : '#f8fafc',
                          color: (f.existencia_stock > 0) ? '#1d4ed8' : '#64748b',
                          border: '1px solid #e2e8f0'
                        }}>
                          {f.existencia_stock > 0 ? `${f.existencia_stock} unid.` : '0 unid.'}
                        </span>
                      </td>

                      {/* Acciones & JSON View */}
                      <td style={{ padding: '10px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => setSelectedJsonItem(f)}
                            style={{ padding: '3px 6px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            title="Ver JSON completo de este registro"
                          >
                            <Code size={12} style={{ color: 'var(--c-brand)' }} />
                            <span>JSON</span>
                          </button>

                          {f.pdf_url && f.pdf_url !== '#' && (
                            <a
                              href={f.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm"
                              style={{ padding: '3px 5px' }}
                              title="Ver PDF Ficha Técnica"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '12px 18px', 
          borderTop: '1px solid var(--c-border)',
          background: '#f8fafc',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--c-text-secondary)' }}>
            <span>Registros por página:</span>
            <select
              className="form-select"
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(0); }}
              style={{ width: 80, padding: '4px 6px', fontSize: 12 }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0 || loading}
              className="btn btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12 }}
            >
              <ChevronLeft size={14} />
              Anterior
            </button>
            <span style={{ fontWeight: 600, fontSize: 12 }}>
              Página {page + 1} de {Math.max(1, Math.ceil(totalFichas / limit))}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={(page + 1) * limit >= totalFichas || loading}
              className="btn btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', fontSize: 12 }}
            >
              Siguiente
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* JSON Inspection Modal */}
      {selectedJsonItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div className="card fade-up" style={{
            width: '100%',
            maxWidth: 720,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--c-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Code size={16} style={{ color: 'var(--c-brand)' }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                  Inspección de Objeto JSON — [{selectedJsonItem.marca}] {selectedJsonItem.nro_parte}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedJsonItem(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 18, overflowY: 'auto', flex: 1, background: '#0f172a' }}>
              <pre style={{
                margin: 0,
                color: '#38bdf8',
                fontFamily: 'monospace',
                fontSize: 11,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}>
                {JSON.stringify(selectedJsonItem, null, 2)}
              </pre>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '10px 18px',
              borderTop: '1px solid var(--c-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <span style={{ fontSize: 11, color: 'var(--c-text-secondary)' }}>
                N° Parte: <strong>{selectedJsonItem.nro_parte}</strong> | Marca: <strong>{selectedJsonItem.marca}</strong>
              </span>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleCopyJson}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
                >
                  {copied ? <Check size={13} style={{ color: '#16a34a' }} /> : <Copy size={13} />}
                  {copied ? '¡Copiado!' : 'Copiar JSON'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setSelectedJsonItem(null)}
                  style={{ padding: '4px 12px', fontSize: 12 }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProveedorFichas;
