import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { proveedoresApi } from '../services/api';
import HeaderFilter from '../components/HeaderFilter';
import {
  Building2, Search, FileText, ChevronLeft, ChevronRight,
  ExternalLink, Tag, DollarSign, Package, TrendingUp, X, RefreshCw,
  Code, Copy, Check, Cpu, HardDrive, Monitor, Download, Trash2,
  ArrowUp, ArrowDown, ChevronsUpDown, Filter, Layers, CheckCircle2, ChevronDown, ChevronUp,
  Laptop, MonitorCheck, Printer, Sparkles, Tv, Smartphone, Server, Zap, Projector, Award, Scale, Users,
  Clock, MapPin
} from 'lucide-react';

const MAIN_PROVIDERS = [
  { id: 'all', name: 'Todos los Proveedores (Consolidado)', tag: 'Global', short: 'Todos los Proveedores' },
  { id: 'thekingcomputer', name: 'THE KING COMPUTER E.I.R.L.', ruc: '20601234567', short: 'The King Computer', user: 'estalin.huamali01' },
  { id: 'jorge_rojas', name: 'ROJAS VILLANUEVA JORGE LUIS', ruc: '10408899991', short: 'Jorge Rojas Villanueva', user: 'neison.chacas' },
];

const PERU_REGIONES = [
  { id: 'all', name: 'Todas las Regiones (Nacional)', capital: 'Todo el Perú', zona: 'Nacional' },
  { id: 'LIMA', name: 'Lima', capital: 'Lima Metropolitana', zona: 'Lima/Callao' },
  { id: 'CALLAO', name: 'Callao', capital: 'Callao', zona: 'Lima/Callao' },
  { id: 'PIURA', name: 'Piura', capital: 'Piura', zona: 'Costa' },
  { id: 'LA LIBERTAD', name: 'La Libertad', capital: 'Trujillo', zona: 'Costa' },
  { id: 'LAMBAYEQUE', name: 'Lambayeque', capital: 'Chiclayo', zona: 'Costa' },
  { id: 'ANCASH', name: 'Áncash', capital: 'Huaraz / Chimbote', zona: 'Costa' },
  { id: 'ICA', name: 'Ica', capital: 'Ica', zona: 'Costa' },
  { id: 'TACNA', name: 'Tacna', capital: 'Tacna', zona: 'Costa' },
  { id: 'MOQUEGUA', name: 'Moquegua', capital: 'Moquegua', zona: 'Costa' },
  { id: 'TUMBES', name: 'Tumbes', capital: 'Tumbes', zona: 'Costa' },
  { id: 'AREQUIPA', name: 'Arequipa', capital: 'Arequipa', zona: 'Sierra' },
  { id: 'CUSCO', name: 'Cusco', capital: 'Cusco', zona: 'Sierra' },
  { id: 'JUNIN', name: 'Junín', capital: 'Huancayo', zona: 'Sierra' },
  { id: 'HUANUCO', name: 'Huánuco', capital: 'Huánuco', zona: 'Sierra' },
  { id: 'CAJAMARCA', name: 'Cajamarca', capital: 'Cajamarca', zona: 'Sierra' },
  { id: 'PUNO', name: 'Puno', capital: 'Puno', zona: 'Sierra' },
  { id: 'AYACUCHO', name: 'Ayacucho', capital: 'Ayacucho', zona: 'Sierra' },
  { id: 'APURIMAC', name: 'Apurímac', capital: 'Abancay', zona: 'Sierra' },
  { id: 'HUANCAVELICA', name: 'Huancavelica', capital: 'Huancavelica', zona: 'Sierra' },
  { id: 'PASCO', name: 'Pasco', capital: 'Cerro de Pasco', zona: 'Sierra' },
  { id: 'LORETO', name: 'Loreto', capital: 'Iquitos', zona: 'Selva' },
  { id: 'SAN MARTIN', name: 'San Martín', capital: 'Moyobamba / Tarapoto', zona: 'Selva' },
  { id: 'UCAYALI', name: 'Ucayali', capital: 'Pucallpa', zona: 'Selva' },
  { id: 'AMAZONAS', name: 'Amazonas', capital: 'Chachapoyas', zona: 'Selva' },
  { id: 'MADRE DE DIOS', name: 'Madre de Dios', capital: 'Puerto Maldonado', zona: 'Selva' }
];

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseSpecs = (desc = '', categoria = '', catalogo = '') => {
  if (!desc) {
    const fallbackTitle = categoria || catalogo || 'Dispositivo';
    return { marca: 'VARIOS', modelo: fallbackTitle };
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
    const is4k = /3840X2160|4K|UHD/i.test(desc);
    pantalla = `${size}${size && !size.includes('"') ? '"' : ''} ${is4k ? '4K UHD' : isFhd ? 'FHD' : ''}`.trim();
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
    for (const b of ['HP', 'LENOVO', 'DELL', 'ADVANCE', 'M4X', 'ASUS', 'ACER', 'SAMSUNG', 'LG', 'VIEWSONIC', 'BENQ', 'TEROS', 'EPSON', 'CANON', 'FUJITSU', 'KODAK', 'BROTHER', 'KINGSTON', 'WESTERN DIGITAL', 'SEAGATE', 'CRUCIAL', 'SANDISK', 'AUSTIN', 'HIKVISION', 'DAHUA']) {
      if (new RegExp(`\\b${b}\\b`, 'i').test(desc)) {
        marca = b;
        break;
      }
    }
  }

  // Si no hay modelo claro o dice genérico, extraer el tipo de dispositivo real
  if (!modelo || modelo.includes('Computadora / Dispositivo')) {
    const isMonitor = (categoria || '').toUpperCase().includes('MONITOR') || (catalogo || '').toUpperCase().includes('MONITOR') || desc.toUpperCase().includes('MONITOR');
    const isEscaner = (categoria || '').toUpperCase().includes('ESCANER') || (catalogo || '').toUpperCase().includes('ESCANER') || desc.toUpperCase().includes('ESCANER');
    const isTablet = (categoria || '').toUpperCase().includes('TABLET') || desc.toUpperCase().includes('TABLET');
    const isDisco = (categoria || '').toUpperCase().includes('ALMACENAMIENTO') || desc.toUpperCase().includes('DISCO') || desc.toUpperCase().includes('SSD');
    const isAIO = desc.toUpperCase().includes('TODO EN UNO') || desc.toUpperCase().includes('ALL IN ONE');

    if (isMonitor) {
      modelo = `Monitor LED ${pantalla || ''}`.trim();
    } else if (isEscaner) {
      modelo = categoria || 'Escáner';
    } else if (isTablet) {
      modelo = `Tableta ${pantalla || ''}`.trim();
    } else if (isDisco) {
      modelo = `Unidad de Almacenamiento ${disco || ''}`.trim();
    } else if (isAIO) {
      modelo = `Computadora Todo en Uno ${pantalla || ''}`.trim();
    } else {
      const cleanDesc = desc.replace(/^UNIDAD\s+[A-Z0-9_-]+\s+/i, '').split(';')[0].trim();
      modelo = cleanDesc ? cleanDesc.slice(0, 45) : (categoria || 'Dispositivo');
    }
  }

  return {
    marca: marca || 'VARIOS',
    modelo: modelo || (categoria || 'Dispositivo'),
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
  const [proveedorColFilter, setProveedorColFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [pdfFilter, setPdfFilter] = useState('all');
  const [sortBy, setSortBy] = useState('');
  const [fichas, setFichas] = useState([]);
  const [totalFichas, setTotalFichas] = useState(0);
  const [totalCompeting, setTotalCompeting] = useState(0);
  const [totalStockGlobal, setTotalStockGlobal] = useState(0);
  const [categoriesCount, setCategoriesCount] = useState({
    total: 0,
    escritorio: 0,
    aio: 0,
    workstation: 0,
    monitor: 0,
    pantalla_pub: 0,
    pantalla_int: 0,
    almacenamiento_int: 0,
    almacenamiento_ext: 0,
    portatil: 0,
    workstation_portatil: 0,
    tableta: 0,
    escaner_planos: 0,
    escaner_docs: 0,
    escaner_libros: 0
  });
  const [loading, setLoading] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showScrapePlazosModal, setShowScrapePlazosModal] = useState(false);
  const [scrapePlazosProvider, setScrapePlazosProvider] = useState('all');
  const [scrapePlazosRegion, setScrapePlazosRegion] = useState('all');
  const [selectedJsonItem, setSelectedJsonItem] = useState(null);
  const [selectedRegionModalItem, setSelectedRegionModalItem] = useState(null);
  const [modalRegionSearch, setModalRegionSearch] = useState('');
  const [modalZoneFilter, setModalZoneFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const [copiedPart, setCopiedPart] = useState(null);
  const [exportingJson, setExportingJson] = useState(false);
  const [expandedDescId, setExpandedDescId] = useState(null);

  const fetchCategoriesCount = (prov = selectedProvider) => {
    proveedoresApi.getCategoriesCount({ proveedor: prov !== 'all' ? prov : undefined })
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
      fetchCategoriesCount(selectedProvider);
      fetchFichasData();
    } catch (e) {
      console.error(e);
    } finally {
      setReclassifying(false);
    }
  };

  const handleClearData = async () => {
    const provName = selectedProvider !== 'all' ? MAIN_PROVIDERS.find(p => p.id === selectedProvider)?.name : 'TODOS los proveedores';
    if (!window.confirm(`¿Estás seguro de que deseas limpiar y reiniciar las ofertas de ${provName}? Esta acción eliminará TODO (ofertas + plazos) y permitirá comenzar una extracción limpia.`)) {
      return;
    }
    try {
      await proveedoresApi.clearData({ proveedor: selectedProvider !== 'all' ? selectedProvider : undefined });
      fetchCategoriesCount(selectedProvider);
      fetchFichasData();
      alert("Base de datos de ofertas limpiada exitosamente (ofertas + plazos). Listo para una nueva extracción.");
    } catch (e) {
      console.error(e);
      alert("Error al limpiar datos de ofertas.");
    }
  };

  const handleClearPlazos = async () => {
    const provName = selectedProvider !== 'all' ? MAIN_PROVIDERS.find(p => p.id === selectedProvider)?.name : 'TODOS los proveedores';
    if (!window.confirm(`¿Limpiar solo los PLAZOS DE ENTREGA de ${provName}? Las ofertas se conservarán.`)) {
      return;
    }
    try {
      await proveedoresApi.clearData({ proveedor: selectedProvider !== 'all' ? selectedProvider : undefined, solo_plazos: true });
      fetchFichasData();
      alert("Plazos de entrega limpiados. Las ofertas se conservaron.");
    } catch (e) {
      console.error(e);
      alert("Error al limpiar plazos.");
    }
  };

  const fetchFichasData = () => {
    setLoading(true);
    const provId = selectedProvider !== 'all' ? selectedProvider : undefined;
    
    proveedoresApi.getFichas({
      proveedor: provId,
      proveedor_filter: proveedorColFilter !== 'all' ? proveedorColFilter : undefined,
      region: regionFilter !== 'all' ? regionFilter : undefined,
      search: search || undefined,
      marca: marcaFilter || undefined,
      categoria: activeTab !== 'all' ? activeTab : undefined,
      stock_filter: stockFilter || undefined,
      pdf_filter: pdfFilter !== 'all' ? pdfFilter : undefined,
      sort_by: sortBy || undefined,
      page: page + 1,
      limit
    })
      .then(res => {
        if (res.data?.items && res.data.items.length > 0) {
          setFichas(res.data.items);
          setTotalFichas(res.data.total || res.data.items.length);
          setTotalCompeting(res.data.total_competing ?? 0);
          setTotalStockGlobal(res.data.total_stock ?? 0);
        } else {
          setFichas([]);
          setTotalFichas(0);
          setTotalCompeting(0);
          setTotalStockGlobal(0);
        }
      })
      .catch(() => {
        setFichas([]);
        setTotalFichas(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCategoriesCount(selectedProvider);
  }, [selectedProvider]);

  useEffect(() => {
    fetchFichasData();
  }, [selectedProvider, proveedorColFilter, regionFilter, activeTab, search, marcaFilter, stockFilter, pdfFilter, sortBy, page, limit]);

  const wasScrapingRef = useRef(false);

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
              wasScrapingRef.current = true;
            } else {
              setScraping(false);
              // Solo refrescar la tabla y contadores 1 vez cuando termina la extracción
              if (wasScrapingRef.current) {
                wasScrapingRef.current = false;
                fetchCategoriesCount(selectedProvider);
                fetchFichasData();
              }
            }
          }
        } catch (e) {
          console.error("Error obteniendo status del scraper:", e);
        }
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scraping, showLogModal, selectedProvider]);

  const handleStartScrape = async (targetProviderKey = null) => {
    const provToScrape = targetProviderKey || (selectedProvider !== 'all' ? selectedProvider : 'thekingcomputer');
    setScraping(true);
    wasScrapingRef.current = true;
    setShowLogModal(true);
    try {
      await proveedoresApi.scrape({ proveedor: provToScrape });
    } catch (err) {
      console.error(err);
      setScraping(false);
      wasScrapingRef.current = false;
    }
  };

  const handleStartScrapePlazos = async (customProv = null, customReg = null) => {
    const targetProv = customProv || (scrapePlazosProvider !== 'all' ? scrapePlazosProvider : 'all');
    const targetReg = customReg || (scrapePlazosRegion !== 'all' ? scrapePlazosRegion : undefined);
    setShowScrapePlazosModal(false);
    setScraping(true);
    wasScrapingRef.current = true;
    setShowLogModal(true);
    try {
      await proveedoresApi.scrapePlazos({
        proveedor: targetProv,
        regiones: targetReg
      });
    } catch (err) {
      console.error(err);
      setScraping(false);
      wasScrapingRef.current = false;
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

  const handleCopyPart = (part) => {
    navigator.clipboard.writeText(part);
    setCopiedPart(part);
    setTimeout(() => setCopiedPart(null), 1500);
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

  const hasActiveFilters = Boolean(search || marcaFilter || stockFilter || pdfFilter !== 'all' || sortBy || proveedorColFilter !== 'all' || regionFilter !== 'all' || selectedProvider !== 'all' || activeTab !== 'all');

  const clearAllFilters = () => {
    setSearch('');
    setMarcaFilter('');
    setStockFilter('');
    setPdfFilter('all');
    setSortBy('');
    setProveedorColFilter('all');
    setRegionFilter('all');
    setSelectedProvider('all');
    setActiveTab('all');
    setPage(0);
  };

  const kpiStats = useMemo(() => {
    // Use backend-provided global aggregates for accuracy across all pages
    const competingCount = totalCompeting;
    const totalStock = totalStockGlobal;
    const avgPrecio = fichas.length
      ? fichas.reduce((acc, curr) => {
          const p = curr.min_precio != null ? curr.min_precio : (curr.precio_ofertado || curr.precio_referencia || 0);
          return acc + p;
        }, 0) / fichas.length
      : 0;

    return {
      fichasCount: totalFichas || fichas.length,
      competingCount,
      totalStock,
      avgPrecio
    };
  }, [fichas, totalFichas, totalCompeting, totalStockGlobal]);

  // Las 14 Categorías Oficiales exactas de Perú Compras (Acuerdo 249)
  const CATEGORY_BUTTONS = [
    { id: 'all', label: 'Todas las Ofertas', count: categoriesCount.total, icon: Layers },
    
    // Catálogo 252: COMPUTADORAS DE ESCRITORIO (8 categorías)
    { id: 'escritorio', label: '🖥️ COMPUTADORA DE ESCRITORIO', count: categoriesCount.escritorio, icon: Monitor },
    { id: 'aio', label: '🖥️ COMPUTADORA TODO EN UNO', count: categoriesCount.aio, icon: MonitorCheck },
    { id: 'workstation', label: '⚙️ ESTACION DE TRABAJO', count: categoriesCount.workstation, icon: Cpu },
    { id: 'monitor', label: '📺 MONITOR', count: categoriesCount.monitor, icon: Tv },
    { id: 'pantalla_pub', label: '📺 PANTALLA PUBLICITARIA', count: categoriesCount.pantalla_pub, icon: Tv },
    { id: 'pantalla_int', label: '📺 PANTALLA INTERACTIVA', count: categoriesCount.pantalla_int, icon: Tv },
    { id: 'almacenamiento_int', label: '💾 ALMACENAMIENTO INTERNO', count: categoriesCount.almacenamiento_int, icon: HardDrive },
    { id: 'almacenamiento_ext', label: '💾 ALMACENAMIENTO EXTERNO', count: categoriesCount.almacenamiento_ext, icon: HardDrive },

    // Catálogo 250: COMPUTADORAS PORTÁTILES (3 categorías)
    { id: 'portatil', label: '💻 COMPUTADORA PORTATIL', count: categoriesCount.portatil, icon: Laptop },
    { id: 'workstation_portatil', label: '💻 ESTACION DE TRABAJO PORTATIL', count: categoriesCount.workstation_portatil, icon: Laptop },
    { id: 'tableta', label: '📱 TABLETA', count: categoriesCount.tableta, icon: Smartphone },

    // Catálogo 251: ESCÁNERES (3 categorías)
    { id: 'escaner_docs', label: '📠 ESCANER DE DOCUMENTOS', count: categoriesCount.escaner_docs, icon: Printer },
    { id: 'escaner_planos', label: '📠 ESCANER DE PLANOS', count: categoriesCount.escaner_planos, icon: Printer },
    { id: 'escaner_libros', label: '📠 ESCANER DE LIBROS', count: categoriesCount.escaner_libros, icon: Printer },
  ];

  // Helper para renderizar la columna de Proveedores
  const renderProvidersColumn = (f) => {
    const ofertas = Array.isArray(f.ofertas) && f.ofertas.length > 0
      ? f.ofertas
      : [{
          nombre_proveedor: f.proveedor || f.nombre_proveedor || 'THE KING COMPUTER',
          precio_ofertado: f.precio_ofertado
        }];

    const hasMultiple = ofertas.length > 1;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ofertas.map((o, i) => {
            const isJorge = (o.nombre_proveedor || '').toUpperCase().includes('JORGE') || (o.nombre_proveedor || '').toUpperCase().includes('ROJAS');
            const provShort = isJorge ? 'Jorge Rojas Villanueva' : 'The King Computer';
            return (
              <div
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: isJorge ? '#f0f9ff' : '#f5f3ff',
                  border: `1px solid ${isJorge ? '#bae6fd' : '#ddd6fe'}`,
                  color: isJorge ? '#0284c7' : '#7c3aed',
                  width: 'fit-content'
                }}
              >
                <Building2 size={12} />
                <span>{provShort}</span>
              </div>
            );
          })}
        </div>

        {hasMultiple ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Scale size={12} />
            {ofertas.length} Proveedores compitiendo
          </span>
        ) : (
          <span style={{ fontSize: 10, color: '#64748b' }}>
            🔒 Oferta Exclusiva
          </span>
        )}
      </div>
    );
  };

  // Helper para renderizar la columna de Comparativa de Precios
  const renderPriceComparison = (f) => {
    const ofertas = Array.isArray(f.ofertas) && f.ofertas.length > 0
      ? f.ofertas
      : [{
          nombre_proveedor: f.proveedor || f.nombre_proveedor || 'THE KING COMPUTER',
          precio_ofertado: f.precio_ofertado || f.precio_referencia,
          existencia_stock: f.existencia_stock,
          plazo_entrega_dias: f.plazo_entrega_dias
        }];

    if (ofertas.length > 1) {
      const sorted = [...ofertas].sort((a, b) => (Number(a.precio_ofertado) || 999999) - (Number(b.precio_ofertado) || 999999));
      const best = sorted[0];
      const second = sorted[1];
      const bestPrice = Number(best.precio_ofertado) || 0;
      const secondPrice = Number(second.precio_ofertado) || 0;
      const diff = secondPrice - bestPrice;
      const pctDiff = secondPrice > 0 ? ((diff / secondPrice) * 100).toFixed(1) : 0;
      const isTie = Math.abs(diff) < 0.01;

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Card de precios lado a lado */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
            {sorted.map((o, i) => {
              const isBest = i === 0 && !isTie;
              const isJorge = (o.nombre_proveedor || '').toUpperCase().includes('JORGE') || (o.nombre_proveedor || '').toUpperCase().includes('ROJAS');
              const provShort = isJorge ? 'Jorge Rojas' : 'The King';
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '2px 4px', borderRadius: 4, background: isBest ? 'rgba(34, 197, 94, 0.1)' : 'transparent' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: isBest ? 700 : 500, color: isBest ? '#15803d' : '#475569' }}>
                    {isBest ? '👑' : '•'} {provShort}:
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', color: isBest ? '#15803d' : '#0f172a', fontSize: 12 }}>
                      USD {fmt(o.precio_ofertado)}
                    </span>
                    <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>
                      ({o.existencia_stock || 0} u.)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Badge de Ganador / Diferencia */}
          {!isTie ? (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 700,
              background: '#ecfdf5',
              color: '#047857',
              border: '1px solid #a7f3d0',
              padding: '2px 6px',
              borderRadius: 4,
              width: 'fit-content'
            }}>
              <Award size={12} />
              <span>Ganador: {sorted[0].nombre_proveedor?.toUpperCase().includes('JORGE') ? 'Jorge Rojas' : 'The King'} (Ahorro: USD {fmt(diff)} / -{pctDiff}%)</span>
            </div>
          ) : (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 700,
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #cbd5e1',
              padding: '2px 6px',
              borderRadius: 4,
              width: 'fit-content'
            }}>
              <span>⚖️ Mismo precio en ambos</span>
            </div>
          )}
        </div>
      );
    }

    // Oferta individual
    const single = ofertas[0];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text-primary)', fontFamily: 'monospace' }}>
          USD {fmt(single.precio_ofertado)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)' }}>
          P. Unitario Vigente (Oferta Única)
        </span>
      </div>
    );
  };

  // Helper para renderizar la columna de Plazo de Entrega
  const renderPlazoEntrega = (f) => {
    const ofertas = Array.isArray(f.ofertas) && f.ofertas.length > 0 ? f.ofertas : [f];
    const isFilteredRegion = regionFilter !== 'all';
    const regionObj = PERU_REGIONES.find(r => r.id === regionFilter);
    const regionName = regionObj ? regionObj.name.replace('📍 ', '') : '';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
        {/* Si estamos en consolidado con múltiples ofertas */}
        {ofertas.length > 1 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            {ofertas.map((o, idx) => {
              const isJorge = (o.nombre_proveedor || '').toUpperCase().includes('JORGE') || (o.nombre_proveedor || '').toUpperCase().includes('ROJAS');
              const provLabel = isJorge ? 'Jorge Rojas' : 'The King';
              
              // Resolver plazo: si hay filtro regional, buscar en plazos_por_region con la clave normalizada
              let plazo = null;
              if (isFilteredRegion) {
                const regKey = (regionFilter || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                plazo = o.plazos_por_region?.[regKey] ?? o.plazos_por_region?.[regionFilter] ?? o.plazo_entrega_dias ?? o.plazos_por_region?.['LIMA'] ?? 90;
              } else {
                plazo = o.plazos_por_region?.['LIMA'] ?? o.plazo_entrega_dias ?? 90;
              }

              return (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11 }}>
                  <span style={{ color: isJorge ? '#0284c7' : '#7c3aed', fontWeight: 600, fontSize: 10 }}>{provLabel}:</span>
                  {plazo != null ? (
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontWeight: 700,
                      fontSize: 10,
                      background: plazo <= 2 ? '#dcfce7' : plazo <= 15 ? '#e0f2fe' : '#fef3c7',
                      color: plazo <= 2 ? '#166534' : plazo <= 15 ? '#0369a1' : '#92400e',
                      border: `1px solid ${plazo <= 2 ? '#bbf7d0' : plazo <= 15 ? '#bae6fd' : '#fde68a'}`
                    }}>
                      ⏱️ {plazo} {plazo === 1 ? 'día' : 'días'}
                    </span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontSize: 10 }}>—</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {(() => {
              const single = ofertas[0] || f;
              let plazo = null;
              if (isFilteredRegion) {
                const regKey = (regionFilter || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                plazo = single.plazos_por_region?.[regKey] ?? single.plazos_por_region?.[regionFilter] ?? f.plazo_entrega_dias ?? single.plazo_entrega_dias ?? single.plazos_por_region?.['LIMA'] ?? 90;
              } else {
                plazo = single.plazos_por_region?.['LIMA'] ?? f.min_plazo_entrega ?? f.plazo_entrega_dias ?? single.plazo_entrega_dias ?? 90;
              }

              if (plazo == null) {
                return <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>;
              }

              return (
                <>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background: plazo <= 2 ? '#dcfce7' : plazo <= 15 ? '#e0f2fe' : '#fef3c7',
                    color: plazo <= 2 ? '#166534' : plazo <= 15 ? '#0369a1' : '#92400e',
                    border: `1px solid ${plazo <= 2 ? '#bbf7d0' : plazo <= 15 ? '#bae6fd' : '#fde68a'}`
                  }}>
                    ⏱️ {plazo} {plazo === 1 ? 'día' : 'días'}
                  </span>
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    {isFilteredRegion ? `en ${regionName}` : plazo <= 2 ? '⚡ Inmediato' : plazo <= 15 ? '📦 Regular' : '🗓️ Programado'}
                  </span>
                </>
              );
            })()}
          </div>
        )}

        {/* Botón interactivo para abrir el Modal de las 25 Regiones */}
        <button
          onClick={() => { setSelectedRegionModalItem(f); setModalRegionSearch(''); setModalZoneFilter('all'); }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--c-brand)',
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 4,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            textDecoration: 'none',
            backgroundColor: 'rgba(37, 99, 235, 0.06)'
          }}
          title="Ver y comparar plazos de entrega en las 25 regiones del Perú para esta ficha"
        >
          <MapPin size={10} />
          <span>🗺️ 25 Regiones</span>
        </button>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1480, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 700, margin: 0 }}>
            <Building2 size={24} style={{ color: 'var(--c-brand)' }} />
            Comparativa y Fichas de Proveedores — Perú Compras
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--c-text-secondary)', fontSize: 13 }}>
            Consolidación de catálogo, comparador de precios por proveedor y análisis de competitividad en tiempo real
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            onClick={handleClearData}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#dc2626' }}
            title="Eliminar TODAS las ofertas y plazos de este proveedor"
          >
            <Trash2 size={15} />
            Limpiar Todo
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleClearPlazos}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#f59e0b' }}
            title="Resetear solo los plazos de entrega, conservando las ofertas"
          >
            <Trash2 size={15} />
            Limpiar Plazos
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleReclassify}
            disabled={reclassifying}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}
            title="Reorganizar automáticamente todas las ofertas según especificaciones técnicas"
          >
            <Sparkles size={15} className={reclassifying ? 'spin' : ''} />
            {reclassifying ? 'Reclasificando...' : 'Reclasificar'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => setShowScrapePlazosModal(true)}
            disabled={scraping}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}
            title="Configurar y extraer plazos de entrega vigentes por región desde MejoraPlazo"
          >
            <Clock size={15} className={scraping ? 'spin' : ''} />
            {scraping ? 'Extrayendo...' : '⏱️ Extraer Plazos'}
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
            onClick={() => handleStartScrape()}
            disabled={scraping}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600 }}
          >
            <RefreshCw size={15} className={scraping ? 'spin' : ''} />
            {scraping ? 'Extrayendo 14 Categorías...' : `⚡ Extraer Catálogo (${selectedProvider !== 'all' ? MAIN_PROVIDERS.find(p => p.id === selectedProvider)?.short : 'The King Computer'})`}
          </button>
        </div>
      </div>

      {/* Row 1: Provider Filter Pills (Estilo pestañas con indicador activo) */}
      <div className="card fade-up" style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <Building2 size={14} style={{ color: 'var(--c-brand)' }} />
          <span>Vista de Proveedor / Comparador:</span>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {MAIN_PROVIDERS.map(prov => {
            const isSelected = selectedProvider === prov.id;
            return (
              <button
                key={prov.id}
                onClick={() => { setSelectedProvider(prov.id); setPage(0); }}
                style={{
                  padding: '7px 16px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid var(--c-brand)' : '1px solid var(--c-border)',
                  background: isSelected ? 'rgba(37,99,235,0.08)' : '#fff',
                  color: isSelected ? 'var(--c-brand)' : 'var(--c-text-primary)',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: isSelected ? '0 2px 6px rgba(37,99,235,0.15)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <Building2 size={14} style={{ color: isSelected ? 'var(--c-brand)' : 'var(--c-text-tertiary)' }} />
                <span>{prov.name}</span>
                {prov.user && (
                  <span style={{ fontSize: 11, color: isSelected ? 'var(--c-brand)' : 'var(--c-text-tertiary)', fontFamily: 'monospace', fontWeight: 500 }}>
                    ({prov.user})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Official Peru Compras 14 Categories Pills with Real Scoped Counts */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
          {CATEGORY_BUTTONS.map(tab => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setPage(0); }}
                style={{
                  padding: '7px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--c-brand)' : '1px solid var(--c-border)',
                  background: isSelected ? 'var(--c-brand)' : 'var(--c-surface)',
                  color: isSelected ? '#fff' : 'var(--c-text-secondary)',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: isSelected ? '0 2px 6px rgba(37,99,235,0.2)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                  color: isSelected ? '#fff' : 'var(--c-text-primary)',
                  padding: '1px 6px',
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 700
                }}>
                  {tab.count != null ? tab.count.toLocaleString('es-PE') : '...'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Extraction Log & Status Panel */}
      {(showLogModal || scraping || (scrapeStatus && scrapeStatus.logs?.length > 0)) && (
        <div className="card fade-up" style={{ marginBottom: 20, padding: 16, border: '1px solid var(--c-brand)', background: 'var(--c-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, margin: 0, color: 'var(--c-brand)' }}>
              <RefreshCw size={16} className={scraping ? 'spin' : ''} />
              Extracción en Vivo — {scrapeStatus?.provider_name || 'Perú Compras'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`tag ${scraping ? 'tag-primary' : scrapeStatus?.status === 'error' ? 'tag-danger' : 'tag-success'}`}>
                {scraping ? `Procesando 14 categorías oficiales (${scrapeStatus?.combos_completed || 0}/${scrapeStatus?.combos_total || 14})` : scrapeStatus?.status === 'error' ? 'Falla' : 'Completado'}
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
            <div className="stat-label">Fichas Únicas ({selectedProvider !== 'all' ? MAIN_PROVIDERS.find(p => p.id === selectedProvider)?.short : 'Global'})</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
            <Scale size={18} />
          </div>
          <div>
            <div className="stat-value">{kpiStats.competingCount} productos</div>
            <div className="stat-label">Con Competencia / Doble Oferta</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(5,150,105,0.1)', color: 'var(--c-success)' }}>
            <TrendingUp size={18} />
          </div>
          <div>
            <div className="stat-value">{kpiStats.totalStock} unid.</div>
            <div className="stat-label">Stock Total en Vista</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--c-warning)' }}>
            <DollarSign size={18} />
          </div>
          <div>
            <div className="stat-value">USD {fmt(kpiStats.avgPrecio)}</div>
            <div className="stat-label">Precio Promedio de Referencia</div>
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
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-secondary)' }}>Filtro Proveedor:</span>
            <select
              className="form-select"
              value={proveedorColFilter}
              onChange={(e) => { setProveedorColFilter(e.target.value); setPage(0); }}
              style={{ width: 170, fontSize: 12, padding: '4px 8px' }}
            >
              <option value="all">Todos los Proveedores</option>
              <option value="ambos">✨ Ambos (Con Competencia)</option>
              <option value="exclusivo">🔒 Solo 1 (Oferta Exclusiva)</option>
              <option value="thekingcomputer">🏢 Solo The King Computer</option>
              <option value="jorge_rojas">🏢 Solo Jorge Rojas</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <MapPin size={13} style={{ color: 'var(--c-brand)' }} />
              Región:
            </span>
            <select
              className="form-select"
              value={regionFilter}
              onChange={(e) => { setRegionFilter(e.target.value); setPage(0); }}
              style={{ width: 190, fontSize: 12, padding: '4px 8px' }}
              title="Filtrar por región o departamento de entrega"
            >
              {PERU_REGIONES.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
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

          {hasActiveFilters && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={clearAllFilters}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 12 }}
            >
              <X size={13} />
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="card fade-up" style={{ padding: 0, overflow: 'visible', border: '1px solid var(--c-border)' }}>
        <div className="card-header" style={{ padding: '12px 18px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
            <FileText size={16} style={{ color: 'var(--c-brand)' }} />
            Tabla Comparativa de Ofertas ({CATEGORY_BUTTONS.find(b => b.id === activeTab)?.label}) — {selectedProvider !== 'all' ? MAIN_PROVIDERS.find(p => p.id === selectedProvider)?.name : 'Todos los Proveedores (Consolidado)'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--c-text-secondary)' }}>
            Mostrando <strong>{fichas.length}</strong> de <strong>{totalFichas.toLocaleString('es-PE')}</strong> fichas (Pág. {page + 1} de {Math.max(1, Math.ceil(totalFichas / limit))})
          </span>
        </div>

        <div className="table-wrap" style={{ overflow: 'visible' }}>
          <table className="data-table" style={{ fontSize: '0.84rem', width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--c-border)' }}>
                {/* 1. Marca & Código */}
                <th style={{ width: 170, padding: '10px 14px' }}>
                  <HeaderFilter
                    title="Marca & Código"
                    column="marca"
                    currentFilter={marcaFilter}
                    onFilterChange={(v) => { setMarcaFilter(v); setPage(0); }}
                    apiCall={proveedoresApi.getColumnFilter}
                  />
                </th>

                {/* 2. Ficha Técnica / Especificaciones */}
                <th style={{ padding: '10px 14px', minWidth: 260 }}>
                  <span>Ficha Técnica / Especificaciones</span>
                </th>

                {/* 3. Columna de Proveedores Oferentes con Filtro */}
                <th style={{ width: 230, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Building2 size={13} style={{ color: 'var(--c-brand)' }} />
                        <span>Proveedores Oferentes</span>
                      </div>
                    </div>
                    <select
                      className="form-select"
                      value={proveedorColFilter}
                      onChange={(e) => { setProveedorColFilter(e.target.value); setPage(0); }}
                      style={{ fontSize: 11, padding: '2px 6px', height: 26, background: '#fff' }}
                      title="Filtrar por competencia o proveedor"
                    >
                      <option value="all">Ver Todos</option>
                      <option value="ambos">✨ Ambos (Con Competencia)</option>
                      <option value="exclusivo">🔒 Solo 1 Proveedor</option>
                      <option value="thekingcomputer">👑 Solo The King Computer</option>
                      <option value="jorge_rojas">🏢 Solo Jorge Rojas</option>
                    </select>
                  </div>
                </th>

                {/* 4. Columna de Comparativa de Precios */}
                <th 
                  onClick={() => toggleSort('precio')}
                  style={{ width: 290, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Precio"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Scale size={13} style={{ color: 'var(--c-brand)' }} />
                      <span>Comparativa de Precios</span>
                    </div>
                    {sortBy === 'precio_asc' ? (
                      <ArrowUp size={12} style={{ color: 'var(--c-brand)' }} />
                    ) : sortBy === 'precio_desc' ? (
                      <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                    ) : (
                      <ChevronsUpDown size={12} style={{ color: 'var(--c-text-tertiary)' }} />
                    )}
                  </div>
                </th>

                {/* 5. Plazo de Entrega */}
                <th style={{ width: 140, textAlign: 'center', padding: '10px 14px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Clock size={13} style={{ color: 'var(--c-brand)' }} />
                    <span>Plazo de Entrega</span>
                  </div>
                </th>

                {/* 6. Stock Total */}
                <th 
                  onClick={() => toggleSort('stock')}
                  style={{ width: 95, textAlign: 'center', padding: '10px 10px', cursor: 'pointer', userSelect: 'none' }}
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

                {/* 7. PDF Ficha Técnica con Filtro */}
                <th style={{ width: 115, textAlign: 'center', padding: '8px 6px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <FileText size={13} style={{ color: '#dc2626' }} />
                      <span style={{ fontWeight: 600 }}>PDF</span>
                    </div>
                    <select
                      className="form-select"
                      value={pdfFilter}
                      onChange={(e) => { setPdfFilter(e.target.value); setPage(0); }}
                      style={{ fontSize: 11, padding: '2px 4px', height: 26, width: '100%', background: '#fff' }}
                      title="Filtrar por disponibilidad de PDF"
                    >
                      <option value="all">Ver Todos</option>
                      <option value="with_pdf">📄 Con PDF</option>
                      <option value="no_pdf">❌ Sin PDF</option>
                    </select>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 36, color: 'var(--c-text-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={16} className="spin" />
                      <span>Cargando datos de la base de datos...</span>
                    </div>
                  </td>
                </tr>
              ) : fichas.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 36, color: 'var(--c-text-tertiary)' }}>
                    No hay ofertas con los filtros aplicados. Puedes cambiar los filtros o extraer nuevas categorías.
                  </td>
                </tr>
              ) : (
                fichas.map((f, idx) => {
                  const specs = parseSpecs(f.descripcion, f.categoria, f.catalogo);
                  const isExpanded = expandedDescId === f.id;
                  const isCopiedThis = copiedPart === f.nro_parte;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--c-border)', transition: 'background 0.1s' }}>
                      {/* 1. Marca & Nro Parte & Categoría */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--c-text-primary)' }}>
                              {f.nro_parte || 'S/N'}
                            </span>
                            {f.nro_parte && f.nro_parte !== 'S/N' && (
                              <button
                                onClick={() => handleCopyPart(f.nro_parte)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: isCopiedThis ? '#16a34a' : 'var(--c-text-tertiary)' }}
                                title="Copiar N° Parte"
                              >
                                {isCopiedThis ? <Check size={11} /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>

                          <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>
                            {f.categoria || f.catalogo || 'Perú Compras'}
                          </span>
                        </div>
                      </td>

                      {/* 2. Ficha Tecnica / Especificaciones */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {/* Titulo Limpio */}
                          <div style={{ fontWeight: 600, color: 'var(--c-text-primary)', fontSize: 13 }}>
                            {specs.marca !== 'VARIOS' ? `${specs.marca} ` : ''}{specs.modelo}
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

                      {/* 3. Columna de Proveedores Oferentes */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        {renderProvidersColumn(f)}
                      </td>

                      {/* 4. Columna de Comparativa de Precios */}
                      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                        {renderPriceComparison(f)}
                      </td>

                      {/* 5. Plazo de Entrega */}
                      <td style={{ padding: '10px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                        {renderPlazoEntrega(f)}
                      </td>

                      {/* 6. Stock Total */}
                      <td style={{ padding: '10px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{ 
                            display: 'inline-block',
                            padding: '2px 7px', 
                            borderRadius: 4, 
                            fontSize: 11, 
                            fontWeight: 700,
                            background: (f.existencia_stock > 0) ? '#eff6ff' : '#f8fafc',
                            color: (f.existencia_stock > 0) ? '#1d4ed8' : '#64748b',
                            border: '1px solid #e2e8f0'
                          }}>
                            {f.existencia_stock > 0 ? `${f.existencia_stock} unid.` : '0 unid.'}
                          </span>
                          <span style={{ fontSize: 9, color: '#94a3b8' }}>
                            Disponible
                          </span>
                        </div>
                      </td>

                      {/* 7. Columna PDF Ficha Técnica */}
                      <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                        {f.pdf_url && f.pdf_url.trim() !== '' && f.pdf_url !== '#' ? (
                          <a
                            href={f.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              padding: '5px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              textDecoration: 'none',
                              transition: 'all 0.15s ease',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(220,38,38,0.06)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#fee2e2';
                              e.currentTarget.style.borderColor = '#fca5a5';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = '#fef2f2';
                              e.currentTarget.style.borderColor = '#fecaca';
                            }}
                            title={`Descargar / Abrir Ficha Técnica PDF (${f.nro_parte || ''})`}
                          >
                            <FileText size={13} style={{ color: '#dc2626' }} />
                            <span>PDF</span>
                          </a>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 500 }} title="Ficha técnica no adjunta aún">
                            —
                          </span>
                        )}
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
                N° Parte: <strong>{selectedJsonItem.nro_parte}</strong> | Ofertas: <strong>{selectedJsonItem.ofertas?.length || 1}</strong>
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

      {/* Regional Delivery Timeframe Breakdown Modal (25 Regions) */}
      {selectedRegionModalItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div className="card fade-up" style={{
            width: '100%',
            maxWidth: 920,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--c-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              background: '#f8fafc',
              gap: 12
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={18} style={{ color: 'var(--c-brand)' }} />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    Plazos de Entrega por Región — 25 Departamentos del Perú
                  </h3>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--c-text-secondary)' }}>
                  <strong>{selectedRegionModalItem.marca}</strong> | N° Parte: <code style={{ fontFamily: 'monospace', fontWeight: 700 }}>{selectedRegionModalItem.nro_parte}</code> — {selectedRegionModalItem.descripcion?.substring(0, 75)}…
                </p>
              </div>
              <button 
                onClick={() => setSelectedRegionModalItem(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)', padding: 4 }}
                title="Cerrar ventana"
              >
                <X size={20} />
              </button>
            </div>

            {/* Filter and Search Toolbar */}
            <div style={{
              padding: '10px 20px',
              borderBottom: '1px solid var(--c-border)',
              background: '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10
            }}>
              {/* Search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--c-text-tertiary)' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Buscar departamento (ej. Piura, Huánuco, Cusco, Arequipa)..."
                  value={modalRegionSearch}
                  onChange={(e) => setModalRegionSearch(e.target.value)}
                  style={{ paddingLeft: 30, fontSize: 12, height: 32, width: '100%' }}
                />
                {modalRegionSearch && (
                  <button 
                    onClick={() => setModalRegionSearch('')}
                    style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Zone Filter Chips */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['all', 'Lima/Callao', 'Costa', 'Sierra', 'Selva'].map((zone) => (
                  <button
                    key={zone}
                    onClick={() => setModalZoneFilter(zone)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 14,
                      fontSize: 11,
                      fontWeight: modalZoneFilter === zone ? 700 : 500,
                      border: '1px solid',
                      borderColor: modalZoneFilter === zone ? 'var(--c-brand)' : '#e2e8f0',
                      background: modalZoneFilter === zone ? 'var(--c-brand)' : '#f8fafc',
                      color: modalZoneFilter === zone ? '#fff' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.1s'
                    }}
                  >
                    {zone === 'all' ? 'Todas (25)' : zone === 'Lima/Callao' ? '🏛️ Lima/Callao' : zone === 'Costa' ? '🏖️ Costa' : zone === 'Sierra' ? '🏔️ Sierra' : '🌴 Selva'}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body: Regions Cards Grid */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
              {(() => {
                const itemOffers = Array.isArray(selectedRegionModalItem.ofertas) && selectedRegionModalItem.ofertas.length > 0
                  ? selectedRegionModalItem.ofertas
                  : [selectedRegionModalItem];

                const filteredRegionsList = PERU_REGIONES.filter(r => {
                  if (r.id === 'all') return false;
                  if (modalZoneFilter !== 'all' && r.zona !== modalZoneFilter) return false;
                  if (modalRegionSearch.trim()) {
                    const q = modalRegionSearch.toLowerCase();
                    return r.name.toLowerCase().includes(q) || (r.capital && r.capital.toLowerCase().includes(q));
                  }
                  return true;
                });

                if (filteredRegionsList.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-tertiary)' }}>
                      No se encontraron regiones con el término "{modalRegionSearch}".
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                    {filteredRegionsList.map((reg) => {
                      // Calcular plazos por proveedor
                      const providerPlazos = itemOffers.map((o) => {
                        const isJorge = (o.nombre_proveedor || '').toUpperCase().includes('JORGE') || (o.nombre_proveedor || '').toUpperCase().includes('ROJAS');
                        const provLabel = isJorge ? 'Jorge Rojas' : 'The King';
                        const provRuc = o.ruc_proveedor || (isJorge ? '10408899991' : '20601234567');
                        let plazo = null;
                        if (o.plazos_por_region && o.plazos_por_region[reg.id] != null) {
                          plazo = o.plazos_por_region[reg.id];
                        } else if (selectedRegionModalItem.plazos_por_region && selectedRegionModalItem.plazos_por_region[reg.id] != null) {
                          plazo = selectedRegionModalItem.plazos_por_region[reg.id];
                        } else {
                          plazo = o.plazos_por_region?.['LIMA'] ?? o.plazo_entrega_dias ?? selectedRegionModalItem.plazo_entrega_dias ?? 90;
                        }
                        return { provLabel, provRuc, isJorge, plazo, precio: o.precio_ofertado };
                      });

                      const hasMultiple = providerPlazos.length > 1;
                      const validPlazos = providerPlazos.filter(p => p.plazo != null);
                      const minPlazo = validPlazos.length > 0 ? Math.min(...validPlazos.map(p => p.plazo)) : null;

                      return (
                        <div 
                          key={reg.id} 
                          style={{
                            background: '#fff',
                            border: regionFilter === reg.id ? '2px solid var(--c-brand)' : '1px solid var(--c-border)',
                            borderRadius: 8,
                            padding: '10px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: 8,
                            boxShadow: regionFilter === reg.id ? '0 4px 6px -1px rgba(37, 99, 235, 0.15)' : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                            position: 'relative'
                          }}
                        >
                          {/* Top: Region name & Zona */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <MapPin size={13} style={{ color: 'var(--c-brand)' }} />
                                <span>{reg.name}</span>
                              </div>
                              <div style={{ fontSize: 10, color: '#64748b' }}>
                                {reg.capital}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: '#f1f5f9',
                              color: '#475569'
                            }}>
                              {reg.zona}
                            </span>
                          </div>

                          {/* Middle: Provider comparison */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#f8fafc', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                            {providerPlazos.map((p, pIdx) => {
                              const isFastest = minPlazo != null && p.plazo === minPlazo && hasMultiple;
                              return (
                                <div key={pIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                                  <span style={{ fontWeight: 600, color: p.isJorge ? '#0284c7' : '#7c3aed' }}>
                                    {p.provLabel}:
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {p.plazo != null ? (
                                      <span style={{
                                        fontWeight: 700,
                                        fontSize: 11,
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                        background: p.plazo <= 2 ? '#dcfce7' : p.plazo <= 15 ? '#e0f2fe' : '#fef3c7',
                                        color: p.plazo <= 2 ? '#166534' : p.plazo <= 15 ? '#0369a1' : '#92400e',
                                        border: `1px solid ${p.plazo <= 2 ? '#bbf7d0' : p.plazo <= 15 ? '#bae6fd' : '#fde68a'}`
                                      }}>
                                        ⏱️ {p.plazo} {p.plazo === 1 ? 'día' : 'días'}
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8', fontSize: 10 }}>—</span>
                                    )}
                                    {isFastest && (
                                      <span title="Entrega más rápida" style={{ fontSize: 10 }}>⚡</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Bottom: Quick Select Button */}
                          <button
                            onClick={() => {
                              setRegionFilter(reg.id);
                              setSelectedRegionModalItem(null);
                              setPage(0);
                            }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: regionFilter === reg.id ? '1px solid var(--c-brand)' : '1px solid #cbd5e1',
                              background: regionFilter === reg.id ? '#eff6ff' : '#fff',
                              color: regionFilter === reg.id ? 'var(--c-brand)' : '#334155',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title={`Filtrar toda la tabla para la región de ${reg.name}`}
                          >
                            {regionFilter === reg.id ? (
                              <>
                                <Check size={12} style={{ color: 'var(--c-brand)' }} />
                                <span>Región Seleccionada</span>
                              </>
                            ) : (
                              <>
                                <span>Filtrar por {reg.name}</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--c-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <span style={{ fontSize: 12, color: 'var(--c-text-secondary)' }}>
                📍 Mostrando plazos vigentes oficiales extraídos de <strong>Perú Compras MejoraPlazo</strong>
              </span>

              <div style={{ display: 'flex', gap: 8 }}>
                {regionFilter !== 'all' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setRegionFilter('all'); setSelectedRegionModalItem(null); setPage(0); }}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    Ver Todas las Regiones
                  </button>
                )}
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setSelectedRegionModalItem(null)}
                  style={{ padding: '4px 14px', fontSize: 12 }}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scrape Plazos Configuration Modal */}
      {showScrapePlazosModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div className="card fade-up" style={{
            width: '100%',
            maxWidth: 480,
            padding: 0,
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--c-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} style={{ color: 'var(--c-brand)' }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  Configurar Extracción de Plazos
                </h3>
              </div>
              <button 
                onClick={() => setShowScrapePlazosModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Proveedor selector */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 6 }}>
                  🏢 Proveedor a Consultar en MejoraPlazo:
                </label>
                <select
                  className="form-select"
                  value={scrapePlazosProvider}
                  onChange={(e) => setScrapePlazosProvider(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '8px 12px' }}
                >
                  <option value="all">⚡ Ambos Proveedores (The King + Jorge Rojas)</option>
                  <option value="thekingcomputer">🏢 THE KING COMPUTER E.I.R.L. (estalin.huamali01)</option>
                  <option value="jorge_rojas">🏢 ROJAS VILLANUEVA JORGE LUIS (neison.chacas)</option>
                </select>
                <p style={{ margin: '4px 0 0 0', fontSize: 11, color: 'var(--c-text-secondary)' }}>
                  Se extraerán los plazos oficiales de entrega para todas las fichas de catálogo.
                </p>
              </div>

              {/* Región selector */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-primary)', marginBottom: 6 }}>
                  📍 Alcance Regional:
                </label>
                <select
                  className="form-select"
                  value={scrapePlazosRegion}
                  onChange={(e) => setScrapePlazosRegion(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '8px 12px' }}
                >
                  <option value="all">🗺️ Todas las 25 Regiones del Perú (Completo)</option>
                  {PERU_REGIONES.filter(r => r.id !== 'all').map(r => (
                    <option key={r.id} value={r.id}>📍 Solo {r.name} ({r.zona})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--c-border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              background: '#f8fafc'
            }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowScrapePlazosModal(false)}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleStartScrapePlazos(scrapePlazosProvider, scrapePlazosRegion)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', fontSize: 12, fontWeight: 600 }}
              >
                <Clock size={14} />
                Iniciar Extracción
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProveedorFichas;
