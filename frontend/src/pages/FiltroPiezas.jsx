import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cpu, HardDrive, Monitor, Layers, Search, Filter,
  ExternalLink, Building2, LayoutGrid, List, Sparkles, X, RefreshCw,
  SlidersHorizontal, Laptop, Printer, Smartphone, Clock,
  FileText, Check, Copy, AlertCircle, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Tv, MonitorCheck, Wifi, Shield,
  Briefcase, Disc, Camera, Touchpad, Cable
} from 'lucide-react';
import { proveedoresApi } from '../services/api';
import { parseProductSpecs } from '../utils/specsParser';

const REGIONES_PERU = [
  'LIMA', 'CALLAO', 'AREQUIPA', 'CUSCO', 'LA LIBERTAD', 'PIURA', 'LAMBAYEQUE',
  'ANCASH', 'JUNIN', 'ICA', 'LORETO', 'SAN MARTIN', 'CAJAMARCA', 'HUANUCO',
  'AYACUCHO', 'PUNO', 'TACNA', 'UCAYALI', 'PASCO', 'TUMBES', 'MOQUEGUA',
  'AMAZONAS', 'APURIMAC', 'HUANCAVELICA', 'MADRE DE DIOS'
];

const formatMesOrden = (fechaStr, ordenStr) => {
  if (fechaStr) {
    try {
      const d = new Date(fechaStr.includes('T') ? fechaStr : `${fechaStr}T12:00:00`);
      if (!isNaN(d.getTime())) {
        const mes = d.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
        return mes.charAt(0).toUpperCase() + mes.slice(1);
      }
    } catch (_) {}
  }
  if (ordenStr) {
    const yMatch = ordenStr.match(/202[0-9]/);
    if (yMatch) return `Año ${yMatch[0]}`;
  }
  return null;
};

const getAntiguedadBadge = (fechaStr, ordenStr) => {
  let dateObj = null;
  if (fechaStr) {
    const d = new Date(fechaStr.includes('T') ? fechaStr : `${fechaStr}T12:00:00`);
    if (!isNaN(d.getTime())) dateObj = d;
  } else if (ordenStr) {
    const y = ordenStr.match(/202[0-9]/);
    if (y) dateObj = new Date(`${y[0]}-06-01`);
  }
  if (!dateObj) return null;

  const now = new Date();
  const diffMonths = (now.getFullYear() - dateObj.getFullYear()) * 12 + (now.getMonth() - dateObj.getMonth());

  if (diffMonths <= 3) {
    return { text: 'Reciente', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' };
  } else if (diffMonths <= 12) {
    return { text: `${diffMonths}m atrás`, color: '#0284c7', bg: 'rgba(2,132,199,0.1)' };
  } else {
    const years = Math.max(1, Math.floor(diffMonths / 12));
    return { text: `Antigua (${years}a)`, color: '#b45309', bg: 'rgba(180,83,9,0.1)' };
  }
};

const CATEGORIAS_CONFIG = [
  { id: 'all', label: 'Todas las Categorías', icon: Layers, type: 'all' },
  
  // Computadoras Portátiles
  { id: 'portatil', label: '💻 Portátiles / Laptops', icon: Laptop, type: 'laptop' },
  { id: 'workstation_portatil', label: '💼 Workstations Portátiles', icon: Laptop, type: 'laptop' },
  { id: 'tableta', label: '📱 Tabletas', icon: Smartphone, type: 'tablet' },

  // Computadoras de Escritorio
  { id: 'escritorio', label: '🖥️ PCs de Escritorio', icon: Monitor, type: 'desktop' },
  { id: 'aio', label: '🖥️ All in One (AIO)', icon: MonitorCheck, type: 'aio' },
  { id: 'workstation', label: '⚡ Workstations Torre', icon: Cpu, type: 'desktop' },

  // Pantallas y Monitores
  { id: 'monitor', label: '📺 Monitores', icon: Tv, type: 'monitor' },
  { id: 'pantalla_pub', label: '📺 Pantallas Publicitarias', icon: Tv, type: 'display' },
  { id: 'pantalla_int', label: '👆 Pantallas Interactivas', icon: Tv, type: 'display' },

  // Almacenamiento
  { id: 'almacenamiento_int', label: '💽 Almacenamiento Interno', icon: HardDrive, type: 'storage' },
  { id: 'almacenamiento_ext', label: '💾 Almacenamiento Externo', icon: HardDrive, type: 'storage' },

  // Escáneres
  { id: 'escaner_docs', label: '📄 Escáner de Documentos', icon: Printer, type: 'scanner' },
  { id: 'escaner_planos', label: '🗺️ Escáner de Planos', icon: Printer, type: 'scanner' },
  { id: 'escaner_libros', label: '📖 Escáner de Libros', icon: Printer, type: 'scanner' },
];

const CPU_OPTIONS = [
  'Todos',
  'Intel Core i3',
  'Intel Core i5',
  'Intel Core i7',
  'Intel Core i9',
  'Intel Celeron',
  'Intel Pentium',
  'Intel Xeon',
  'AMD Ryzen 3',
  'AMD Ryzen 5',
  'AMD Ryzen 7',
  'AMD Ryzen 9',
];

const CPU_GEN_OPTIONS = [
  'Todos',
  '14ª Gen (Intel Core i-14xxx)',
  '13ª Gen (Intel Core i-13xxx)',
  '12ª Gen (Intel Core i-12xxx)',
  '11ª Gen (Intel Core i-11xxx)',
  '10ª Gen (Intel Core i-10xxx)',
  'Core Ultra (Series 1)',
  'AMD Ryzen 7000 / 8000',
  'AMD Ryzen 5000',
];

const RAM_OPTIONS = [
  'Todos',
  '4 GB',
  '8 GB',
  '12 GB',
  '16 GB',
  '24 GB',
  '32 GB',
  '64 GB',
  '128 GB',
];

const RAM_TECH_OPTIONS = [
  'Todos',
  'DDR4',
  'DDR5',
  'LPDDR5 / LPDDR5X',
];

const STORAGE_OPTIONS = [
  'Todos',
  '128 GB SSD',
  '256 GB SSD',
  '512 GB SSD',
  '1 TB SSD',
  '2 TB SSD',
  '1 TB HDD',
  '2 TB HDD',
];

const DISCO_TIPO_OPTIONS = [
  'Todos',
  'NVMe M.2 SSD (Alta velocidad)',
  'M.2 SSD',
  'Solo SSD (SATA / M.2)',
  'Híbrido (SSD + HDD)',
  'Solo HDD (Mecánico)',
];

const VGA_OPTIONS = [
  'Todos',
  'Con VGA (SI)',
  'Sin VGA (NO)',
];

const HDMI_OPTIONS = [
  'Todos',
  'Con HDMI (SI)',
  'Sin HDMI (NO)',
];

const WIFI_OPTIONS = [
  'Todos',
  'Con Wi-Fi / WLAN (SI)',
  'Sin Wi-Fi (NO)',
];

const LAN_OPTIONS = [
  'Todos',
  'Con Puerto LAN (RJ45)',
  'Sin LAN',
];

const OFFICE_OPTIONS = [
  'Todos',
  'Con Office Home & Business (2021/2024)',
  'Con Office preinstalado',
  'Sin Office / Licencia Libre',
];

const GARANTIA_OPTIONS = [
  'Todos',
  '36 Meses (3 Años On-Site)',
  '24 Meses (2 Años)',
  '12 Meses (1 Año)',
];

const UNIDAD_OPTICA_OPTIONS = [
  'Todos',
  'Con Lector DVD / Unidad Óptica',
  'Sin Unidad Óptica',
];

const CAMARA_OPTIONS = [
  'Todos',
  'Con Cámara Web (SI)',
  'Sin Cámara Web (NO)',
];

const TACTIL_OPTIONS = [
  'Todos',
  'Pantalla Táctil (Touch)',
  'No Táctil',
];

const LAPTOP_DISPLAY_OPTIONS = [
  'Todos',
  '11.6"',
  '13.3"',
  '14"',
  '15.6"',
  '16"',
  '17.3"',
];

const MONITOR_DISPLAY_OPTIONS = [
  'Todos',
  '19.5"',
  '21.5"',
  '23.8"',
  '24"',
  '27"',
  '31.5"',
  '32"',
  '43"',
  '55"',
  '65"',
  '75"',
  '85"',
];

const TABLET_DISPLAY_OPTIONS = [
  'Todos',
  '8"',
  '8.7"',
  '10.1"',
  '10.4"',
  '10.5"',
  '11"',
  '12.4"',
];

const PANEL_OPTIONS = [
  'Todos',
  'IPS',
  'VA',
  'TN',
  'OLED',
];

const RESOLUTION_OPTIONS = [
  'Todos',
  'HD (1366x768)',
  'HD+ (1600x900)',
  'FHD (1920x1080)',
  '2K QHD (2560x1440)',
  '4K UHD (3840x2160)',
];

const OS_OPTIONS = [
  'Todos',
  'Windows 11 Pro',
  'Windows 11 Home',
  'Windows 10 Pro',
  'FreeDOS / Sin SO',
  'Linux / Ubuntu',
];

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FiltroPiezas = () => {
  const navigate = useNavigate();

  // ── States ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [items, setItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  
  // Provider & Category Selection
  const [selectedProveedor, setSelectedProveedor] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('LIMA');
  const [soloConStock, setSoloConStock] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Category counts from API
  const [categoriesCount, setCategoriesCount] = useState({});

  // ── Technical Spec Filters ──────────────────────────────────────────────
  const [filterMarca, setFilterMarca] = useState('Todos');
  const [filterCpu, setFilterCpu] = useState('Todos');
  const [filterCpuGen, setFilterCpuGen] = useState('Todos');
  const [filterRam, setFilterRam] = useState('Todos');
  const [filterRamTech, setFilterRamTech] = useState('Todos');
  const [filterStorage, setFilterStorage] = useState('Todos');
  const [filterDiscoTipo, setFilterDiscoTipo] = useState('Todos');

  // Video & Connectivity Ports
  const [filterVga, setFilterVga] = useState('Todos');
  const [filterHdmi, setFilterHdmi] = useState('Todos');
  const [filterWifi, setFilterWifi] = useState('Todos');
  const [filterLan, setFilterLan] = useState('Todos');
  const [filterBluetooth, setFilterBluetooth] = useState('Todos');

  // Software, Warranty & Peripherals
  const [filterOffice, setFilterOffice] = useState('Todos');
  const [filterGarantia, setFilterGarantia] = useState('Todos');
  const [filterUnidadOptica, setFilterUnidadOptica] = useState('Todos');
  const [filterCamara, setFilterCamara] = useState('Todos');
  const [filterTactil, setFilterTactil] = useState('Todos');

  // Display & OS
  const [filterDisplay, setFilterDisplay] = useState('Todos');
  const [filterPanel, setFilterPanel] = useState('Todos');
  const [filterResolution, setFilterResolution] = useState('Todos');
  const [filterOs, setFilterOs] = useState('Todos');

  // UI accordion for secondary filters
  const [showMoreFilters, setShowMoreFilters] = useState(true);

  // Dynamic Marcas from Backend
  const [availableMarcas, setAvailableMarcas] = useState(['Todos']);

  const [copiedPart, setCopiedPart] = useState(null);

  // ── Fetch available brands from database ────────────────────────────────
  useEffect(() => {
    proveedoresApi.getColumnFilter('marca')
      .then(res => {
        if (res.data?.values) {
          setAvailableMarcas(['Todos', ...res.data.values.filter(Boolean).sort()]);
        }
      })
      .catch(() => {});
  }, []);

  // ── Fetch category counts ───────────────────────────────────────────────
  const fetchCounts = useCallback(async (prov) => {
    try {
      const res = await proveedoresApi.getCategoriesCount({
        proveedor: prov !== 'all' ? prov : undefined
      });
      if (res.data) {
        setCategoriesCount(res.data);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchCounts(selectedProveedor);
  }, [selectedProveedor, fetchCounts]);

  // ── Fetch Catalog Items from Backend with Global Specs Filtering ────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = {
        page,
        limit,
        region: selectedRegion,
      };
      if (selectedProveedor !== 'all') params.proveedor = selectedProveedor;
      if (selectedCategory !== 'all') params.categoria = selectedCategory;
      if (soloConStock) params.stock_filter = 'with_stock';
      if (search.trim()) params.search = search.trim();
      if (filterMarca !== 'Todos') params.marca = filterMarca;
      if (filterCpu !== 'Todos') params.cpu = filterCpu;
      
      if (filterCpuGen !== 'Todos') {
        if (filterCpuGen.includes('14')) params.cpu_gen = 'gen14';
        else if (filterCpuGen.includes('13')) params.cpu_gen = 'gen13';
        else if (filterCpuGen.includes('12')) params.cpu_gen = 'gen12';
        else if (filterCpuGen.includes('11')) params.cpu_gen = 'gen11';
        else if (filterCpuGen.includes('10')) params.cpu_gen = 'gen10';
        else if (filterCpuGen.includes('Ultra')) params.cpu_gen = 'ultra';
        else if (filterCpuGen.includes('7000')) params.cpu_gen = 'ryzen7000';
        else if (filterCpuGen.includes('5000')) params.cpu_gen = 'ryzen5000';
      }

      if (filterRam !== 'Todos') params.ram = filterRam;
      if (filterRamTech !== 'Todos') {
        if (filterRamTech.includes('DDR5')) params.ram_tech = 'DDR5';
        else if (filterRamTech.includes('DDR4')) params.ram_tech = 'DDR4';
        else if (filterRamTech.includes('LPDDR')) params.ram_tech = 'LPDDR5';
      }

      if (filterStorage !== 'Todos') params.disco = filterStorage;
      if (filterDiscoTipo !== 'Todos') {
        if (filterDiscoTipo.includes('NVMe')) params.disco_tipo = 'NVMe';
        else if (filterDiscoTipo.includes('M.2')) params.disco_tipo = 'M.2';
        else if (filterDiscoTipo.includes('Híbrido')) params.disco_tipo = 'hibrido';
        else if (filterDiscoTipo.includes('Solo SSD')) params.disco_tipo = 'solo_ssd';
        else if (filterDiscoTipo.includes('Solo HDD')) params.disco_tipo = 'solo_hdd';
      }

      if (filterVga !== 'Todos') params.vga = filterVga.includes('Con') ? 'si' : 'no';
      if (filterHdmi !== 'Todos') params.hdmi = filterHdmi.includes('Con') ? 'si' : 'no';
      if (filterWifi !== 'Todos') params.wifi = filterWifi.includes('Con') ? 'si' : 'no';
      if (filterLan !== 'Todos') params.lan = filterLan.includes('Con') ? 'si' : 'no';
      if (filterBluetooth !== 'Todos') params.bluetooth = filterBluetooth.includes('Con') ? 'si' : 'no';

      if (filterOffice !== 'Todos') {
        if (filterOffice.includes('Business')) params.office = 'home_business';
        else if (filterOffice.includes('preinstalado')) params.office = 'si';
        else if (filterOffice.includes('Sin')) params.office = 'no';
      }

      if (filterGarantia !== 'Todos') {
        if (filterGarantia.includes('36')) params.garantia = '36';
        else if (filterGarantia.includes('24')) params.garantia = '24';
        else if (filterGarantia.includes('12')) params.garantia = '12';
      }

      if (filterUnidadOptica !== 'Todos') params.unidad_optica = filterUnidadOptica.includes('Con') ? 'si' : 'no';
      if (filterCamara !== 'Todos') params.camara = filterCamara.includes('Con') ? 'si' : 'no';
      if (filterTactil !== 'Todos') params.tactil = filterTactil.includes('Táctil') ? 'si' : 'no';

      if (filterDisplay !== 'Todos') params.pantalla = filterDisplay;
      if (filterPanel !== 'Todos') params.panel = filterPanel;
      if (filterResolution !== 'Todos') params.resolucion = filterResolution;
      if (filterOs !== 'Todos') params.so = filterOs;

      const res = await proveedoresApi.getFichas(params);
      const raw = res.data?.items || [];
      setTotalItems(res.data?.total ?? raw.length);
      
      // Parse specs for each item
      const enriched = raw.map(item => ({
        ...item,
        specs: parseProductSpecs(item)
      }));
      setItems(enriched);
    } catch (err) {
      console.error('Error fetching piezas data:', err);
      setErrorMsg(err?.response?.data?.detail || err.message || 'Error al cargar los productos');
      setItems([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [
    selectedProveedor, selectedCategory, selectedRegion, soloConStock,
    search, filterMarca, filterCpu, filterCpuGen, filterRam, filterRamTech,
    filterStorage, filterDiscoTipo, filterVga, filterHdmi, filterWifi, filterLan,
    filterBluetooth, filterOffice, filterGarantia, filterUnidadOptica,
    filterCamara, filterTactil, filterDisplay, filterPanel, filterResolution,
    filterOs, page, limit
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Reset dynamic spec filters when category changes ────────────────────
  const handleCategoryChange = (catId) => {
    setSelectedCategory(catId);
    setPage(1);
    handleResetFilters();
  };

  const handleProviderChange = (provId) => {
    setSelectedProveedor(provId);
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilterCpu('Todos');
    setFilterCpuGen('Todos');
    setFilterRam('Todos');
    setFilterRamTech('Todos');
    setFilterStorage('Todos');
    setFilterDiscoTipo('Todos');
    setFilterVga('Todos');
    setFilterHdmi('Todos');
    setFilterWifi('Todos');
    setFilterLan('Todos');
    setFilterBluetooth('Todos');
    setFilterOffice('Todos');
    setFilterGarantia('Todos');
    setFilterUnidadOptica('Todos');
    setFilterCamara('Todos');
    setFilterTactil('Todos');
    setFilterDisplay('Todos');
    setFilterPanel('Todos');
    setFilterResolution('Todos');
    setFilterOs('Todos');
    setFilterMarca('Todos');
    setSearch('');
    setSoloConStock(false);
    setPage(1);
  };

  // ── Active Category Configuration ───────────────────────────────────────
  const activeCategoryConfig = useMemo(() => {
    return CATEGORIAS_CONFIG.find(c => c.id === selectedCategory) || CATEGORIAS_CONFIG[0];
  }, [selectedCategory]);

  const catType = activeCategoryConfig.type || 'all';
  const showCpuRamStorage = catType === 'laptop' || catType === 'desktop' || catType === 'aio' || catType === 'all';
  const showDisplay = catType === 'laptop' || catType === 'aio' || catType === 'monitor' || catType === 'display' || catType === 'tablet' || catType === 'all';
  const showPanelResolution = catType === 'monitor' || catType === 'display' || catType === 'all';
  const showOs = catType === 'laptop' || catType === 'desktop' || catType === 'aio' || catType === 'all';
  const showPorts = catType === 'desktop' || catType === 'laptop' || catType === 'aio' || catType === 'monitor' || catType === 'all';
  const showPeripherals = catType === 'desktop' || catType === 'aio' || catType === 'laptop' || catType === 'all';

  // Compute display options depending on category
  const activeDisplayOptions = useMemo(() => {
    if (catType === 'laptop') return LAPTOP_DISPLAY_OPTIONS;
    if (catType === 'tablet') return TABLET_DISPLAY_OPTIONS;
    if (catType === 'monitor' || catType === 'display' || catType === 'aio') return MONITOR_DISPLAY_OPTIONS;
    return ['Todos', ...LAPTOP_DISPLAY_OPTIONS.slice(1), ...MONITOR_DISPLAY_OPTIONS.slice(1)];
  }, [catType]);

  const hasActiveFilters = (
    filterCpu !== 'Todos' || filterCpuGen !== 'Todos' || filterRam !== 'Todos' || filterRamTech !== 'Todos' ||
    filterStorage !== 'Todos' || filterDiscoTipo !== 'Todos' || filterVga !== 'Todos' || filterHdmi !== 'Todos' ||
    filterWifi !== 'Todos' || filterLan !== 'Todos' || filterBluetooth !== 'Todos' || filterOffice !== 'Todos' ||
    filterGarantia !== 'Todos' || filterUnidadOptica !== 'Todos' || filterCamara !== 'Todos' || filterTactil !== 'Todos' ||
    filterDisplay !== 'Todos' || filterPanel !== 'Todos' || filterResolution !== 'Todos' ||
    filterOs !== 'Todos' || filterMarca !== 'Todos' || search.trim() !== '' || soloConStock
  );

  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  const copyPartNumber = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPart(text);
    setTimeout(() => setCopiedPart(null), 2000);
  };

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', paddingBottom: 40 }}>
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.45rem', fontWeight: 800, margin: 0 }}>
            <Layers size={26} style={{ color: 'var(--c-brand)' }} />
            Filtro por Piezas y Especificaciones Técnicas
          </h1>
          <p style={{ color: 'var(--c-text-secondary)', fontSize: 13, marginTop: 4, margin: '4px 0 0 0' }}>
            Explora el catálogo completo filtrando directamente sobre toda la base de datos por proveedor, categoría y componentes (CPU, Generación, RAM, Disco, Puertos VGA/HDMI, Wi-Fi, Office, Garantía).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Region Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--c-surface)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
            <Clock size={14} style={{ color: 'var(--c-text-tertiary)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)' }}>Plazos en:</span>
            <select
              value={selectedRegion}
              onChange={(e) => { setSelectedRegion(e.target.value); setPage(1); }}
              style={{ background: 'transparent', border: 'none', fontSize: 12, fontWeight: 700, color: 'var(--c-brand)', cursor: 'pointer', outline: 'none' }}
            >
              {REGIONES_PERU.map(reg => <option key={reg} value={reg}>{reg}</option>)}
            </select>
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: 'flex', background: 'var(--c-surface)', padding: 3, borderRadius: 8, border: '1px solid var(--c-border)' }}>
            <button
              className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : ''}`}
              onClick={() => setViewMode('grid')}
              style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6 }}
              title="Vista Cuadrícula / Tarjetas"
            >
              <LayoutGrid size={14} />
              Tarjetas
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : ''}`}
              onClick={() => setViewMode('table')}
              style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6 }}
              title="Vista Hoja de Datos / Tabla"
            >
              <List size={14} />
              Tabla
            </button>
          </div>

          <button
            className="btn btn-sm"
            onClick={fetchData}
            disabled={loading}
            style={{ padding: '7px 12px', borderRadius: 8 }}
            title="Recargar datos"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── 1. Provider Tabs (Cada Proveedor su propio apartado) ─────────── */}
      <div className="card fade-up" style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <Building2 size={14} style={{ color: 'var(--c-brand)' }} />
          <span>Proveedor Seleccionado:</span>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          <button
            onClick={() => handleProviderChange('all')}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: selectedProveedor === 'all' ? '2px solid var(--c-brand)' : '1px solid var(--c-border)',
              background: selectedProveedor === 'all' ? 'rgba(37,99,235,0.08)' : '#fff',
              color: selectedProveedor === 'all' ? 'var(--c-brand)' : 'var(--c-text-primary)',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: selectedProveedor === 'all' ? '0 2px 6px rgba(37,99,235,0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Building2 size={14} style={{ color: selectedProveedor === 'all' ? 'var(--c-brand)' : 'var(--c-text-tertiary)' }} />
            <span>Todos los Proveedores (Consolidado)</span>
            <span style={{ background: selectedProveedor === 'all' ? 'var(--c-brand)' : '#f1f5f9', color: selectedProveedor === 'all' ? '#fff' : '#475569', padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
              {categoriesCount.total ? categoriesCount.total.toLocaleString('es-PE') : '59k+'}
            </span>
          </button>

          <button
            onClick={() => handleProviderChange('thekingcomputer')}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: selectedProveedor === 'thekingcomputer' ? '2px solid #1e293b' : '1px solid var(--c-border)',
              background: selectedProveedor === 'thekingcomputer' ? 'rgba(30,41,59,0.08)' : '#fff',
              color: selectedProveedor === 'thekingcomputer' ? '#1e293b' : 'var(--c-text-primary)',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: selectedProveedor === 'thekingcomputer' ? '0 2px 6px rgba(30,41,59,0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span>👑</span>
            <span>THE KING COMPUTER E.I.R.L.</span>
            <span style={{ background: selectedProveedor === 'thekingcomputer' ? '#1e293b' : '#f1f5f9', color: selectedProveedor === 'thekingcomputer' ? '#fff' : '#475569', padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
              {selectedProveedor === 'thekingcomputer' && categoriesCount.total ? categoriesCount.total.toLocaleString('es-PE') : '30k+'}
            </span>
          </button>

          <button
            onClick={() => handleProviderChange('jorge_rojas')}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: selectedProveedor === 'jorge_rojas' ? '2px solid #0f766e' : '1px solid var(--c-border)',
              background: selectedProveedor === 'jorge_rojas' ? 'rgba(15,118,110,0.08)' : '#fff',
              color: selectedProveedor === 'jorge_rojas' ? '#0f766e' : 'var(--c-text-primary)',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: selectedProveedor === 'jorge_rojas' ? '0 2px 6px rgba(15,118,110,0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Building2 size={14} style={{ color: selectedProveedor === 'jorge_rojas' ? '#0f766e' : 'var(--c-text-tertiary)' }} />
            <span>DISTRIBUIDORA JORGE ROJAS S.A.C.</span>
            <span style={{ background: selectedProveedor === 'jorge_rojas' ? '#0f766e' : '#f1f5f9', color: selectedProveedor === 'jorge_rojas' ? '#fff' : '#475569', padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
              {selectedProveedor === 'jorge_rojas' && categoriesCount.total ? categoriesCount.total.toLocaleString('es-PE') : '28k+'}
            </span>
          </button>
        </div>
      </div>

      {/* ── 2. Official Categories Pills (Cada Categoría con su filtro) ───── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
          {CATEGORIAS_CONFIG.map(cat => {
            const isSelected = selectedCategory === cat.id;
            const count = cat.id === 'all' ? categoriesCount.total : categoriesCount[cat.id];

            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                style={{
                  padding: '6px 12px',
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
                <span>{cat.label}</span>
                {count != null && (
                  <span style={{
                    background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)',
                    color: isSelected ? '#fff' : 'var(--c-text-primary)',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 700
                  }}>
                    {Number(count).toLocaleString('es-PE')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. Dynamic Technical Spec Filter Matrix (Conectado a toda la BD) ─ */}
      <div className="card fade-up" style={{ padding: '14px 18px', marginBottom: 16, border: '1px solid var(--c-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SlidersHorizontal size={16} style={{ color: 'var(--c-brand)' }} />
            Filtros Técnicos para {activeCategoryConfig.label} (Filtra toda la base de datos)
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowMoreFilters(v => !v)}
              className="btn btn-sm"
              style={{ fontSize: 11, padding: '4px 10px' }}
            >
              {showMoreFilters ? 'Ocultar Puertos y Extras' : 'Mostrar Puertos y Extras (VGA, HDMI, Office...)'}
            </button>
            {hasActiveFilters && (
              <button onClick={handleResetFilters} className="btn btn-sm" style={{ fontSize: 11, color: 'var(--c-danger)', borderColor: 'rgba(239,68,68,0.2)' }}>
                <X size={12} /> Limpiar Filtros
              </button>
            )}
          </div>
        </div>

        {/* ── SECCIÓN 1: COMPONENTES PRINCIPALES (CPU, Gen, RAM, Disco) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: showMoreFilters ? 14 : 0 }}>
          {/* Marca */}
          <div>
            <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
              Marca
            </label>
            <select
              className="form-select"
              style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
              value={filterMarca}
              onChange={(e) => { setFilterMarca(e.target.value); setPage(1); }}
            >
              {availableMarcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* CPU Familia */}
          {showCpuRamStorage && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Cpu size={12} style={{ color: 'var(--c-brand)' }} />
                Procesador (Familia)
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterCpu}
                onChange={(e) => { setFilterCpu(e.target.value); setPage(1); }}
              >
                {CPU_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* CPU Generación / Modelo */}
          {showCpuRamStorage && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Cpu size={12} style={{ color: '#0284c7' }} />
                CPU Generación
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterCpuGen}
                onChange={(e) => { setFilterCpuGen(e.target.value); setPage(1); }}
              >
                {CPU_GEN_OPTIONS.map(cg => <option key={cg} value={cg}>{cg}</option>)}
              </select>
            </div>
          )}

          {/* Memoria RAM Capacidad */}
          {showCpuRamStorage && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Layers size={12} style={{ color: 'var(--c-success)' }} />
                Memoria RAM
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterRam}
                onChange={(e) => { setFilterRam(e.target.value); setPage(1); }}
              >
                {RAM_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {/* Memoria RAM Tecnología */}
          {showCpuRamStorage && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Layers size={12} style={{ color: '#059669' }} />
                Tecnología RAM
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterRamTech}
                onChange={(e) => { setFilterRamTech(e.target.value); setPage(1); }}
              >
                {RAM_TECH_OPTIONS.map(rt => <option key={rt} value={rt}>{rt}</option>)}
              </select>
            </div>
          )}

          {/* Disco Capacidad */}
          {(showCpuRamStorage || catType === 'storage') && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <HardDrive size={12} style={{ color: 'var(--c-warning)' }} />
                Almacenamiento
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterStorage}
                onChange={(e) => { setFilterStorage(e.target.value); setPage(1); }}
              >
                {STORAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Tipo de Disco / Tecnología */}
          {(showCpuRamStorage || catType === 'storage') && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <HardDrive size={12} style={{ color: '#d97706' }} />
                Tipo de Disco
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterDiscoTipo}
                onChange={(e) => { setFilterDiscoTipo(e.target.value); setPage(1); }}
              >
                {DISCO_TIPO_OPTIONS.map(dt => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 2: PUERTOS Y CONECTIVIDAD (VGA, HDMI, LAN, Wi-Fi...) ─ */}
        {showMoreFilters && showPorts && (
          <div style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-brand)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <Cable size={13} />
              <span>Puertos de Video y Conectividad:</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {/* VGA */}
              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                  Puerto VGA
                </label>
                <select
                  className="form-select"
                  style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                  value={filterVga}
                  onChange={(e) => { setFilterVga(e.target.value); setPage(1); }}
                >
                  {VGA_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              {/* HDMI */}
              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                  Puerto HDMI
                </label>
                <select
                  className="form-select"
                  style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                  value={filterHdmi}
                  onChange={(e) => { setFilterHdmi(e.target.value); setPage(1); }}
                >
                  {HDMI_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              {/* Wi-Fi / WLAN */}
              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Wifi size={12} style={{ color: '#0284c7' }} />
                  Wi-Fi / WLAN
                </label>
                <select
                  className="form-select"
                  style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                  value={filterWifi}
                  onChange={(e) => { setFilterWifi(e.target.value); setPage(1); }}
                >
                  {WIFI_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>

              {/* Puerto LAN (RJ45) */}
              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                  Puerto LAN (Red)
                </label>
                <select
                  className="form-select"
                  style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                  value={filterLan}
                  onChange={(e) => { setFilterLan(e.target.value); setPage(1); }}
                >
                  {LAN_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* Bluetooth */}
              <div>
                <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                  Bluetooth
                </label>
                <select
                  className="form-select"
                  style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                  value={filterBluetooth}
                  onChange={(e) => { setFilterBluetooth(e.target.value); setPage(1); }}
                >
                  <option value="Todos">Todos</option>
                  <option value="si">Con Bluetooth (SI)</option>
                  <option value="no">Sin Bluetooth (NO)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ── SECCIÓN 3: PANTALLA, SISTEMA OPERATIVO, OFFICE Y GARANTÍA ──── */}
        {showMoreFilters && (
          <div style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-brand)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <Briefcase size={13} />
              <span>Pantalla, Software y Garantía Oficial:</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {/* Pantalla Pulgadas */}
              {showDisplay && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Monitor size={12} style={{ color: '#7c3aed' }} />
                    Pantalla (Pulgadas)
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filterDisplay}
                    onChange={(e) => { setFilterDisplay(e.target.value); setPage(1); }}
                  >
                    {activeDisplayOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {/* Panel (Monitores) */}
              {showPanelResolution && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                    Tipo de Panel
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filterPanel}
                    onChange={(e) => { setFilterPanel(e.target.value); setPage(1); }}
                  >
                    {PANEL_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}

              {/* Resolución */}
              {showPanelResolution && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                    Resolución
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filterResolution}
                    onChange={(e) => { setFilterResolution(e.target.value); setPage(1); }}
                  >
                    {RESOLUTION_OPTIONS.map(res => <option key={res} value={res}>{res}</option>)}
                  </select>
                </div>
              )}

              {/* Sistema Operativo */}
              {showOs && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                    Sistema Operativo
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filterOs}
                    onChange={(e) => { setFilterOs(e.target.value); setPage(1); }}
                  >
                    {OS_OPTIONS.map(os => <option key={os} value={os}>{os}</option>)}
                  </select>
                </div>
              )}

              {/* Office Suite */}
              {showPeripherals && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Briefcase size={12} style={{ color: '#ea580c' }} />
                    Suite Ofimática
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filterOffice}
                    onChange={(e) => { setFilterOffice(e.target.value); setPage(1); }}
                  >
                    {OFFICE_OPTIONS.map(off => <option key={off} value={off}>{off}</option>)}
                  </select>
                </div>
              )}

              {/* Garantía */}
              {showPeripherals && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Shield size={12} style={{ color: '#16a34a' }} />
                    Garantía Fabricante
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filterGarantia}
                    onChange={(e) => { setFilterGarantia(e.target.value); setPage(1); }}
                  >
                    {GARANTIA_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              )}

              {/* Unidad Óptica DVD (PCs de escritorio) */}
              {catType === 'desktop' && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Disc size={12} style={{ color: '#475569' }} />
                    Unidad Óptica (DVD)
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filterUnidadOptica}
                    onChange={(e) => { setFilterUnidadOptica(e.target.value); setPage(1); }}
                  >
                    {UNIDAD_OPTICA_OPTIONS.map(uo => <option key={uo} value={uo}>{uo}</option>)}
                  </select>
                </div>
              )}

              {/* Cámara Web (Laptops y AIO) */}
              {(catType === 'laptop' || catType === 'aio') && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Camera size={12} style={{ color: '#0284c7' }} />
                    Cámara Web
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filterCamara}
                    onChange={(e) => { setFilterCamara(e.target.value); setPage(1); }}
                  >
                    {CAMARA_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {/* Pantalla Táctil */}
              {(catType === 'laptop' || catType === 'display' || catType === 'tablet') && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                    Pantalla Táctil
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filterTactil}
                    onChange={(e) => { setFilterTactil(e.target.value); setPage(1); }}
                  >
                    {TACTIL_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Toolbar: Search, Stock & Total Count ───────────────────────── */}
      <div className="toolbar" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="toolbar-search" style={{ flex: 1, minWidth: 260, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--c-text-tertiary)' }} />
          <input
            className="form-input"
            style={{ width: '100%', paddingLeft: 36 }}
            placeholder="Buscar por Nro. de Parte, modelo, serie o palabras clave..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer',
          padding: '7px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--c-border)',
          background: soloConStock ? 'rgba(34,197,94,0.08)' : 'var(--c-surface)',
          transition: 'background 0.15s', userSelect: 'none'
        }}>
          <input
            type="checkbox"
            checked={soloConStock}
            onChange={(e) => { setSoloConStock(e.target.checked); setPage(1); }}
            style={{ accentColor: 'var(--c-success)', width: 15, height: 15 }}
          />
          <span style={{ color: soloConStock ? 'var(--c-success)' : 'var(--c-text-secondary)', fontWeight: soloConStock ? 600 : 400 }}>
            Solo con stock disponible
          </span>
        </label>

        <span style={{ fontSize: 12, color: 'var(--c-text-secondary)', background: 'var(--c-surface)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
          Coincidencias en BD: <strong>{totalItems.toLocaleString('es-PE')}</strong> fichas
        </span>

        {/* Limit Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-text-secondary)' }}>
          <span>Por pág:</span>
          <select
            className="form-select"
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            style={{ padding: '4px 8px', fontSize: 12 }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* ── Error Banner if any ─────────────────────────────────────────── */}
      {errorMsg && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#b91c1c', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={18} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{errorMsg}</span>
          <button onClick={fetchData} className="btn btn-sm" style={{ marginLeft: 'auto', background: '#fff' }}>Reintentar</button>
        </div>
      )}

      {/* ── 5. Results Grid or Table ─────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card" style={{ padding: 20, height: 260 }}>
              <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 40, width: '100%', marginBottom: 14 }} />
              <div className="skeleton" style={{ height: 24, width: '80%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 36, width: '100%', marginTop: 'auto' }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-tertiary)' }}>
          <AlertCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>No se encontraron fichas</h3>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            Ningún producto coincide con los filtros aplicados en {activeCategoryConfig.label}.
          </p>
          {hasActiveFilters && (
            <button onClick={handleResetFilters} className="btn btn-primary" style={{ marginTop: 16 }}>
              Restablecer Filtros
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid View ───────────────────────────────────────────────────── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {items.map((item, idx) => {
            const nroParte = item.nro_parte || 'S/N';
            const desc = item.descripcion || item.descripcion_producto || 'Sin descripción';
            const pdfUrl = item.pdf_url;
            const ofertas = Array.isArray(item.ofertas) ? item.ofertas : [];
            const isCopied = copiedPart === nroParte;
            const sp = item.specs || {};

            return (
              <div
                key={item.id || idx}
                className="card fade-up"
                style={{
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: '1px solid var(--c-border)',
                  background: 'var(--c-surface)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
              >
                <div>
                  {/* Top Bar: Part Number & Brand & Category Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--c-brand)', fontSize: 13 }}>
                        {nroParte}
                      </span>
                      <button
                        onClick={() => copyPartNumber(nroParte)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: isCopied ? 'var(--c-success)' : 'var(--c-text-tertiary)', padding: 2 }}
                        title="Copiar Nro de Parte"
                      >
                        {isCopied ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <span className="badge badge-info" style={{ fontSize: 10 }}>{item.marca || 'GENÉRICO'}</span>
                      <span className="badge" style={{ fontSize: 10, background: '#f1f5f9', color: '#475569' }}>
                        {item.categoria || item.catalogo || sp.formFactor}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--c-text-secondary)',
                      marginBottom: 10,
                      lineHeight: 1.45,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      height: 35
                    }}
                    title={desc}
                  >
                    {desc}
                  </div>

                  {/* Main Specification Chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {sp.cpu && sp.cpu !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(37,99,235,0.08)', color: 'var(--c-brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Cpu size={12} /> {sp.cpuFull || sp.cpu} {sp.cpuGen ? `(${sp.cpuGen})` : ''}
                      </span>
                    )}
                    {sp.ram && sp.ram !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(5,150,105,0.08)', color: 'var(--c-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Layers size={12} /> {sp.ram} {sp.ramTech ? `(${sp.ramTech})` : ''}
                      </span>
                    )}
                    {sp.storage && sp.storage !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(217,119,6,0.08)', color: 'var(--c-warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <HardDrive size={12} /> {sp.storage} {sp.discoTipo && !sp.storage.includes(sp.discoTipo) ? `• ${sp.discoTipo}` : ''}
                      </span>
                    )}
                    {sp.display && sp.display !== 'S/D' && sp.display !== 'Sin pantalla' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(124,58,237,0.08)', color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Monitor size={12} /> {sp.display} {sp.resolution ? `(${sp.resolution.split(' ')[0]})` : ''}
                      </span>
                    )}
                    {sp.panel && sp.panel !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155', fontWeight: 600 }}>
                        Panel {sp.panel}
                      </span>
                    )}
                    {sp.os && sp.os !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>
                        {sp.os}
                      </span>
                    )}
                  </div>

                  {/* Ports & Features Badges (VGA, HDMI, LAN, Wi-Fi, Office, Garantía) */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                    {sp.vga && (
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                        background: sp.vga === 'SI' ? 'rgba(34,197,94,0.1)' : '#f8fafc',
                        color: sp.vga === 'SI' ? '#166534' : '#94a3b8',
                        border: sp.vga === 'SI' ? '1px solid rgba(34,197,94,0.3)' : '1px solid #e2e8f0'
                      }}>
                        VGA: {sp.vga}
                      </span>
                    )}
                    {sp.hdmi && (
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                        background: sp.hdmi === 'SI' ? 'rgba(37,99,235,0.1)' : '#f8fafc',
                        color: sp.hdmi === 'SI' ? '#1e40af' : '#94a3b8',
                        border: sp.hdmi === 'SI' ? '1px solid rgba(37,99,235,0.3)' : '1px solid #e2e8f0'
                      }}>
                        HDMI: {sp.hdmi}
                      </span>
                    )}
                    {sp.wifi && (
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                        background: sp.wifi === 'SI' ? '#eff6ff' : '#f8fafc',
                        color: sp.wifi === 'SI' ? '#0284c7' : '#94a3b8',
                        border: '1px solid #e2e8f0'
                      }}>
                        Wi-Fi: {sp.wifi}
                      </span>
                    )}
                    {sp.lan && (
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                        background: sp.lan === 'SI' ? '#f0fdf4' : '#f8fafc',
                        color: sp.lan === 'SI' ? '#15803d' : '#94a3b8',
                        border: '1px solid #e2e8f0'
                      }}>
                        LAN: {sp.lan}
                      </span>
                    )}
                    {sp.office && sp.office !== 'Sin Office' && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                        💼 {sp.office}
                      </span>
                    )}
                    {sp.garantia && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                        🛡️ {sp.garantia}
                      </span>
                    )}
                    {sp.unidadOptica && sp.unidadOptica === 'SI' && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, background: '#f1f5f9', color: '#334155' }}>
                        💿 Lector DVD
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Section: Provider Offers & Price */}
                <div style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 12, marginTop: 'auto' }}>
                  {/* Consolidated mode: multiple provider comparison */}
                  {selectedProveedor === 'all' && ofertas.length > 0 ? (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginBottom: 6, fontWeight: 600 }}>
                        Ofertas disponibles ({ofertas.length}):
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {ofertas.map((of, ofIdx) => {
                          const isKing = of.nombre_proveedor?.toUpperCase().includes('KING');
                          const plazo = of.plazo_entrega_dias || 90;
                          return (
                            <div
                              key={ofIdx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: 11,
                                padding: '4px 8px',
                                borderRadius: 6,
                                background: isKing ? 'rgba(30,41,59,0.04)' : 'rgba(15,118,110,0.04)',
                                border: '1px solid var(--c-border-light)'
                              }}
                            >
                              <span style={{ fontWeight: 600, color: isKing ? '#1e293b' : '#0f766e', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {isKing ? '👑 THE KING' : '🏢 JORGE ROJAS'}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'var(--c-text-tertiary)', fontSize: 10 }}>{plazo}d</span>
                                <strong style={{ color: 'var(--c-text)', fontSize: 12 }}>S/ {fmt(of.precio_ofertado)}</strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Single Provider Mode */
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', display: 'block' }}>
                          {item.nombre_proveedor || item.proveedor || 'Proveedor'}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: (item.existencia_stock > 0) ? 'var(--c-success)' : 'var(--c-text-tertiary)', fontWeight: 600 }}>
                            Stock: {item.existencia_stock ?? 0}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--c-text-tertiary)' }}>•</span>
                          <span style={{ fontSize: 11, color: 'var(--c-text-secondary)' }}>
                            Plazo: {item.plazo_entrega_dias ?? 90} días
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', display: 'block' }}>Precio Ofertado</span>
                        <strong style={{ fontSize: 15, color: 'var(--c-text)', fontWeight: 800 }}>
                          S/ {fmt(item.min_precio || item.precio_ofertado)}
                        </strong>
                        {item.orden_min ? (
                          <div style={{ marginTop: 2 }}>
                            <span
                              onClick={() => navigate(`/orders?search=${item.orden_min}`)}
                              title={`Ver orden: ${item.orden_min}`}
                              style={{
                                cursor: 'pointer',
                                color: 'var(--c-brand)',
                                textDecoration: 'underline',
                                fontSize: 10,
                                fontFamily: 'monospace',
                                display: 'block'
                              }}
                            >
                              {item.orden_min}
                            </span>
                            {(() => {
                              const mes = formatMesOrden(item.fecha_orden_min, item.orden_min);
                              const badge = getAntiguedadBadge(item.fecha_orden_min, item.orden_min);
                              if (!mes) return null;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 1 }}>
                                  <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)' }}>📅 {mes}</span>
                                  {badge && (
                                    <span style={{
                                      fontSize: 9,
                                      fontWeight: 600,
                                      padding: '1px 4px',
                                      borderRadius: 4,
                                      color: badge.color,
                                      background: badge.bg
                                    }}>
                                      {badge.text}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          item.fecha_extraccion && (
                            <div style={{ fontSize: 9, color: 'var(--c-text-tertiary)', marginTop: 2 }}>
                              📅 Catálogo {formatMesOrden(item.fecha_extraccion)} (Vigente)
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 }}>
                    {selectedProveedor === 'all' && (
                      <div>
                        <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', display: 'block' }}>Mejor Precio</span>
                        <strong style={{ fontSize: 15, color: 'var(--c-text)', fontWeight: 800 }}>
                          S/ {fmt(item.min_precio)}
                        </strong>
                        {item.orden_min ? (
                          <div style={{ marginTop: 2 }}>
                            <span
                              onClick={() => navigate(`/orders?search=${item.orden_min}`)}
                              title={`Ver orden: ${item.orden_min}`}
                              style={{
                                cursor: 'pointer',
                                color: 'var(--c-brand)',
                                textDecoration: 'underline',
                                fontSize: 10,
                                fontFamily: 'monospace',
                                display: 'block'
                              }}
                            >
                              {item.orden_min}
                            </span>
                            {(() => {
                              const mes = formatMesOrden(item.fecha_orden_min, item.orden_min);
                              const badge = getAntiguedadBadge(item.fecha_orden_min, item.orden_min);
                              if (!mes) return null;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                                  <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)' }}>📅 {mes}</span>
                                  {badge && (
                                    <span style={{
                                      fontSize: 9,
                                      fontWeight: 600,
                                      padding: '1px 4px',
                                      borderRadius: 4,
                                      color: badge.color,
                                      background: badge.bg
                                    }}>
                                      {badge.text}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          item.fecha_extraccion && (
                            <div style={{ fontSize: 9, color: 'var(--c-text-tertiary)', marginTop: 2 }}>
                              📅 Catálogo {formatMesOrden(item.fecha_extraccion)} (Vigente)
                            </div>
                          )
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                      {pdfUrl && pdfUrl !== '#' && (
                        <a
                          href={pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          style={{
                            fontSize: 11,
                            padding: '4px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background: 'rgba(37,99,235,0.08)',
                            color: 'var(--c-brand)',
                            borderColor: 'rgba(37,99,235,0.25)',
                            fontWeight: 600
                          }}
                          title="Abrir Ficha Técnica Oficial PDF"
                        >
                          <FileText size={13} />
                          Ficha PDF
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Table View ──────────────────────────────────────────────────── */
        <div className="card fade-up" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>N° Parte</th>
                  <th>Marca</th>
                  <th>Categoría</th>
                  {showCpuRamStorage && <th>CPU / Gen</th>}
                  {showCpuRamStorage && <th>RAM / Tipo</th>}
                  {(showCpuRamStorage || catType === 'storage') && <th>Disco / Tipo</th>}
                  {showPorts && <th>VGA</th>}
                  {showPorts && <th>HDMI</th>}
                  {showPorts && <th>Wi-Fi</th>}
                  {showDisplay && <th>Pantalla</th>}
                  {showPeripherals && <th>Office</th>}
                  {showOs && <th>SO</th>}
                  <th>Proveedor(es)</th>
                  <th style={{ textAlign: 'right' }}>Precio Min. (S/)</th>
                  <th style={{ textAlign: 'center' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const nroParte = item.nro_parte || 'S/N';
                  const pdfUrl = item.pdf_url;
                  const ofertas = Array.isArray(item.ofertas) ? item.ofertas : [];
                  const sp = item.specs || {};

                  return (
                    <tr key={item.id || idx}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--c-brand)', whiteSpace: 'nowrap' }}>
                        {nroParte}
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{item.marca || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--c-text-secondary)' }}>{item.categoria || item.catalogo || sp.formFactor}</td>
                      {showCpuRamStorage && (
                        <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-brand)' }}>
                          {sp.cpuFull || sp.cpu || '—'}
                          {sp.cpuGen && <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>{sp.cpuGen}</span>}
                        </td>
                      )}
                      {showCpuRamStorage && (
                        <td style={{ fontSize: 11 }}>
                          {sp.ram || '—'}
                          {sp.ramTech && <span style={{ fontSize: 10, color: '#059669', display: 'block', fontWeight: 600 }}>{sp.ramTech}</span>}
                        </td>
                      )}
                      {(showCpuRamStorage || catType === 'storage') && (
                        <td style={{ fontSize: 11 }}>
                          {sp.storage || '—'}
                          {sp.discoTipo && <span style={{ fontSize: 10, color: '#d97706', display: 'block' }}>{sp.discoTipo}</span>}
                        </td>
                      )}
                      {showPorts && (
                        <td style={{ fontSize: 11, fontWeight: 700, color: sp.vga === 'SI' ? '#166534' : '#94a3b8' }}>
                          {sp.vga || '—'}
                        </td>
                      )}
                      {showPorts && (
                        <td style={{ fontSize: 11, fontWeight: 700, color: sp.hdmi === 'SI' ? '#1e40af' : '#94a3b8' }}>
                          {sp.hdmi || '—'}
                        </td>
                      )}
                      {showPorts && (
                        <td style={{ fontSize: 11, color: sp.wifi === 'SI' ? '#0284c7' : '#94a3b8' }}>
                          {sp.wifi || '—'}
                        </td>
                      )}
                      {showDisplay && <td style={{ fontSize: 11 }}>{sp.display || '—'}</td>}
                      {showPeripherals && <td style={{ fontSize: 10, color: sp.office && sp.office !== 'Sin Office' ? '#c2410c' : '#94a3b8' }}>{sp.office || '—'}</td>}
                      {showOs && <td style={{ fontSize: 11, color: 'var(--c-text-tertiary)' }}>{sp.os || '—'}</td>}
                      <td style={{ fontSize: 11 }}>
                        {ofertas.length > 1 ? (
                          <span className="badge badge-info" style={{ fontSize: 10 }}>{ofertas.length} Proveedores</span>
                        ) : (
                          item.nombre_proveedor || item.proveedor || (ofertas[0]?.nombre_proveedor) || '—'
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top', minWidth: 140 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--c-text)' }}>
                          S/ {fmt(item.min_precio || item.precio_ofertado)}
                        </div>
                        {item.orden_min ? (
                          <div style={{ marginTop: 3 }}>
                            <a
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/orders?search=${encodeURIComponent(item.orden_min)}`);
                              }}
                              title={`Ver orden de compra: ${item.orden_min}`}
                              style={{
                                cursor: 'pointer',
                                color: 'var(--c-brand)',
                                textDecoration: 'underline',
                                fontSize: 11,
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                display: 'inline-block'
                              }}
                            >
                              {item.orden_min}
                            </a>
                            {(() => {
                              const mes = formatMesOrden(item.fecha_orden_min, item.orden_min);
                              const badge = getAntiguedadBadge(item.fecha_orden_min, item.orden_min);
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
                                  {mes && (
                                    <span
                                      style={{ fontSize: 10, color: 'var(--c-text-tertiary)', fontWeight: 600 }}
                                      title={item.fecha_orden_min ? `Fecha extraída: ${item.fecha_orden_min}` : undefined}
                                    >
                                      📅 {mes}
                                    </span>
                                  )}
                                  {badge && (
                                    <span style={{
                                      fontSize: 9,
                                      fontWeight: 600,
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      color: badge.color,
                                      background: badge.bg
                                    }}>
                                      {badge.text}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          item.fecha_extraccion ? (
                            <div style={{ fontSize: 10, color: 'var(--c-text-tertiary)', marginTop: 3 }}>
                              📅 {formatMesOrden(item.fecha_extraccion) || 'Catálogo'} (Vigente)
                            </div>
                          ) : null
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {pdfUrl && pdfUrl !== '#' ? (
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm"
                            style={{ padding: '3px 8px', fontSize: 11 }}
                            title="Descargar / Ver PDF"
                          >
                            <ExternalLink size={12} />
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 6. Pagination Controls ───────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--c-text-secondary)' }}>
            Mostrando <strong>{((page - 1) * limit) + 1}</strong> – <strong>{Math.min(page * limit, totalItems).toLocaleString('es-PE')}</strong> de <strong>{totalItems.toLocaleString('es-PE')}</strong> fichas en la base de datos
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn btn-sm"
              onClick={() => setPage(1)}
              disabled={page === 1 || loading}
              title="Primera página"
              style={{ padding: '6px 10px' }}
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              title="Página anterior"
              style={{ padding: '6px 10px' }}
            >
              <ChevronLeft size={14} />
            </button>

            <span style={{ fontSize: 13, fontWeight: 600, padding: '0 10px', color: 'var(--c-text-primary)' }}>
              Página {page} de {totalPages.toLocaleString('es-PE')}
            </span>

            <button
              className="btn btn-sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              title="Página siguiente"
              style={{ padding: '6px 10px' }}
            >
              <ChevronRight size={14} />
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages || loading}
              title="Última página"
              style={{ padding: '6px 10px' }}
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiltroPiezas;
