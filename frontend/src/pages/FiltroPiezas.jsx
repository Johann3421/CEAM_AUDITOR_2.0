import React, { useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cpu, HardDrive, Monitor, Layers, Search, Filter,
  ExternalLink, Building2, LayoutGrid, List, Sparkles, X, RefreshCw,
  SlidersHorizontal, Laptop, Printer, Smartphone, Clock,
  FileText, Check, Copy, AlertCircle, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Tv, MonitorCheck, Wifi, Shield,
  Briefcase, Disc, Camera, Touchpad, Cable, ArrowUp, ArrowDown, ChevronsUpDown, Tag, Package
} from 'lucide-react';
import { proveedoresApi } from '../services/api';
import { parseProductSpecs } from '../utils/specsParser';
import HeaderFilter from '../components/HeaderFilter';

const REGIONES_PERU = [
  'LIMA', 'CALLAO', 'AREQUIPA', 'CUSCO', 'LA LIBERTAD', 'PIURA', 'LAMBAYEQUE',
  'ANCASH', 'JUNIN', 'ICA', 'LORETO', 'SAN MARTIN', 'CAJAMARCA', 'HUANUCO',
  'AYACUCHO', 'PUNO', 'TACNA', 'UCAYALI', 'PASCO', 'TUMBES', 'MOQUEGUA',
  'AMAZONAS', 'APURIMAC', 'HUANCAVELICA', 'MADRE DE DIOS'
];

const formatMesOrden = (fechaStr, ordenStr) => {
  if (fechaStr) {
    try {
      const s = String(fechaStr);
      const d = new Date(s.includes('T') ? s : `${s}T12:00:00`);
      if (!isNaN(d.getTime())) {
        const mes = d.toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
        return mes.charAt(0).toUpperCase() + mes.slice(1);
      }
    } catch (_) {}
  }
  if (ordenStr) {
    try {
      const yMatch = String(ordenStr).match(/202[0-9]/);
      if (yMatch) return `Año ${yMatch[0]}`;
    } catch (_) {}
  }
  return null;
};

const getAntiguedadBadge = (fechaStr, ordenStr) => {
  let dateObj = null;
  if (fechaStr) {
    try {
      const s = String(fechaStr);
      const d = new Date(s.includes('T') ? s : `${s}T12:00:00`);
      if (!isNaN(d.getTime())) dateObj = d;
    } catch (_) {}
  } else if (ordenStr) {
    try {
      const y = String(ordenStr).match(/202[0-9]/);
      if (y) dateObj = new Date(`${y[0]}-06-01`);
    } catch (_) {}
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

// ── Opciones de filtros booleanos (siempre estáticos, no dependen de BD) ───
const BOOL_OPTIONS = { si: 'Con', no: 'Sin' };
const BOOL_FILTER_PAIRS = [
  { key: 'vga',          label: 'Puerto VGA' },
  { key: 'hdmi',         label: 'Puerto HDMI' },
  { key: 'wifi',         label: 'Wi-Fi / WLAN' },
  { key: 'lan',          label: 'Puerto LAN (Red)' },
  { key: 'bluetooth',    label: 'Bluetooth' },
  { key: 'unidad_optica', label: 'Unidad Óptica (DVD)' },
  { key: 'camara',       label: 'Cámara Web' },
  { key: 'tactil',       label: 'Pantalla Táctil' },
];

// Estado inicial de todos los filtros técnicos
const FILTERS_INIT = {
  marca: 'Todos', cpu: 'Todos', cpu_gen: 'Todos',
  ram: 'Todos', ram_tech: 'Todos',
  storage: 'Todos', disco_tipo: 'Todos',
  vga: 'Todos', hdmi: 'Todos', wifi: 'Todos',
  lan: 'Todos', bluetooth: 'Todos',
  office: 'Todos', garantia: 'Todos',
  unidad_optica: 'Todos', camara: 'Todos', tactil: 'Todos',
  display: 'Todos', panel: 'Todos', resolution: 'Todos', os: 'Todos',
};

function filtersReducer(state, action) {
  if (action.type === 'SET') return { ...state, [action.key]: action.value };
  if (action.type === 'RESET') return { ...FILTERS_INIT };
  return state;
}

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
  const [soloConOrden, setSoloConOrden] = useState(false);
  const [sortBy, setSortBy] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Category counts from API
  const [categoriesCount, setCategoriesCount] = useState({});

  // ── Filtros técnicos: un único objeto en vez de 20 estados ───────────────
  const [filters, dispatchFilters] = useReducer(filtersReducer, FILTERS_INIT);
  const setFilter = useCallback((key, value) => dispatchFilters({ type: 'SET', key, value }), []);

  // UI accordion for secondary filters
  const [showMoreFilters, setShowMoreFilters] = useState(true);

  // Opciones de filtro 100% dinámicas desde la BD (sin hardcodeo)
  const [filterOptions, setFilterOptions] = useState({
    marcas: [], cpus: [], cpu_gens: [], rams: [], ram_techs: [],
    storages: [], disco_tipos: [], oss: [], displays: [], panels: [], resolutions: [],
  });
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);

  const [copiedPart, setCopiedPart] = useState(null);

  // ── Carga reactiva de opciones de filtro desde BD al cambiar categoría/proveedor ─
  useEffect(() => {
    let isMounted = true;
    setFilterOptionsLoading(true);
    proveedoresApi.getFilterOptions({
      categoria: selectedCategory !== 'all' ? selectedCategory : undefined,
      proveedor: selectedProveedor !== 'all' ? selectedProveedor : undefined,
    })
      .then(res => {
        if (isMounted && res.data) {
          setFilterOptions(res.data);
        }
      })
      .catch(err => {
        console.warn('Error cargando opciones dinámicas:', err);
      })
      .finally(() => {
        if (isMounted) setFilterOptionsLoading(false);
      });

    return () => { isMounted = false; };
  }, [selectedCategory, selectedProveedor]);

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

  const reqIdRef = useRef(0);

  // ── Fetch Catalog Items from Backend with Global Specs Filtering ────────
  const fetchData = useCallback(async () => {
    const currentReqId = ++reqIdRef.current;
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = { page, limit, region: selectedRegion };
      if (selectedProveedor !== 'all') params.proveedor = selectedProveedor;
      if (selectedCategory !== 'all') params.categoria = selectedCategory;
      if (soloConStock) params.stock_filter = 'with_stock';
      if (soloConOrden) params.con_orden = true;
      if (sortBy) params.sort_by = sortBy;
      if (search.trim()) params.search = search.trim();

      // Mapeo directo desde filters object — si la opción no es 'Todos', se envía
      const f = filters;
      if (f.marca !== 'Todos') params.marca = f.marca;
      if (f.cpu !== 'Todos') params.cpu = f.cpu;
      if (f.cpu_gen !== 'Todos') {
        const g = f.cpu_gen;
        if (g.includes('14') || g.includes('Ultra')) params.cpu_gen = g.includes('Ultra') ? 'ultra' : 'gen14';
        else if (g.includes('13')) params.cpu_gen = 'gen13';
        else if (g.includes('12')) params.cpu_gen = 'gen12';
        else if (g.includes('11')) params.cpu_gen = 'gen11';
        else if (g.includes('10')) params.cpu_gen = 'gen10';
        else if (g.includes('7000') || g.includes('8000')) params.cpu_gen = 'ryzen7000';
        else if (g.includes('5000')) params.cpu_gen = 'ryzen5000';
      }
      if (f.ram !== 'Todos') params.ram = f.ram;
      if (f.ram_tech !== 'Todos') {
        const rt = f.ram_tech;
        params.ram_tech = rt.includes('DDR5') ? 'DDR5' : rt.includes('DDR4') ? 'DDR4' : 'LPDDR5';
      }
      if (f.storage !== 'Todos') params.disco = f.storage;
      if (f.disco_tipo !== 'Todos') {
        const dt = f.disco_tipo;
        params.disco_tipo = dt.includes('NVMe') ? 'NVMe' : dt.includes('M.2') ? 'M.2' : dt.includes('Híbrido') ? 'hibrido' : dt.includes('Solo SSD') ? 'solo_ssd' : 'solo_hdd';
      }
      // Booleanos: valor almacenado es 'si'/'no'/'Todos' directamente
      ['vga','hdmi','wifi','lan','bluetooth','unidad_optica','camara','tactil'].forEach(k => {
        if (f[k] !== 'Todos') params[k] = f[k];
      });
      if (f.office !== 'Todos') params.office = f.office;
      if (f.garantia !== 'Todos') params.garantia = f.garantia;
      if (f.display !== 'Todos') params.pantalla = f.display;
      if (f.panel !== 'Todos') params.panel = f.panel;
      if (f.resolution !== 'Todos') params.resolucion = f.resolution;
      if (f.os !== 'Todos') params.so = f.os;

      const res = await proveedoresApi.getFichas(params);
      if (currentReqId !== reqIdRef.current) return;

      const raw = res.data?.items || [];
      setTotalItems(res.data?.total ?? raw.length);
      setItems(raw.map(item => ({ ...item, specs: parseProductSpecs(item) })));
    } catch (err) {
      if (currentReqId !== reqIdRef.current) return;
      console.error('Error fetching piezas data:', err);
      setErrorMsg(err?.response?.data?.detail || err.message || 'Error al cargar los productos');
      setItems([]);
      setTotalItems(0);
    } finally {
      if (currentReqId === reqIdRef.current) setLoading(false);
    }
  }, [
    selectedProveedor, selectedCategory, selectedRegion, soloConStock,
    soloConOrden, sortBy, search, filters, page, limit
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
    dispatchFilters({ type: 'RESET' });
    setSearch('');
    setSoloConStock(false);
    setSoloConOrden(false);
    setSortBy('');
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

  const hasActiveFilters = (
    Object.values(filters).some(v => v !== 'Todos') ||
    search.trim() !== '' || soloConStock || soloConOrden || sortBy !== ''
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

      {/* ── Toolbar: Search, Stock & Order Checkboxes, Sort By ─────────── */}
      <div className="card fade-up" style={{ marginBottom: 12, padding: '10px 16px', background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 240 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c-text-tertiary)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar por N° Parte, Marca, Modelo, Procesador o Especificación…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ paddingLeft: 32, paddingRight: search ? 30 : 12, fontSize: 13, width: '100%', borderRadius: 8 }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(1); }}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--c-text-tertiary)',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Quick Toggles: Stock & OCAM */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--c-text-primary)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={soloConOrden}
                onChange={(e) => { setSoloConOrden(e.target.checked); setPage(1); }}
                style={{ cursor: 'pointer', width: 15, height: 15, accentColor: 'var(--c-brand)' }}
              />
              <span>🏷️ Solo con OCAM / Precio Histórico</span>
            </label>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--c-text-primary)', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={soloConStock}
                onChange={(e) => { setSoloConStock(e.target.checked); setPage(1); }}
                style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#16a34a' }}
              />
              <span>📦 Solo con Stock (&gt; 0)</span>
            </label>
          </div>

          {/* Sort By Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)', whiteSpace: 'nowrap' }}>
              Ordenar por:
            </span>
            <select
              className="form-select"
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, minWidth: 175 }}
            >
              <option value="">Por defecto (Relevancia)</option>
              <option value="precio_asc">Precio: Menor a Mayor (USD ↑)</option>
              <option value="precio_desc">Precio: Mayor a Menor (USD ↓)</option>
              <option value="stock_desc">Stock: Mayor a Menor (↓)</option>
              <option value="marca_asc">Marca: A - Z</option>
            </select>
          </div>

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
              value={filters.marca}
              onChange={(e) => { setFilter('marca', e.target.value); setPage(1); }}
            >
              <option value="Todos">Todos</option>
              {filterOptions.marcas.map(m => <option key={m} value={m}>{m}</option>)}
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
                value={filters.cpu}
                onChange={(e) => { setFilter('cpu', e.target.value); setPage(1); }}
              >
                <option value="Todos">Todos</option>
                {filterOptions.cpus.map(c => <option key={c} value={c}>{c}</option>)}
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
                value={filters.cpu_gen}
                onChange={(e) => { setFilter('cpu_gen', e.target.value); setPage(1); }}
              >
                <option value="Todos">Todos</option>
                {filterOptions.cpu_gens.map(cg => <option key={cg} value={cg}>{cg}</option>)}
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
                value={filters.ram}
                onChange={(e) => { setFilter('ram', e.target.value); setPage(1); }}
              >
                <option value="Todos">Todos</option>
                {filterOptions.rams.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {/* Tecnología RAM */}
          {showCpuRamStorage && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Layers size={12} style={{ color: '#059669' }} />
                Tecnología RAM
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filters.ram_tech}
                onChange={(e) => { setFilter('ram_tech', e.target.value); setPage(1); }}
              >
                <option value="Todos">Todos</option>
                {filterOptions.ram_techs.map(rt => <option key={rt} value={rt}>{rt}</option>)}
              </select>
            </div>
          )}

          {/* Almacenamiento */}
          {(showCpuRamStorage || catType === 'storage') && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <HardDrive size={12} style={{ color: 'var(--c-warning)' }} />
                Almacenamiento
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filters.storage}
                onChange={(e) => { setFilter('storage', e.target.value); setPage(1); }}
              >
                <option value="Todos">Todos</option>
                {filterOptions.storages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Tipo de Disco */}
          {(showCpuRamStorage || catType === 'storage') && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <HardDrive size={12} style={{ color: '#d97706' }} />
                Tipo de Disco
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filters.disco_tipo}
                onChange={(e) => { setFilter('disco_tipo', e.target.value); setPage(1); }}
              >
                <option value="Todos">Todos</option>
                {filterOptions.disco_tipos.map(dt => <option key={dt} value={dt}>{dt}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* ── SECCIÓN 2: PUERTOS Y CONECTIVIDAD — generado dinámicamente ─── */}
        {showMoreFilters && showPorts && (
          <div style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-brand)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <Cable size={13} />
              <span>Puertos de Video y Conectividad:</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {BOOL_FILTER_PAIRS.map(({ key, label }) => (
                <div key={key}>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                    {label}
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filters[key]}
                    onChange={(e) => { setFilter(key, e.target.value); setPage(1); }}
                  >
                    <option value="Todos">Todos</option>
                    <option value="si">Con {label} (SI)</option>
                    <option value="no">Sin {label} (NO)</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECCIÓN 3: PANTALLA, SOFTWARE Y GARANTÍA ────────────────── */}
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
                    value={filters.display}
                    onChange={(e) => { setFilter('display', e.target.value); setPage(1); }}
                  >
                    <option value="Todos">Todos</option>
                    {filterOptions.displays.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {/* Tipo de Panel */}
              {showPanelResolution && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                    Tipo de Panel
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filters.panel}
                    onChange={(e) => { setFilter('panel', e.target.value); setPage(1); }}
                  >
                    <option value="Todos">Todos</option>
                    {filterOptions.panels.map(p => <option key={p} value={p}>{p}</option>)}
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
                    value={filters.resolution}
                    onChange={(e) => { setFilter('resolution', e.target.value); setPage(1); }}
                  >
                    <option value="Todos">Todos</option>
                    {filterOptions.resolutions.map(res => <option key={res} value={res}>{res}</option>)}
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
                    value={filters.os}
                    onChange={(e) => { setFilter('os', e.target.value); setPage(1); }}
                  >
                    <option value="Todos">Todos</option>
                    {filterOptions.oss.map(os => <option key={os} value={os}>{os}</option>)}
                  </select>
                </div>
              )}

              {/* Suite Ofimática */}
              {showPeripherals && (
                <div>
                  <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Briefcase size={12} style={{ color: '#ea580c' }} />
                    Suite Ofimática
                  </label>
                  <select
                    className="form-select"
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px' }}
                    value={filters.office}
                    onChange={(e) => { setFilter('office', e.target.value); setPage(1); }}
                  >
                    <option value="Todos">Todos</option>
                    <option value="home_business">Con Office Home &amp; Business</option>
                    <option value="si">Con Office (cualquier versión)</option>
                    <option value="no">Sin Office / Licencia Libre</option>
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
                    value={filters.garantia}
                    onChange={(e) => { setFilter('garantia', e.target.value); setPage(1); }}
                  >
                    <option value="Todos">Todos</option>
                    <option value="36">36 Meses (3 Años On-Site)</option>
                    <option value="24">24 Meses (2 Años)</option>
                    <option value="12">12 Meses (1 Año)</option>
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
      {viewMode === 'grid' ? (
        loading ? (
          /* Grid View Skeleton */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
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
        ) : (
          /* ── Grid View Cards ─────────────────────────────────────────────── */
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
                        {item.estado_ficha_producto && (
                          <span
                            className="badge"
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              background: item.estado_ficha_producto.includes('VIGENTE') ? '#dcfce7' : item.estado_ficha_producto.includes('EXCLUIDA') ? '#fee2e2' : '#fef3c7',
                              color: item.estado_ficha_producto.includes('VIGENTE') ? '#15803d' : item.estado_ficha_producto.includes('EXCLUIDA') ? '#b91c1c' : '#b45309',
                              border: '1px solid rgba(0,0,0,0.05)'
                            }}
                            title={item.justificacion_estado || item.motivo_estado || `Estado Ficha: ${item.estado_ficha_producto}`}
                          >
                            {item.estado_ficha_producto}
                          </span>
                        )}
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
                          fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                          background: sp.wifi === 'SI' ? 'rgba(2,132,199,0.1)' : '#f8fafc',
                          color: sp.wifi === 'SI' ? '#0284c7' : '#94a3b8',
                          border: sp.wifi === 'SI' ? '1px solid rgba(2,132,199,0.3)' : '1px solid #e2e8f0'
                        }}>
                          Wi-Fi: {sp.wifi}
                        </span>
                      )}
                      {sp.lan && (
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                          background: sp.lan === 'SI' ? 'rgba(100,116,139,0.1)' : '#f8fafc',
                          color: sp.lan === 'SI' ? '#334155' : '#94a3b8',
                          border: '1px solid #e2e8f0'
                        }}>
                          LAN: {sp.lan}
                        </span>
                      )}
                      {sp.office && sp.office !== 'Sin Office' && (
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                          background: 'rgba(234,88,12,0.1)', color: '#c2410c', border: '1px solid rgba(234,88,12,0.25)'
                        }}>
                          {sp.office}
                        </span>
                      )}
                      {sp.garantia && (
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                          background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0'
                        }}>
                          🛡️ {sp.garantia}
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
                                  <strong style={{ color: 'var(--c-text)', fontSize: 12 }}>USD {fmt(of.precio_ofertado)}</strong>
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
                            USD {fmt(item.min_precio || item.precio_ofertado)}
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
                            USD {fmt(item.min_precio)}
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
        )
      ) : (
        /* ── Table View ──────────────────────────────────────────────────── */
        <div className="card fade-up" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>
                    <HeaderFilter
                      title="N° Parte"
                      column="nro_parte"
                      currentFilter={search}
                      onFilterChange={(v) => { setSearch(v || ''); setPage(1); }}
                      apiCall={proveedoresApi.getColumnFilter}
                    />
                  </th>
                  <th style={{ whiteSpace: 'nowrap' }}>
                    <HeaderFilter
                      title="Marca"
                      column="marca"
                      currentFilter={filters.marca === 'Todos' ? '' : filters.marca}
                      onFilterChange={(v) => { setFilter('marca', v || 'Todos'); setPage(1); }}
                      apiCall={proveedoresApi.getColumnFilter}
                    />
                  </th>
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
                  <th
                    style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    onClick={() => {
                      setSortBy(prev => prev === 'precio_asc' ? 'precio_desc' : prev === 'precio_desc' ? '' : 'precio_asc');
                      setPage(1);
                    }}
                    title="Ordenar por precio"
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      Precio Min. (USD)
                      {sortBy === 'precio_asc' ? (
                        <ArrowUp size={12} style={{ color: 'var(--c-brand)' }} />
                      ) : sortBy === 'precio_desc' ? (
                        <ArrowDown size={12} style={{ color: 'var(--c-brand)' }} />
                      ) : (
                        <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />
                      )}
                    </span>
                  </th>
                  <th style={{ textAlign: 'center', width: 95 }}>Estado</th>
                  <th style={{ textAlign: 'center' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i}>
                      <td><div className="skeleton" style={{ height: 16, width: 120 }} /></td>
                      <td><div className="skeleton" style={{ height: 16, width: 60 }} /></td>
                      <td><div className="skeleton" style={{ height: 16, width: 90 }} /></td>
                      {showCpuRamStorage && <td><div className="skeleton" style={{ height: 16, width: 100 }} /></td>}
                      {showCpuRamStorage && <td><div className="skeleton" style={{ height: 16, width: 60 }} /></td>}
                      {(showCpuRamStorage || catType === 'storage') && <td><div className="skeleton" style={{ height: 16, width: 80 }} /></td>}
                      {showPorts && <td><div className="skeleton" style={{ height: 16, width: 35 }} /></td>}
                      {showPorts && <td><div className="skeleton" style={{ height: 16, width: 35 }} /></td>}
                      {showPorts && <td><div className="skeleton" style={{ height: 16, width: 35 }} /></td>}
                      {showDisplay && <td><div className="skeleton" style={{ height: 16, width: 50 }} /></td>}
                      {showPeripherals && <td><div className="skeleton" style={{ height: 16, width: 60 }} /></td>}
                      {showOs && <td><div className="skeleton" style={{ height: 16, width: 70 }} /></td>}
                      <td><div className="skeleton" style={{ height: 16, width: 110 }} /></td>
                      <td style={{ textAlign: 'right' }}><div className="skeleton" style={{ height: 16, width: 80, marginLeft: 'auto' }} /></td>
                      <td style={{ textAlign: 'center' }}><div className="skeleton" style={{ height: 16, width: 50, margin: '0 auto' }} /></td>
                      <td style={{ textAlign: 'center' }}><div className="skeleton" style={{ height: 16, width: 30, margin: '0 auto' }} /></td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={20} style={{ textAlign: 'center', padding: 48, color: 'var(--c-text-tertiary)' }}>
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
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
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
                            USD {fmt(item.min_precio || item.precio_ofertado)}
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
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {(() => {
                            const estF = item.estado_ficha_producto;
                            const estO = item.estado_oferta;
                            if (!estF && !estO) return <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>;
                            const estU = String(estF || '').toUpperCase();
                            const isVig = estU.includes('VIGENTE');
                            const isExc = estU.includes('EXCLUIDA');
                            const isSusp = estU.includes('SUSPEND');
                            const isOfert = estU.includes('OFERTADA');

                            const bg = isVig ? '#dcfce7' : isExc ? '#fee2e2' : isSusp ? '#fef3c7' : isOfert ? '#e0f2fe' : '#f1f5f9';
                            const col = isVig ? '#15803d' : isExc ? '#b91c1c' : isSusp ? '#b45309' : isOfert ? '#0369a1' : '#64748b';
                            const bdr = isVig ? '#bbf7d0' : isExc ? '#fecaca' : isSusp ? '#fde68a' : isOfert ? '#bae6fd' : '#e2e8f0';

                            return (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                                {estF && (
                                  <span style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    background: bg,
                                    color: col,
                                    border: `1px solid ${bdr}`
                                  }} title={item.justificacion_estado || item.motivo_estado || `Ficha: ${estF}`}>
                                    {estF}
                                  </span>
                                )}
                                {estO && estO !== 'VIGENTE' && (
                                  <span style={{ fontSize: 8, color: '#64748b' }}>{String(estO).replace('_', ' ')}</span>
                                )}
                              </div>
                            );
                          })()}
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
                  })
                )}
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
