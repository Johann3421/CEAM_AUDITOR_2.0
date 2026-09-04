import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { proveedoresApi } from '../services/api';
import {
  Building2, Search, FileText, ChevronLeft, ChevronRight,
  ExternalLink, DollarSign, Package, TrendingUp, X, RefreshCw,
  Code, Copy, Check, Cpu, HardDrive, Monitor, Download, Trash2,
  ArrowUp, ArrowDown, ChevronsUpDown, Filter, CheckCircle2,
  Laptop, Printer, Sparkles, Tv, Server, Clock, MapPin,
  FileSpreadsheet, ShieldCheck, AlertCircle, Eye, SlidersHorizontal
} from 'lucide-react';

const MAIN_PROVIDERS = [
  { id: 'all', name: 'Todos los Proveedores (Consolidado)', short: '🏢 Comparar Precios (The King vs Jorge Rojas)', tag: 'Comparativa' },
  { id: 'thekingcomputer', name: 'THE KING COMPUTER E.I.R.L.', short: '👑 The King Computer', ruc: '20601234567' },
  { id: 'jorge_rojas', name: 'ROJAS VILLANUEVA JORGE LUIS', short: '👤 Jorge Rojas Villanueva', ruc: '10408899991' },
];

const PERU_REGIONES = [
  { id: 'all', name: 'Todas las Regiones (Nacional)' },
  { id: 'LIMA', name: 'Lima Metropolitana' },
  { id: 'CALLAO', name: 'Callao' },
  { id: 'AREQUIPA', name: 'Arequipa' },
  { id: 'CUSCO', name: 'Cusco' },
  { id: 'LA LIBERTAD', name: 'La Libertad (Trujillo)' },
  { id: 'PIURA', name: 'Piura' },
  { id: 'LAMBAYEQUE', name: 'Lambayeque (Chiclayo)' },
  { id: 'JUNIN', name: 'Junín (Huancayo)' },
  { id: 'ANCASH', name: 'Áncash' },
  { id: 'ICA', name: 'Ica' },
  { id: 'CAJAMARCA', name: 'Cajamarca' },
  { id: 'PUNO', name: 'Puno' },
  { id: 'SAN MARTIN', name: 'San Martín (Tarapoto)' },
  { id: 'LORETO', name: 'Loreto (Iquitos)' },
  { id: 'UCAYALI', name: 'Ucayali (Pucallpa)' },
  { id: 'AYACUCHO', name: 'Ayacucho' },
  { id: 'HUANUCO', name: 'Huánuco' },
  { id: 'TACNA', name: 'Tacna' },
  { id: 'MOQUEGUA', name: 'Moquegua' },
  { id: 'TUMBES', name: 'Tumbes' },
  { id: 'PASCO', name: 'Pasco' },
  { id: 'HUANCAVELICA', name: 'Huancavelica' },
  { id: 'APURIMAC', name: 'Apurímac' },
  { id: 'AMAZONAS', name: 'Amazonas' },
  { id: 'MADRE DE DIOS', name: 'Madre de Dios' },
];

const CATEGORY_TABS = [
  { id: 'all', label: 'Todos los Catálogos', icon: Package },
  { id: 'escritorio', label: 'Computadoras', icon: Monitor },
  { id: 'portatil', label: 'Laptops', icon: Laptop },
  { id: 'aio', label: 'All-in-One', icon: Tv },
  { id: 'monitor', label: 'Monitores', icon: Monitor },
  { id: 'escaner_docs', label: 'Escáneres', icon: Printer },
  { id: 'workstation', label: 'Workstations', icon: Server },
  { id: 'almacenamiento_int', label: 'Almacenamiento', icon: HardDrive },
];

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseSpecs = (desc = '', categoria = '', catalogo = '') => {
  if (!desc) {
    return { marca: 'VARIOS', modelo: categoria || catalogo || 'Dispositivo' };
  }

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
    const isFhd = /1920X1080|FHD|FULL HD/i.test(desc);
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

  if (!marca || marca === 'VARIOS' || marca === 'OPTICA') {
    for (const b of ['HP', 'LENOVO', 'DELL', 'ADVANCE', 'M4X', 'ASUS', 'ACER', 'SAMSUNG', 'LG', 'VIEWSONIC', 'BENQ', 'TEROS', 'EPSON', 'CANON', 'FUJITSU', 'JFA TECHNOLOGY', 'JFA']) {
      if (new RegExp(`\\b${b}\\b`, 'i').test(desc)) {
        marca = b;
        break;
      }
    }
  }

  if (!modelo) {
    modelo = categoria || catalogo || 'Dispositivo';
  }

  return { proc, ram, disco, pantalla, so, marca: marca || 'VARIOS', modelo };
};

const ProveedorFichas = () => {
  const navigate = useNavigate();

  // Estados principales de datos
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [activeCategory, setActiveCategory] = useState('all');
  const [fichas, setFichas] = useState([]);
  const [totalFichas, setTotalFichas] = useState(0);
  const [kpis, setKpis] = useState(null);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [loading, setLoading] = useState(false);

  // Filtros
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [competenciaFilter, setCompetenciaFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('');
  const [pdfFilter, setPdfFilter] = useState('all');
  const [mostrarExcluidas, setMostrarExcluidas] = useState(false);
  const [sortBy, setSortBy] = useState('precio_asc');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(25);

  // Estados de procesos y modales
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [showLiveBanner, setShowLiveBanner] = useState(false);
  const [selectedJsonItem, setSelectedJsonItem] = useState(null);
  const [selectedRegionItem, setSelectedRegionItem] = useState(null);
  const [showScrapePlazosModal, setShowScrapePlazosModal] = useState(false);
  const [copiedPart, setCopiedPart] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);

  // Configuración del modal de extracción regional de plazos
  const [scrapePlazosProvider, setScrapePlazosProvider] = useState('all');
  const [scrapePlazosRegion, setScrapePlazosRegion] = useState('all');

  const wasScrapingRef = useRef(false);
  const abortControllerRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Debounce para búsqueda sin colisiones
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Cargar conteos por categoría y KPIs solo cuando cambia el proveedor
  const fetchCountsAndKpis = async () => {
    try {
      const [resKpis, resCounts] = await Promise.all([
        proveedoresApi.getKpis({ proveedor: selectedProvider !== 'all' ? selectedProvider : undefined }),
        proveedoresApi.getCategoriesCount({ proveedor: selectedProvider !== 'all' ? selectedProvider : undefined })
      ]);
      setKpis({
        avg_precio: resKpis?.data?.avg_precio ?? null
      });
      setCategoryCounts(resCounts.data || {});
    } catch (err) {
      console.error('Error cargando conteos y KPIs de proveedores:', err);
    }
  };

  useEffect(() => {
    fetchCountsAndKpis();
  }, [selectedProvider]);

  // 1. Cargar datos principales de la página actual con cancelación de solicitudes pendientes
  const fetchData = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const params = {
        proveedor: selectedProvider !== 'all' ? selectedProvider : undefined,
        proveedor_filter: selectedProvider === 'all' && competenciaFilter !== 'all' ? competenciaFilter : undefined,
        categoria: activeCategory !== 'all' ? activeCategory : undefined,
        region: regionFilter !== 'all' ? regionFilter : undefined,
        search: debouncedSearch.trim() || undefined,
        stock_filter: stockFilter || undefined,
        pdf_filter: pdfFilter !== 'all' ? pdfFilter : undefined,
        mostrar_excluidas: mostrarExcluidas ? true : undefined,
        sort_by: sortBy || undefined,
        page: page + 1,
        limit
      };

      const resFichas = await proveedoresApi.getFichas(params, { signal: controller.signal });
      const data = resFichas.data;
      const list = Array.isArray(data) ? data : (data?.items || data?.data || []);
      setFichas(list);
      setTotalFichas(data?.total ?? list.length);
      setKpis(prev => ({
        ...prev,
        total_stock: data?.total_stock ?? 0
      }));
    } catch (err) {
      if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED' && err?.message !== 'canceled') {
        console.error('Error cargando fichas de proveedores:', err);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedProvider, activeCategory, regionFilter, competenciaFilter, stockFilter, pdfFilter, mostrarExcluidas, sortBy, page, limit, debouncedSearch]);

  // Polling del estado de extracción
  useEffect(() => {
    let interval = null;
    const checkStatus = async () => {
      try {
        const res = await proveedoresApi.getScrapeStatus();
        setScrapeStatus(res.data);
        if (res.data?.is_running) {
          setScraping(true);
          wasScrapingRef.current = true;
        } else {
          setScraping(false);
          if (wasScrapingRef.current) {
            wasScrapingRef.current = false;
            fetchData();
            fetchCountsAndKpis();
          }
        }
      } catch (_) {}
    };

    checkStatus();
    if (scraping || showLiveBanner) {
      interval = setInterval(checkStatus, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scraping, showLiveBanner]);

  // Acciones
  const handleStartScrape = async () => {
    setScraping(true);
    wasScrapingRef.current = true;
    setShowLiveBanner(true);
    try {
      await proveedoresApi.scrape({ proveedor: selectedProvider });
    } catch (err) {
      console.error(err);
      setScraping(false);
    }
  };

  const handleStartSyncEstados = async () => {
    setScraping(true);
    wasScrapingRef.current = true;
    setShowLiveBanner(true);
    try {
      await proveedoresApi.syncEstados({ proveedor: selectedProvider });
    } catch (err) {
      console.error(err);
      setScraping(false);
    }
  };

  const handleStartScrapePlazos = async () => {
    setShowScrapePlazosModal(false);
    setScraping(true);
    wasScrapingRef.current = true;
    setShowLiveBanner(true);
    try {
      await proveedoresApi.scrapePlazos({
        proveedor: scrapePlazosProvider,
        regiones: scrapePlazosRegion !== 'all' ? scrapePlazosRegion : undefined
      });
    } catch (err) {
      console.error(err);
      setScraping(false);
    }
  };

  const handleReclassify = async () => {
    setReclassifying(true);
    try {
      await proveedoresApi.reclassify();
      await Promise.all([fetchData(), fetchCountsAndKpis()]);
    } catch (err) {
      console.error(err);
    } finally {
      setReclassifying(false);
    }
  };

  const handleDownloadExcel = async () => {
    setExportingExcel(true);
    try {
      const res = await proveedoresApi.exportExcel({
        proveedor: selectedProvider !== 'all' ? selectedProvider : undefined,
        categoria: activeCategory !== 'all' ? activeCategory : undefined,
        mostrar_excluidas: mostrarExcluidas ? true : undefined
      });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CEAM_Catalogo_Proveedores_${selectedProvider}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error exportando Excel:', err);
    } finally {
      setExportingExcel(false);
    }
  };

  const handleDownloadJson = async () => {
    setExportingJson(true);
    try {
      const res = await proveedoresApi.exportJson();
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `CEAM_Proveedores_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
    } finally {
      setExportingJson(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedPart(key);
    setTimeout(() => setCopiedPart(null), 1800);
  };

  const clearAllFilters = () => {
    setSearch('');
    setRegionFilter('all');
    setCompetenciaFilter('all');
    setStockFilter('');
    setPdfFilter('all');
    setMostrarExcluidas(false);
    setPage(0);
  };

  const hasActiveFilters = search || regionFilter !== 'all' || competenciaFilter !== 'all' || stockFilter || pdfFilter !== 'all' || mostrarExcluidas;

  // Helper para resolver el plazo de entrega según la región
  const getPlazoForRegion = (oferta, regKey) => {
    if (!oferta) return null;
    if (regKey && regKey !== 'all') {
      const cleanReg = regKey.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return oferta.plazos_por_region?.[cleanReg] ?? oferta.plazos_por_region?.[regKey] ?? oferta.plazo_entrega_dias ?? 90;
    }
    return oferta.plazos_por_region?.['LIMA'] ?? oferta.plazo_entrega_dias ?? 90;
  };

  const totalPages = Math.max(1, Math.ceil(totalFichas / limit));

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1600, margin: '0 auto', fontFamily: 'inherit', color: 'var(--c-text)' }}>
      
      {/* ── 1. Header & Primary Controls ───────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(37,99,235,0.1)', color: 'var(--c-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={16} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--c-text)' }}>
              Catálogo de Ofertas y Fichas de Proveedores
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--c-text-secondary)' }}>
            Auditoría de precios adjudicados, stock disponible, plazos regionales y estados oficiales de Perú Compras.
          </p>
        </div>

        {/* Action Buttons Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleDownloadExcel}
            disabled={exportingExcel || totalFichas === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}
            title="Exportar listado a Excel"
          >
            <FileSpreadsheet size={14} style={{ color: '#16a34a' }} />
            {exportingExcel ? 'Exportando...' : 'Excel'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleDownloadJson}
            disabled={exportingJson || totalFichas === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}
            title="Exportar JSON completo"
          >
            <Download size={14} />
            {exportingJson ? 'Descargando...' : 'JSON'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowScrapePlazosModal(true)}
            disabled={scraping}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}
            title="Extraer plazos regionales de entrega"
          >
            <Clock size={14} style={{ color: 'var(--c-brand)' }} />
            Extraer Plazos
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleStartSyncEstados}
            disabled={scraping}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600 }}
            title="Corregir estados de fichas, existencias de stock reales y enlaces oficiales de Perú Compras"
          >
            <CheckCircle2 size={14} style={{ color: '#0284c7' }} />
            {scraping ? 'Corrigiendo estados...' : 'Corregir estados'}
          </button>

          {scrapeStatus && (scraping || (scrapeStatus.logs?.length > 0)) && (
            <button
              className="btn btn-secondary"
              onClick={() => setShowLiveBanner(prev => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 600,
                border: showLiveBanner ? '1px solid var(--c-brand)' : '1px solid var(--c-border)',
                background: showLiveBanner ? '#eff6ff' : '#ffffff',
                color: showLiveBanner ? 'var(--c-brand)' : 'var(--c-text-secondary)'
              }}
              title={showLiveBanner ? "Ocultar panel de extracción" : "Mostrar consola de extracción en vivo"}
            >
              <RefreshCw size={13} className={scraping ? 'spin' : ''} />
              <span>{showLiveBanner ? 'Ocultar Consola' : 'Ver Consola'}</span>
              {scraping && (
                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--c-brand)', color: '#fff' }}>
                  {scrapeStatus?.combos_completed || 0}/{scrapeStatus?.combos_total || 21}
                </span>
              )}
            </button>
          )}

          <button
            className="btn btn-primary"
            onClick={handleStartScrape}
            disabled={scraping}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600 }}
          >
            <RefreshCw size={14} className={scraping ? 'spin' : ''} />
            {scraping ? 'Extrayendo...' : `Extraer Catálogo (${selectedProvider === 'all' ? 'Ambos' : MAIN_PROVIDERS.find(p => p.id === selectedProvider)?.short})`}
          </button>
        </div>
      </div>

      {/* ── 2. Provider Tabs ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, background: '#e2e8f0', padding: 4, borderRadius: 8, width: 'fit-content', marginBottom: 14 }}>
        {MAIN_PROVIDERS.map(prov => {
          const isSelected = selectedProvider === prov.id;
          return (
            <button
              key={prov.id}
              onClick={() => { setSelectedProvider(prov.id); setPage(0); }}
              style={{
                border: 'none',
                background: isSelected ? '#ffffff' : 'transparent',
                color: isSelected ? 'var(--c-brand)' : 'var(--c-text-secondary)',
                fontWeight: isSelected ? 700 : 500,
                fontSize: 12,
                padding: '6px 14px',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Building2 size={13} />
              <span>{prov.short}</span>
              {prov.tag && (
                <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: isSelected ? 'rgba(37,99,235,0.12)' : '#cbd5e1', color: isSelected ? 'var(--c-brand)' : '#475569' }}>
                  {prov.tag}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 3. Category Carousel / Tabs ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
        {CATEGORY_TABS.map(tab => {
          const isSelected = activeCategory === tab.id;
          const count = tab.id === 'all' ? totalFichas : (categoryCounts[tab.id] || 0);
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveCategory(tab.id); setPage(0); }}
              style={{
                border: isSelected ? '1px solid var(--c-brand)' : '1px solid var(--c-border)',
                background: isSelected ? '#eff6ff' : '#ffffff',
                color: isSelected ? 'var(--c-brand)' : 'var(--c-text)',
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: isSelected ? 600 : 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap'
              }}
            >
              <TabIcon size={13} style={{ color: isSelected ? 'var(--c-brand)' : 'var(--c-text-tertiary)' }} />
              <span>{tab.label}</span>
              <span style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 10,
                background: isSelected ? 'rgba(37,99,235,0.15)' : '#f1f5f9',
                color: isSelected ? 'var(--c-brand)' : 'var(--c-text-secondary)',
                fontWeight: 600
              }}>
                {count != null ? count.toLocaleString('es-PE') : '...'}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 4. Unified Filter Strip & KPI Strip ───────────────────────────── */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: '#ffffff', border: '1px solid var(--c-border)', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          
          {/* Left: Filter Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 320 }}>
            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: 260, flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-tertiary)' }} />
              <input
                type="text"
                placeholder="Buscar por N° Parte, Marca, Procesador o Modelo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 28px 6px 30px',
                  borderRadius: 6,
                  border: '1px solid var(--c-border)',
                  fontSize: 12,
                  outline: 'none',
                  background: '#f8fafc'
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)' }}>
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Region Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--c-text-secondary)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <MapPin size={12} style={{ color: 'var(--c-brand)' }} /> Región:
              </span>
              <select
                className="form-select"
                value={regionFilter}
                onChange={(e) => { setRegionFilter(e.target.value); setPage(0); }}
                style={{ fontSize: 12, padding: '4px 8px', height: 28, borderRadius: 6, border: '1px solid var(--c-border)', width: 160 }}
              >
                {PERU_REGIONES.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Competencia (solo visible en consolidado) */}
            {selectedProvider === 'all' && (
              <select
                className="form-select"
                value={competenciaFilter}
                onChange={(e) => { setCompetenciaFilter(e.target.value); setPage(0); }}
                style={{ fontSize: 12, padding: '4px 8px', height: 28, borderRadius: 6, border: '1px solid var(--c-border)', width: 140 }}
              >
                <option value="all">Competencia: Todas</option>
                <option value="ambos">✨ Con Competencia</option>
                <option value="exclusivo">🔒 Oferta Exclusiva</option>
              </select>
            )}

            {/* Stock Filter */}
            <select
              className="form-select"
              value={stockFilter}
              onChange={(e) => { setStockFilter(e.target.value); setPage(0); }}
              style={{ fontSize: 12, padding: '4px 8px', height: 28, borderRadius: 6, border: '1px solid var(--c-border)', width: 110 }}
            >
              <option value="">Stock: Todos</option>
              <option value="with_stock">Con stock</option>
              <option value="zero_stock">Sin stock (0)</option>
            </select>

            {/* PDF Filter */}
            <select
              className="form-select"
              value={pdfFilter}
              onChange={(e) => { setPdfFilter(e.target.value); setPage(0); }}
              style={{ fontSize: 12, padding: '4px 8px', height: 28, borderRadius: 6, border: '1px solid var(--c-border)', width: 105 }}
            >
              <option value="all">PDF: Todos</option>
              <option value="with_pdf">📄 Con PDF</option>
              <option value="no_pdf">❌ Sin PDF</option>
            </select>

            {/* Toggle Mostrar Excluidas */}
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              userSelect: 'none',
              padding: '2px 8px',
              height: 28,
              borderRadius: 6,
              background: mostrarExcluidas ? '#fef3c7' : '#f8fafc',
              border: mostrarExcluidas ? '1px solid #fde68a' : '1px solid var(--c-border)',
              color: mostrarExcluidas ? '#92400e' : 'var(--c-text-secondary)',
              transition: 'all 0.15s ease'
            }} title="Por defecto solo se muestran fichas OFERTADAS y sin clasificar. Marca esta casilla para ver también las EXCLUIDAS">
              <input
                type="checkbox"
                checked={mostrarExcluidas}
                onChange={(e) => { setMostrarExcluidas(e.target.checked); setPage(0); }}
                style={{ cursor: 'pointer', accentColor: '#d97706' }}
              />
              <span>Mostrar excluidas</span>
            </label>

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                style={{ border: 'none', background: 'transparent', color: 'var(--c-brand)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              >
                <X size={12} /> Limpiar
              </button>
            )}
          </div>

          {/* Right: Inline KPIs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderLeft: '1px solid var(--c-border)', paddingLeft: 12 }}>
            <div style={{ fontSize: 11 }}>
              <span style={{ color: 'var(--c-text-secondary)' }}>Fichas: </span>
              <strong style={{ color: 'var(--c-text)' }}>{totalFichas.toLocaleString('es-PE')}</strong>
            </div>
            {kpis?.total_stock != null && (
              <div style={{ fontSize: 11 }}>
                <span style={{ color: 'var(--c-text-secondary)' }}>Stock: </span>
                <strong style={{ color: '#059669' }}>{kpis.total_stock.toLocaleString('es-PE')}</strong>
              </div>
            )}
            {kpis?.avg_precio != null && (
              <div style={{ fontSize: 11 }}>
                <span style={{ color: 'var(--c-text-secondary)' }}>Promedio: </span>
                <strong style={{ color: '#d97706' }}>USD {fmt(kpis.avg_precio)}</strong>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── 5. Live Extraction Status Banner ───────────────────────────────── */}
      {showLiveBanner && (
        <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 8, border: '1px solid var(--c-brand)', background: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--c-brand)' }}>
              <RefreshCw size={14} className={scraping ? 'spin' : ''} />
              <span>Extracción en Vivo — {scrapeStatus?.provider_name || 'Perú Compras'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12,
                background: scraping ? '#dbeafe' : scrapeStatus?.status === 'error' ? '#fee2e2' : '#dcfce7',
                color: scraping ? '#1d4ed8' : scrapeStatus?.status === 'error' ? '#b91c1c' : '#15803d'
              }}>
                {scraping ? `Procesando (${scrapeStatus?.combos_completed || 0}/${scrapeStatus?.combos_total || 21})` : scrapeStatus?.status === 'error' ? 'Falla' : 'Completado'}
              </span>
              <button 
                onClick={() => setShowLiveBanner(false)}
                title="Cerrar panel de extracción en vivo"
                style={{
                  border: '1px solid var(--c-border)',
                  background: '#f8fafc',
                  borderRadius: 6,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  color: 'var(--c-text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600
                }}
              >
                <X size={13} />
                <span>Ocultar</span>
              </button>
            </div>
          </div>

          {scrapeStatus?.progress_message && (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)', marginBottom: 6 }}>
              📌 {scrapeStatus.progress_message}
            </div>
          )}

          {/* Screenshot Preview if any */}
          {scrapeStatus?.latest_screenshot && (
            <div style={{ marginBottom: 8, textAlign: 'center' }}>
              <img src={scrapeStatus.latest_screenshot} alt="Navegador" style={{ maxHeight: 140, borderRadius: 4, border: '1px solid #cbd5e1' }} />
            </div>
          )}

          {/* Logs stream */}
          <div style={{ maxHeight: 110, overflowY: 'auto', background: '#0f172a', padding: '8px 12px', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, color: '#e2e8f0', lineHeight: 1.4 }}>
            {scrapeStatus?.logs?.slice(-12).map((lg, i) => (
              <div key={i} style={{ color: lg.includes('❌') ? '#f87171' : lg.includes('✅') || lg.includes('🎉') ? '#4ade80' : '#e2e8f0' }}>
                {lg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. Master Table (100% Width — NO HORIZONTAL SCROLLBAR) ────────── */}
      <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid var(--c-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        
        {/* Table Controls Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={14} style={{ color: 'var(--c-brand)' }} />
            <span>Listado de Ofertas Adjudicadas</span>
            <span style={{ fontWeight: 400 }}>({fichas.length} en página)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--c-text-secondary)' }}>Por página:</span>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(0); }}
              style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--c-border)' }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Table Component */}
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--c-border)', fontSize: 11, color: 'var(--c-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={{ width: '38%', padding: '10px 16px' }}>Producto & Especificaciones</th>
              <th style={{ width: '16%', padding: '10px 14px' }}>Categoría / Acuerdo</th>
              <th style={{ width: '30%', padding: '10px 14px' }}>Ofertas & Precios</th>
              <th style={{ width: '16%', padding: '10px 16px', textAlign: 'right' }}>Estado & Ficha PDF</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-secondary)', fontSize: 13 }}>
                  <RefreshCw size={22} className="spin" style={{ margin: '0 auto 8px', color: 'var(--c-brand)' }} />
                  <div>Cargando ofertas de catálogo...</div>
                </td>
              </tr>
            ) : fichas.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-secondary)', fontSize: 13 }}>
                  <AlertCircle size={24} style={{ margin: '0 auto 8px', color: 'var(--c-text-tertiary)' }} />
                  <div style={{ fontWeight: 600 }}>No se encontraron fichas con los filtros actuales</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Prueba restableciendo los filtros o realizando otra búsqueda.</div>
                </td>
              </tr>
            ) : (
              fichas.map((f, fIdx) => {
                const specs = parseSpecs(f.descripcion || f.descripcion_producto, f.categoria, f.catalogo);
                const ofertas = Array.isArray(f.ofertas) && f.ofertas.length > 0 ? f.ofertas : [f];
                
                // Resolver ofertas de The King y Jorge Rojas
                const kingOferta = ofertas.find(o => {
                  const n = (o.nombre_proveedor || o.proveedor || '').toUpperCase();
                  const r = (o.ruc_proveedor || '').trim();
                  return n.includes('KING') || r === '20601234567';
                });

                const rojasOferta = ofertas.find(o => {
                  const n = (o.nombre_proveedor || o.proveedor || '').toUpperCase();
                  const r = (o.ruc_proveedor || '').trim();
                  return n.includes('ROJAS') || n.includes('JORGE') || r === '10408899991';
                });

                const hasCompetencia = kingOferta && rojasOferta;
                const bestPrice = hasCompetencia
                  ? Math.min(kingOferta.precio_ofertado || 999999, rojasOferta.precio_ofertado || 999999)
                  : null;

                // Plazo activo según la región seleccionada
                const kingPlazo = getPlazoForRegion(kingOferta, regionFilter);
                const rojasPlazo = getPlazoForRegion(rojasOferta, regionFilter);

                // Estado oficial y PDF
                const estadoFicha = f.estado_ficha_producto || 'VIGENTE';
                const estadoOferta = f.estado_oferta || 'VIGENTE';
                const pdfUrl = f.pdf_url || kingOferta?.pdf_url || rojasOferta?.pdf_url;

                return (
                  <tr
                    key={f.id || f.nro_parte || fIdx}
                    style={{
                      borderBottom: '1px solid var(--c-border-light)',
                      background: fIdx % 2 === 0 ? '#ffffff' : '#fafafa',
                      transition: 'background 0.1s ease'
                    }}
                  >
                    {/* ── Columna 1: Producto & Especificaciones (38%) ── */}
                    <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        {f.imagen_url ? (
                          <img
                            src={f.imagen_url}
                            alt=""
                            style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{ width: 44, height: 44, borderRadius: 4, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', flexShrink: 0 }}>
                            <Package size={20} />
                          </div>
                        )}

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Part Number & Brand header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                            <button
                              onClick={() => copyToClipboard(f.nro_parte, f.nro_parte)}
                              title="Copiar N° de Parte"
                              style={{
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                borderRadius: 4,
                                padding: '1px 6px',
                                fontSize: 11,
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                color: '#1e293b',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              {f.nro_parte || 'S/N'}
                              {copiedPart === f.nro_parte ? <Check size={10} style={{ color: '#16a34a' }} /> : <Copy size={10} style={{ color: '#94a3b8' }} />}
                            </button>

                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-brand)', textTransform: 'uppercase' }}>
                              {specs.marca || f.marca}
                            </span>
                          </div>

                          {/* Modelo / Título */}
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', lineHeight: 1.3, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.descripcion_producto}>
                            {specs.modelo}
                          </div>

                          {/* Chips de Especificaciones Técnicas */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {specs.proc && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#f1f5f9', color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Cpu size={10} style={{ color: '#0284c7' }} /> {specs.proc}
                              </span>
                            )}
                            {specs.ram && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#f1f5f9', color: '#334155' }}>
                                RAM: {specs.ram}
                              </span>
                            )}
                            {specs.disco && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#f1f5f9', color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <HardDrive size={10} style={{ color: '#64748b' }} /> {specs.disco}
                              </span>
                            )}
                            {specs.pantalla && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#f1f5f9', color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Monitor size={10} style={{ color: '#8b5cf6' }} /> {specs.pantalla}
                              </span>
                            )}
                            {specs.so && (
                              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#f1f5f9', color: '#334155' }}>
                                {specs.so}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* ── Columna 2: Categoría & Catálogo (16%) ── */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>
                        {f.categoria || 'Catálogo General'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--c-text-secondary)', lineHeight: 1.2 }}>
                        {f.catalogo || 'Perú Compras'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--c-text-tertiary)', marginTop: 4 }}>
                        {f.acuerdo_marco || 'EXT-CE-2022-5'}
                      </div>
                    </td>

                    {/* ── Columna 3: Ofertas & Precios (30%) ── */}
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      {selectedProvider === 'all' ? (
                        (() => {
                          const pKing = kingOferta?.precio_ofertado;
                          const pRojas = rojasOferta?.precio_ofertado;
                          const hasBoth = pKing != null && pRojas != null;
                          const diff = hasBoth ? Math.abs(pKing - pRojas) : null;
                          const kingCheaper = hasBoth && pKing < pRojas;
                          const rojasCheaper = hasBoth && pRojas < pKing;
                          const isTie = hasBoth && pKing === pRojas;

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {/* Fila The King */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '5px 8px',
                                borderRadius: 5,
                                background: kingCheaper ? '#f0fdf4' : '#f8fafc',
                                border: kingCheaper ? '1px solid #86efac' : '1px solid #e2e8f0',
                                fontSize: 11
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 700, color: '#6d28d9', fontSize: 10 }}>The King:</span>
                                  {pKing != null ? (
                                    <strong style={{ color: '#0f172a', fontSize: 12 }}>USD {fmt(pKing)}</strong>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Sin oferta</span>
                                  )}
                                  {kingCheaper && diff > 0 && (
                                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                                      🟢 -USD {fmt(diff)}
                                    </span>
                                  )}
                                  {isTie && (
                                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                      Empate
                                    </span>
                                  )}
                                </div>

                                {kingOferta && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                                    <span style={{ color: kingOferta.existencia_stock > 0 ? '#15803d' : '#94a3b8', fontWeight: kingOferta.existencia_stock > 0 ? 600 : 400 }}>
                                      {kingOferta.existencia_stock > 0 ? `📦 ${kingOferta.existencia_stock} unid.` : 'Sin stock'}
                                    </span>
                                    <span style={{ color: '#64748b' }}>⏱️ {kingPlazo} días</span>
                                  </div>
                                )}
                              </div>

                              {/* Fila Jorge Rojas */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '5px 8px',
                                borderRadius: 5,
                                background: rojasCheaper ? '#f0fdf4' : '#f8fafc',
                                border: rojasCheaper ? '1px solid #86efac' : '1px solid #e2e8f0',
                                fontSize: 11
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 700, color: '#0284c7', fontSize: 10 }}>Jorge Rojas:</span>
                                  {pRojas != null ? (
                                    <strong style={{ color: '#0f172a', fontSize: 12 }}>USD {fmt(pRojas)}</strong>
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Sin oferta</span>
                                  )}
                                  {rojasCheaper && diff > 0 && (
                                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                                      🟢 -USD {fmt(diff)}
                                    </span>
                                  )}
                                  {isTie && (
                                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                      Empate
                                    </span>
                                  )}
                                </div>

                                {rojasOferta && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10 }}>
                                    <span style={{ color: rojasOferta.existencia_stock > 0 ? '#15803d' : '#94a3b8', fontWeight: rojasOferta.existencia_stock > 0 ? 600 : 400 }}>
                                      {rojasOferta.existencia_stock > 0 ? `📦 ${rojasOferta.existencia_stock} unid.` : 'Sin stock'}
                                    </span>
                                    <span style={{ color: '#64748b' }}>⏱️ {rojasPlazo} días</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        /* Vista de Proveedor Individual */
                        <div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                              USD {fmt(f.precio_ofertado || f.min_precio)}
                            </span>
                            <span style={{ fontSize: 11, color: f.existencia_stock > 0 ? '#15803d' : '#94a3b8', fontWeight: 600 }}>
                              {f.existencia_stock > 0 ? `📦 ${f.existencia_stock} unidades disponibles` : 'Sin existencias'}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} style={{ color: 'var(--c-brand)' }} />
                            <span>Plazo de entrega ({regionFilter === 'all' ? 'Lima' : PERU_REGIONES.find(r=>r.id===regionFilter)?.name}):</span>
                            <strong style={{ color: '#1e293b' }}>{getPlazoForRegion(f, regionFilter)} días hábiles</strong>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* ── Columna 4: Estado Oficial & Ficha PDF (16%) ── */}
                    <td style={{ padding: '12px 16px', verticalAlign: 'top', textAlign: 'right' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                        
                        {/* Badges de Estado */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span
                            title={f.motivo_estado ? `Motivo: ${f.motivo_estado}${f.justificacion_estado ? ` - ${f.justificacion_estado}` : ''}` : 'Estado en Catálogo Electrónico'}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: estadoFicha === 'EXCLUIDA' ? '#fef3c7' : estadoFicha === 'OFERTADA' ? '#e0f2fe' : '#dcfce7',
                              color: estadoFicha === 'EXCLUIDA' ? '#92400e' : estadoFicha === 'OFERTADA' ? '#0369a1' : '#166534',
                              border: `1px solid ${estadoFicha === 'EXCLUIDA' ? '#fde68a' : estadoFicha === 'OFERTADA' ? '#bae6fd' : '#bbf7d0'}`
                            }}
                          >
                            {estadoFicha === 'VIGENTE' ? 'VIGENTE' : estadoFicha}
                          </span>

                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: estadoOferta === 'VIGENTE' ? '#f0fdf4' : '#fef2f2',
                            color: estadoOferta === 'VIGENTE' ? '#15803d' : '#991b1b',
                            border: `1px solid ${estadoOferta === 'VIGENTE' ? '#bbf7d0' : '#fecaca'}`
                          }}>
                            {estadoOferta === 'VIGENTE' ? 'OFERTA ACTIVA' : estadoOferta}
                          </span>
                        </div>

                        {/* Botón de Ficha PDF Oficial */}
                        {pdfUrl ? (
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#b91c1c',
                              background: '#fef2f2',
                              border: '1px solid #fca5a5',
                              borderRadius: 4,
                              padding: '3px 8px',
                              textDecoration: 'none'
                            }}
                            title="Abrir ficha técnica oficial en PDF de Perú Compras"
                          >
                            <FileText size={12} />
                            <span>Ficha PDF</span>
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Sin PDF oficial</span>
                        )}

                        {/* Botones de Inspección (Regiones & JSON) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <button
                            onClick={() => setSelectedRegionItem(f)}
                            title="Ver días de entrega en las 25 regiones del Perú"
                            style={{
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              color: 'var(--c-brand)',
                              fontSize: 11,
                              padding: 0,
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              textDecoration: 'none'
                            }}
                          >
                            <MapPin size={11} />
                            <span>25 Regiones</span>
                          </button>
                          <span style={{ color: '#cbd5e1' }}>•</span>
                          <button
                            onClick={() => setSelectedJsonItem(f)}
                            title="Ver datos crudos en formato JSON"
                            style={{
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              color: 'var(--c-text-tertiary)',
                              fontSize: 11,
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3
                            }}
                          >
                            <Code size={11} />
                            <span>JSON</span>
                          </button>
                        </div>

                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* ── Pagination Footer ────────────────────────────────────────────── */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', fontSize: 12 }}>
          <span style={{ color: 'var(--c-text-secondary)' }}>
            Mostrando <strong>{fichas.length > 0 ? page * limit + 1 : 0}</strong> - <strong>{Math.min((page + 1) * limit, totalFichas)}</strong> de <strong>{totalFichas.toLocaleString('es-PE')}</strong> registros
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
            >
              <ChevronLeft size={14} /> Anterior
            </button>

            <span style={{ padding: '0 8px', fontWeight: 600, color: 'var(--c-text)' }}>
              Página {page + 1} de {totalPages}
            </span>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12 }}
            >
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        </div>

      </div>

      {/* ── Modal: Inspección JSON ─────────────────────────────────────────── */}
      {selectedJsonItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 750, maxHeight: '85vh', background: '#ffffff', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13 }}>
                <Code size={15} style={{ color: 'var(--c-brand)' }} />
                <span>Objeto JSON — {selectedJsonItem.nro_parte}</span>
              </div>
              <button onClick={() => setSelectedJsonItem(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 16, overflowY: 'auto', flex: 1, background: '#0f172a' }}>
              <pre style={{ margin: 0, color: '#38bdf8', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(selectedJsonItem, null, 2)}
              </pre>
            </div>

            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#f8fafc' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyToClipboard(JSON.stringify(selectedJsonItem, null, 2), 'json_modal')}
                style={{ fontSize: 12 }}
              >
                {copiedPart === 'json_modal' ? '¡Copiado!' : 'Copiar JSON'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setSelectedJsonItem(null)} style={{ fontSize: 12 }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Desglose de Plazos por las 25 Regiones ─────────────────── */}
      {selectedRegionItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 840, maxHeight: '88vh', background: '#ffffff', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
                  <MapPin size={16} style={{ color: 'var(--c-brand)' }} />
                  <span>Matriz de Plazos de Entrega por Región (25 Departamentos)</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--c-text-secondary)', marginTop: 2 }}>
                  N° de Parte: <strong>{selectedRegionItem.nro_parte}</strong> — {selectedRegionItem.marca}
                </div>
              </div>
              <button onClick={() => setSelectedRegionItem(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {PERU_REGIONES.filter(r => r.id !== 'all').map(reg => {
                  const ofertas = Array.isArray(selectedRegionItem.ofertas) && selectedRegionItem.ofertas.length > 0 ? selectedRegionItem.ofertas : [selectedRegionItem];
                  return (
                    <div key={reg.id} style={{ border: '1px solid var(--c-border)', borderRadius: 6, padding: '8px 12px', background: '#f8fafc' }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', marginBottom: 6 }}>
                        📍 {reg.name}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {ofertas.map((o, oIdx) => {
                          const isJorge = (o.nombre_proveedor || '').toUpperCase().includes('JORGE') || (o.nombre_proveedor || '').toUpperCase().includes('ROJAS');
                          const plazo = getPlazoForRegion(o, reg.id);
                          return (
                            <div key={oIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                              <span style={{ color: isJorge ? '#0284c7' : '#7c3aed', fontWeight: 600 }}>
                                {isJorge ? 'Jorge Rojas:' : 'The King:'}
                              </span>
                              <span style={{
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: plazo <= 2 ? '#dcfce7' : plazo <= 15 ? '#e0f2fe' : '#fef3c7',
                                color: plazo <= 2 ? '#166534' : plazo <= 15 ? '#0369a1' : '#92400e'
                              }}>
                                ⏱️ {plazo} días
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
              <button className="btn btn-primary btn-sm" onClick={() => setSelectedRegionItem(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Configurar Extracción Regional de Plazos ────────────────── */}
      {showScrapePlazosModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#ffffff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
                <Clock size={16} style={{ color: 'var(--c-brand)' }} />
                <span>Extracción Regional de Plazos</span>
              </div>
              <button onClick={() => setShowScrapePlazosModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 18 }}>
              <p style={{ fontSize: 12, color: 'var(--c-text-secondary)', marginTop: 0, marginBottom: 14 }}>
                Inicia la extracción en segundo plano desde el módulo <strong>MejoraPlazo</strong> de Perú Compras para registrar los días hábiles de entrega por departamento.
              </p>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Proveedor a extraer:
                </label>
                <select
                  className="form-select"
                  value={scrapePlazosProvider}
                  onChange={(e) => setScrapePlazosProvider(e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--c-border)' }}
                >
                  <option value="all">Ambos Proveedores (The King y Jorge Rojas)</option>
                  <option value="thekingcomputer">Solo THE KING COMPUTER E.I.R.L.</option>
                  <option value="jorge_rojas">Solo ROJAS VILLANUEVA JORGE LUIS</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Región objetivo:
                </label>
                <select
                  className="form-select"
                  value={scrapePlazosRegion}
                  onChange={(e) => setScrapePlazosRegion(e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--c-border)' }}
                >
                  {PERU_REGIONES.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowScrapePlazosModal(false)}>
                  Cancelar
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleStartScrapePlazos}>
                  Iniciar Extracción
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
