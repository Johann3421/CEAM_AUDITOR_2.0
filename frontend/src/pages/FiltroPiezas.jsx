import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cpu, HardDrive, Monitor, Layers, Search, Filter,
  ExternalLink, Building2, LayoutGrid, List, Sparkles, X, RefreshCw,
  SlidersHorizontal, Laptop, Printer, Smartphone, Clock,
  FileText, Check, Copy, AlertCircle, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Tv, MonitorCheck
} from 'lucide-react';
import { proveedoresApi } from '../services/api';
import { parseProductSpecs } from '../utils/specsParser';

const REGIONES_PERU = [
  'LIMA', 'CALLAO', 'AREQUIPA', 'CUSCO', 'LA LIBERTAD', 'PIURA', 'LAMBAYEQUE',
  'ANCASH', 'JUNIN', 'ICA', 'LORETO', 'SAN MARTIN', 'CAJAMARCA', 'HUANUCO',
  'AYACUCHO', 'PUNO', 'TACNA', 'UCAYALI', 'PASCO', 'TUMBES', 'MOQUEGUA',
  'AMAZONAS', 'APURIMAC', 'HUANCAVELICA', 'MADRE DE DIOS'
];

const CATEGORIAS_CONFIG = [
  { id: 'all', label: 'Todas las Categorías', icon: Layers },
  
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

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FiltroPiezas = () => {
  const navigate = useNavigate();

  // ── States ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [items, setItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  
  // Provider Selection: 'all' | 'thekingcomputer' | 'jorge_rojas'
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

  // Dynamic Specification Filters
  const [filterCpu, setFilterCpu] = useState('Todos');
  const [filterRam, setFilterRam] = useState('Todos');
  const [filterStorage, setFilterStorage] = useState('Todos');
  const [filterDisplay, setFilterDisplay] = useState('Todos');
  const [filterPanel, setFilterPanel] = useState('Todos');
  const [filterResolution, setFilterResolution] = useState('Todos');
  const [filterOs, setFilterOs] = useState('Todos');
  const [filterMarca, setFilterMarca] = useState('Todos');

  const [copiedPart, setCopiedPart] = useState(null);

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

  // ── Fetch Catalog Items from Backend ────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = {
        page,
        limit,
        region: selectedRegion,
      };
      if (selectedProveedor !== 'all') {
        params.proveedor = selectedProveedor;
      }
      if (selectedCategory !== 'all') {
        params.categoria = selectedCategory;
      }
      if (soloConStock) {
        params.stock_filter = 'with_stock';
      }
      if (search.trim()) {
        params.search = search.trim();
      }
      if (filterMarca !== 'Todos') {
        params.marca = filterMarca;
      }

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
  }, [selectedProveedor, selectedCategory, selectedRegion, soloConStock, search, filterMarca, page, limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Reset dynamic spec filters when category changes ────────────────────
  const handleCategoryChange = (catId) => {
    setSelectedCategory(catId);
    setPage(1);
    setFilterCpu('Todos');
    setFilterRam('Todos');
    setFilterStorage('Todos');
    setFilterDisplay('Todos');
    setFilterPanel('Todos');
    setFilterResolution('Todos');
    setFilterOs('Todos');
    setFilterMarca('Todos');
  };

  const handleProviderChange = (provId) => {
    setSelectedProveedor(provId);
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilterCpu('Todos');
    setFilterRam('Todos');
    setFilterStorage('Todos');
    setFilterDisplay('Todos');
    setFilterPanel('Todos');
    setFilterResolution('Todos');
    setFilterOs('Todos');
    setFilterMarca('Todos');
    setSearch('');
    setSoloConStock(false);
    setPage(1);
  };

  // ── Compute Active Category Configuration ───────────────────────────────
  const activeCategoryConfig = useMemo(() => {
    return CATEGORIAS_CONFIG.find(c => c.id === selectedCategory) || CATEGORIAS_CONFIG[0];
  }, [selectedCategory]);

  // ── Compute Available Filter Options dynamically from current dataset ───
  const filterOptions = useMemo(() => {
    const cpus = new Set();
    const rams = new Set();
    const storages = new Set();
    const displays = new Set();
    const panels = new Set();
    const resolutions = new Set();
    const oss = new Set();
    const marcas = new Set();

    items.forEach(item => {
      if (item.specs.cpu && item.specs.cpu !== 'S/D' && item.specs.cpu !== 'Otro / S/D') cpus.add(item.specs.cpu);
      if (item.specs.ram && item.specs.ram !== 'S/D') rams.add(item.specs.ram);
      if (item.specs.storage && item.specs.storage !== 'S/D') storages.add(item.specs.storage);
      if (item.specs.display && item.specs.display !== 'S/D' && item.specs.display !== 'Sin pantalla') displays.add(item.specs.display);
      if (item.specs.panel && item.specs.panel !== 'S/D') panels.add(item.specs.panel);
      if (item.specs.resolution && item.specs.resolution !== 'S/D') resolutions.add(item.specs.resolution);
      if (item.specs.os && item.specs.os !== 'S/D') oss.add(item.specs.os);
      if (item.marca && item.marca.trim() !== '' && item.marca !== 'VARIOS') marcas.add(item.marca.trim().toUpperCase());
    });

    const sortRam = (a, b) => (parseInt(a) || 0) - (parseInt(b) || 0);
    const sortDisplay = (a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0);

    return {
      cpus: ['Todos', ...Array.from(cpus).sort()],
      rams: ['Todos', ...Array.from(rams).sort(sortRam)],
      storages: ['Todos', ...Array.from(storages).sort()],
      displays: ['Todos', ...Array.from(displays).sort(sortDisplay)],
      panels: ['Todos', ...Array.from(panels).sort()],
      resolutions: ['Todos', ...Array.from(resolutions).sort()],
      oss: ['Todos', ...Array.from(oss).sort()],
      marcas: ['Todos', ...Array.from(marcas).sort()]
    };
  }, [items]);

  // ── Client-side Specs Filter on the Current Page Batch ───────────────────
  const displayedItems = useMemo(() => {
    return items.filter(item => {
      if (filterCpu !== 'Todos' && item.specs.cpu !== filterCpu) return false;
      if (filterRam !== 'Todos' && item.specs.ram !== filterRam) return false;
      if (filterStorage !== 'Todos' && item.specs.storage !== filterStorage) return false;
      if (filterDisplay !== 'Todos' && item.specs.display !== filterDisplay) return false;
      if (filterPanel !== 'Todos' && item.specs.panel !== filterPanel) return false;
      if (filterResolution !== 'Todos' && item.specs.resolution !== filterResolution) return false;
      if (filterOs !== 'Todos' && item.specs.os !== filterOs) return false;
      return true;
    });
  }, [items, filterCpu, filterRam, filterStorage, filterDisplay, filterPanel, filterResolution, filterOs]);

  const hasActiveFilters = (
    filterCpu !== 'Todos' || filterRam !== 'Todos' || filterStorage !== 'Todos' ||
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

  const catType = activeCategoryConfig.type || 'all';
  const showCpuRamStorage = catType === 'laptop' || catType === 'desktop' || catType === 'aio' || catType === 'all';
  const showDisplay = catType === 'laptop' || catType === 'aio' || catType === 'monitor' || catType === 'display' || catType === 'tablet' || catType === 'all';
  const showPanelResolution = catType === 'monitor' || catType === 'display' || catType === 'all';
  const showOs = catType === 'laptop' || catType === 'desktop' || catType === 'aio' || catType === 'all';

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
            Explora y audita el catálogo desglosado por proveedor, categoría oficial y componentes técnicos (CPU, RAM, Disco, Pantalla, SO).
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

      {/* ── 3. Dynamic Technical Spec Filter Matrix ──────────────────────── */}
      <div className="card fade-up" style={{ padding: '14px 18px', marginBottom: 16, border: '1px solid var(--c-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SlidersHorizontal size={16} style={{ color: 'var(--c-brand)' }} />
            Filtros Técnicos para {activeCategoryConfig.label}
          </span>
          {hasActiveFilters && (
            <button onClick={handleResetFilters} className="btn btn-sm" style={{ fontSize: 11, color: 'var(--c-danger)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <X size={12} /> Limpiar Filtros
            </button>
          )}
        </div>

        {/* Dynamic Filters Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
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
              {filterOptions.marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* CPU (Laptops, PCs, AIO, Workstations) */}
          {showCpuRamStorage && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Cpu size={12} style={{ color: 'var(--c-brand)' }} />
                Procesador (CPU)
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterCpu}
                onChange={(e) => setFilterCpu(e.target.value)}
              >
                {filterOptions.cpus.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* RAM (Laptops, PCs, AIO, Workstations) */}
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
                onChange={(e) => setFilterRam(e.target.value)}
              >
                {filterOptions.rams.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {/* Almacenamiento / Disco */}
          {(showCpuRamStorage || catType === 'storage') && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <HardDrive size={12} style={{ color: 'var(--c-warning)' }} />
                Disco / Capacidad
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterStorage}
                onChange={(e) => setFilterStorage(e.target.value)}
              >
                {filterOptions.storages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          {/* Pantalla (Pulgadas) (Laptops, AIO, Monitores, Displays, Tablets) */}
          {showDisplay && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Monitor size={12} style={{ color: '#7c3aed' }} />
                Pantalla (Pulgadas)
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterDisplay}
                onChange={(e) => setFilterDisplay(e.target.value)}
              >
                {filterOptions.displays.map(d => <option key={d} value={d}>{d}</option>)}
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
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterPanel}
                onChange={(e) => setFilterPanel(e.target.value)}
              >
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
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterResolution}
                onChange={(e) => setFilterResolution(e.target.value)}
              >
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
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterOs}
                onChange={(e) => setFilterOs(e.target.value)}
              >
                {filterOptions.oss.map(os => <option key={os} value={os}>{os}</option>)}
              </select>
            </div>
          )}
        </div>
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
          Total en BD: <strong>{totalItems.toLocaleString('es-PE')}</strong> fichas
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
            <div key={i} className="card" style={{ padding: 20, height: 240 }}>
              <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 40, width: '100%', marginBottom: 14 }} />
              <div className="skeleton" style={{ height: 24, width: '80%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 36, width: '100%', marginTop: 'auto' }} />
            </div>
          ))}
        </div>
      ) : displayedItems.length === 0 ? (
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
          {displayedItems.map((item, idx) => {
            const nroParte = item.nro_parte || 'S/N';
            const desc = item.descripcion || item.descripcion_producto || 'Sin descripción';
            const pdfUrl = item.pdf_url;
            const ofertas = Array.isArray(item.ofertas) ? item.ofertas : [];
            const isCopied = copiedPart === nroParte;

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
                        {item.categoria || item.catalogo || item.specs.formFactor}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--c-text-secondary)',
                      marginBottom: 12,
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

                  {/* Specification Chips Matrix */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
                    {item.specs.cpu && item.specs.cpu !== 'S/D' && item.specs.cpu !== 'Otro / S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(37,99,235,0.08)', color: 'var(--c-brand)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Cpu size={12} /> {item.specs.cpuFull || item.specs.cpu}
                      </span>
                    )}
                    {item.specs.ram && item.specs.ram !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(5,150,105,0.08)', color: 'var(--c-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Layers size={12} /> {item.specs.ram}
                      </span>
                    )}
                    {item.specs.storage && item.specs.storage !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(217,119,6,0.08)', color: 'var(--c-warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <HardDrive size={12} /> {item.specs.storage}
                      </span>
                    )}
                    {item.specs.display && item.specs.display !== 'S/D' && item.specs.display !== 'Sin pantalla' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(124,58,237,0.08)', color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Monitor size={12} /> {item.specs.display}
                      </span>
                    )}
                    {item.specs.panel && item.specs.panel !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155', fontWeight: 600 }}>
                        Panel {item.specs.panel}
                      </span>
                    )}
                    {item.specs.resolution && item.specs.resolution !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155', fontWeight: 600 }}>
                        {item.specs.resolution}
                      </span>
                    )}
                    {item.specs.os && item.specs.os !== 'S/D' && (
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>
                        {item.specs.os}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Section: Provider Offers & Price */}
                <div style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 12, marginTop: 'auto' }}>
                  {/* If Consolidated mode and multiple providers offer this part */}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
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
                      </div>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    {selectedProveedor === 'all' && (
                      <div>
                        <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', display: 'block' }}>Mejor Precio</span>
                        <strong style={{ fontSize: 15, color: 'var(--c-text)', fontWeight: 800 }}>
                          S/ {fmt(item.min_precio)}
                        </strong>
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
                  {showCpuRamStorage && <th>CPU</th>}
                  {showCpuRamStorage && <th>RAM</th>}
                  {(showCpuRamStorage || catType === 'storage') && <th>Disco</th>}
                  {showDisplay && <th>Pantalla</th>}
                  {showOs && <th>SO</th>}
                  <th>Proveedor(es)</th>
                  <th style={{ textAlign: 'right' }}>Precio Min. (S/)</th>
                  <th style={{ textAlign: 'center' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {displayedItems.map((item, idx) => {
                  const nroParte = item.nro_parte || 'S/N';
                  const pdfUrl = item.pdf_url;
                  const ofertas = Array.isArray(item.ofertas) ? item.ofertas : [];

                  return (
                    <tr key={item.id || idx}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--c-brand)', whiteSpace: 'nowrap' }}>
                        {nroParte}
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{item.marca || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--c-text-secondary)' }}>{item.categoria || item.catalogo || item.specs.formFactor}</td>
                      {showCpuRamStorage && <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-brand)' }}>{item.specs.cpuFull || '—'}</td>}
                      {showCpuRamStorage && <td style={{ fontSize: 11 }}>{item.specs.ram || '—'}</td>}
                      {(showCpuRamStorage || catType === 'storage') && <td style={{ fontSize: 11 }}>{item.specs.storage || '—'}</td>}
                      {showDisplay && <td style={{ fontSize: 11 }}>{item.specs.display || '—'}</td>}
                      {showOs && <td style={{ fontSize: 11, color: 'var(--c-text-tertiary)' }}>{item.specs.os || '—'}</td>}
                      <td style={{ fontSize: 11 }}>
                        {ofertas.length > 1 ? (
                          <span className="badge badge-info" style={{ fontSize: 10 }}>{ofertas.length} Proveedores</span>
                        ) : (
                          item.nombre_proveedor || item.proveedor || (ofertas[0]?.nombre_proveedor) || '—'
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        S/ {fmt(item.min_precio || item.precio_ofertado)}
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
            Mostrando <strong>{((page - 1) * limit) + 1}</strong> – <strong>{Math.min(page * limit, totalItems).toLocaleString('es-PE')}</strong> de <strong>{totalItems.toLocaleString('es-PE')}</strong> fichas
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
