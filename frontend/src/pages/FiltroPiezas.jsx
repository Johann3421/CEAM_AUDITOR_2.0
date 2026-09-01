import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cpu, HardDrive, Monitor, Layers, Search, Filter, CheckCircle,
  ExternalLink, Building2, LayoutGrid, List, Sparkles, X, Tag, RefreshCw,
  SlidersHorizontal, ShieldCheck, Box, Laptop, Printer, Tablet, Clock,
  FileText, Check, Copy, AlertCircle, ShoppingCart, ChevronDown
} from 'lucide-react';
import { proveedoresApi } from '../services/api';
import { parseProductSpecs } from '../utils/specsParser';

const REGIONES_PERU = [
  'LIMA', 'CALLAO', 'AREQUIPA', 'CUSCO', 'LA LIBERTAD', 'PIURA', 'LAMBAYEQUE',
  'ANCASH', 'JUNIN', 'ICA', 'LORETO', 'SAN MARTIN', 'CAJAMARCA', 'HUANUCO',
  'AYACUCHO', 'PUNO', 'TACNA', 'UCAYALI', 'PASCO', 'TUMBES', 'MOQUEGUA',
  'AMAZONAS', 'APURIMAC', 'HUANCAVELICA', 'MADRE DE DIOS'
];

const FAMILIAS = [
  { id: 'all', label: 'Todo el Catálogo', icon: Box },
  { id: 'computadoras', label: 'Computadoras y Laptops', icon: Laptop },
  { id: 'monitores', label: 'Monitores y Pantallas', icon: Monitor },
  { id: 'escaneres', label: 'Escáneres', icon: Printer },
  { id: 'tablets', label: 'Tablets', icon: Tablet },
];

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FiltroPiezas = () => {
  const navigate = useNavigate();

  // ── States ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [rawItems, setRawItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [providersList, setProvidersList] = useState([]);
  
  // Selected Provider Filter: 'all' | 'thekingcomputer' | 'jorge_rojas' | etc.
  const [selectedProveedor, setSelectedProveedor] = useState('all');
  const [selectedFamily, setSelectedFamily] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('LIMA');
  const [soloConStock, setSoloConStock] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Dynamic Specification Filters
  const [filterCpu, setFilterCpu] = useState('Todos');
  const [filterRam, setFilterRam] = useState('Todos');
  const [filterStorage, setFilterStorage] = useState('Todos');
  const [filterDisplay, setFilterDisplay] = useState('Todos');
  const [filterPanel, setFilterPanel] = useState('Todos');
  const [filterResolution, setFilterResolution] = useState('Todos');
  const [filterOs, setFilterOs] = useState('Todos');
  const [filterFormFactor, setFilterFormFactor] = useState('Todos');
  const [filterMarca, setFilterMarca] = useState('Todos');

  const [copiedPart, setCopiedPart] = useState(null);

  // ── Load Providers & Catalog Data ───────────────────────────────────────
  const fetchProviders = useCallback(async () => {
    try {
      const res = await proveedoresApi.getAccounts();
      if (res.data?.accounts) {
        setProvidersList(res.data.accounts);
      }
    } catch (_) {}
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = {
        limit: 1000,
        region: selectedRegion,
      };
      if (selectedProveedor !== 'all') {
        params.proveedor = selectedProveedor;
      }
      if (soloConStock) {
        params.stock_filter = 'with_stock';
      }

      const res = await proveedoresApi.getFichas(params);
      const items = res.data?.items || [];
      setTotalCount(res.data?.total || items.length);
      
      // Parse specs for each item
      const enriched = items.map(item => ({
        ...item,
        specs: parseProductSpecs(item)
      }));
      setRawItems(enriched);
    } catch (err) {
      console.error('Error fetching piezas data:', err);
      setErrorMsg(err?.response?.data?.detail || err.message || 'Error al cargar los productos');
    } finally {
      setLoading(false);
    }
  }, [selectedProveedor, selectedRegion, soloConStock]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Reset dynamic filters when family changes ──────────────────────────
  const handleFamilyChange = (famId) => {
    setSelectedFamily(famId);
    setFilterCpu('Todos');
    setFilterRam('Todos');
    setFilterStorage('Todos');
    setFilterDisplay('Todos');
    setFilterPanel('Todos');
    setFilterResolution('Todos');
    setFilterOs('Todos');
    setFilterFormFactor('Todos');
    setFilterMarca('Todos');
  };

  const handleResetFilters = () => {
    setFilterCpu('Todos');
    setFilterRam('Todos');
    setFilterStorage('Todos');
    setFilterDisplay('Todos');
    setFilterPanel('Todos');
    setFilterResolution('Todos');
    setFilterOs('Todos');
    setFilterFormFactor('Todos');
    setFilterMarca('Todos');
    setSearch('');
    setSoloConStock(false);
  };

  // ── Compute Available Filter Options dynamically from dataset ──────────
  const filterOptions = useMemo(() => {
    const subset = rawItems.filter(item => {
      if (selectedFamily !== 'all' && item.specs.family !== selectedFamily) return false;
      return true;
    });

    const cpus = new Set();
    const rams = new Set();
    const storages = new Set();
    const displays = new Set();
    const panels = new Set();
    const resolutions = new Set();
    const oss = new Set();
    const formFactors = new Set();
    const marcas = new Set();

    subset.forEach(item => {
      if (item.specs.cpu && item.specs.cpu !== 'S/D' && item.specs.cpu !== 'Otro / S/D') cpus.add(item.specs.cpu);
      if (item.specs.ram && item.specs.ram !== 'S/D') rams.add(item.specs.ram);
      if (item.specs.storage && item.specs.storage !== 'S/D') storages.add(item.specs.storage);
      if (item.specs.display && item.specs.display !== 'S/D') displays.add(item.specs.display);
      if (item.specs.panel && item.specs.panel !== 'S/D') panels.add(item.specs.panel);
      if (item.specs.resolution && item.specs.resolution !== 'S/D') resolutions.add(item.specs.resolution);
      if (item.specs.os && item.specs.os !== 'S/D') oss.add(item.specs.os);
      if (item.specs.formFactor && item.specs.formFactor !== 'S/D') formFactors.add(item.specs.formFactor);
      if (item.marca && item.marca.trim() !== '') marcas.add(item.marca.trim().toUpperCase());
    });

    // Custom sorting helpers
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
      formFactors: ['Todos', ...Array.from(formFactors).sort()],
      marcas: ['Todos', ...Array.from(marcas).sort()]
    };
  }, [rawItems, selectedFamily]);

  // ── Filtered items based on active specs and search ─────────────────────
  const filteredItems = useMemo(() => {
    return rawItems.filter(item => {
      // 1. Family filter
      if (selectedFamily !== 'all' && item.specs.family !== selectedFamily) return false;

      // 2. Dynamic Spec Filters
      if (filterCpu !== 'Todos' && item.specs.cpu !== filterCpu) return false;
      if (filterRam !== 'Todos' && item.specs.ram !== filterRam) return false;
      if (filterStorage !== 'Todos' && item.specs.storage !== filterStorage) return false;
      if (filterDisplay !== 'Todos' && item.specs.display !== filterDisplay) return false;
      if (filterPanel !== 'Todos' && item.specs.panel !== filterPanel) return false;
      if (filterResolution !== 'Todos' && item.specs.resolution !== filterResolution) return false;
      if (filterOs !== 'Todos' && item.specs.os !== filterOs) return false;
      if (filterFormFactor !== 'Todos' && item.specs.formFactor !== filterFormFactor) return false;
      if (filterMarca !== 'Todos' && item.marca?.toUpperCase() !== filterMarca) return false;

      // 3. Search query filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const nro = (item.nro_parte || '').toLowerCase();
        const desc = (item.descripcion || item.descripcion_producto || '').toLowerCase();
        const brand = (item.marca || '').toLowerCase();
        const cpuF = (item.specs.cpuFull || '').toLowerCase();
        if (!nro.includes(q) && !desc.includes(q) && !brand.includes(q) && !cpuF.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [
    rawItems, selectedFamily, filterCpu, filterRam, filterStorage,
    filterDisplay, filterPanel, filterResolution, filterOs,
    filterFormFactor, filterMarca, search
  ]);

  const hasActiveFilters = (
    filterCpu !== 'Todos' || filterRam !== 'Todos' || filterStorage !== 'Todos' ||
    filterDisplay !== 'Todos' || filterPanel !== 'Todos' || filterResolution !== 'Todos' ||
    filterOs !== 'Todos' || filterFormFactor !== 'Todos' || filterMarca !== 'Todos' ||
    search.trim() !== '' || soloConStock
  );

  const copyPartNumber = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPart(text);
    setTimeout(() => setCopiedPart(null), 2000);
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 40 }}>
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.5rem', fontWeight: 800 }}>
            <Layers size={26} style={{ color: 'var(--c-brand)' }} />
            Filtro por Piezas y Componentes
          </h1>
          <p style={{ color: 'var(--c-text-secondary)', fontSize: 13, marginTop: 4 }}>
            Búsqueda de equipos por especificaciones técnicas desglosadas (*CPU, RAM, Disco, Pantalla, Panel, SO*) separadas por proveedor.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Region Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--c-surface)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
            <Clock size={14} style={{ color: 'var(--c-text-tertiary)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)' }}>Plazo en:</span>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
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
            title="Recargar datos del catálogo"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── 1. Provider Tabs (Cada Proveedor su propio apartado) ─────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        <button
          onClick={() => setSelectedProveedor('all')}
          className={`btn ${selectedProveedor === 'all' ? 'btn-primary' : ''}`}
          style={{
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: selectedProveedor === 'all' ? 'none' : '1px solid var(--c-border)',
            background: selectedProveedor === 'all' ? undefined : 'var(--c-surface)',
            color: selectedProveedor === 'all' ? '#fff' : 'var(--c-text)',
            whiteSpace: 'nowrap'
          }}
        >
          <Building2 size={16} />
          <span>Todos los Proveedores (Consolidado)</span>
        </button>

        <button
          onClick={() => setSelectedProveedor('thekingcomputer')}
          className={`btn ${selectedProveedor === 'thekingcomputer' ? 'btn-primary' : ''}`}
          style={{
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: selectedProveedor === 'thekingcomputer' ? 'none' : '1px solid var(--c-border)',
            background: selectedProveedor === 'thekingcomputer' ? '#1e293b' : 'var(--c-surface)',
            color: selectedProveedor === 'thekingcomputer' ? '#fff' : 'var(--c-text)',
            whiteSpace: 'nowrap'
          }}
        >
          <span style={{ fontSize: 14 }}>👑</span>
          <span>THE KING COMPUTER E.I.R.L.</span>
        </button>

        <button
          onClick={() => setSelectedProveedor('jorge_rojas')}
          className={`btn ${selectedProveedor === 'jorge_rojas' ? 'btn-primary' : ''}`}
          style={{
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: selectedProveedor === 'jorge_rojas' ? 'none' : '1px solid var(--c-border)',
            background: selectedProveedor === 'jorge_rojas' ? '#0f766e' : 'var(--c-surface)',
            color: selectedProveedor === 'jorge_rojas' ? '#fff' : 'var(--c-text)',
            whiteSpace: 'nowrap'
          }}
        >
          <Building2 size={16} />
          <span>DISTRIBUIDORA JORGE ROJAS S.A.C.</span>
        </button>
      </div>

      {/* ── 2. Product Family Selector Tabs ──────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid var(--c-border)', paddingBottom: 10, overflowX: 'auto' }}>
        {FAMILIAS.map(fam => {
          const Icon = fam.icon;
          const isActive = selectedFamily === fam.id;
          return (
            <button
              key={fam.id}
              onClick={() => handleFamilyChange(fam.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                border: 'none',
                background: isActive ? 'rgba(37,99,235,0.1)' : 'transparent',
                color: isActive ? 'var(--c-brand)' : 'var(--c-text-secondary)',
                cursor: 'pointer',
                transition: 'all .15s',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={16} />
              {fam.label}
            </button>
          );
        })}
      </div>

      {/* ── 3. Dynamic Technical Spec Filter Matrix ──────────────────────── */}
      <div className="card fade-up" style={{ padding: 18, marginBottom: 20, border: '1px solid var(--c-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <SlidersHorizontal size={16} style={{ color: 'var(--c-brand)' }} />
            Filtros Técnicos para {FAMILIAS.find(f => f.id === selectedFamily)?.label}
          </span>
          {hasActiveFilters && (
            <button onClick={handleResetFilters} className="btn btn-sm" style={{ fontSize: 11, color: 'var(--c-danger)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <X size={12} /> Limpiar Filtros
            </button>
          )}
        </div>

        {/* Dynamic Filters depending on Selected Family */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          {/* Marca (Universal) */}
          <div>
            <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
              Marca
            </label>
            <select
              className="form-select"
              style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
              value={filterMarca}
              onChange={(e) => setFilterMarca(e.target.value)}
            >
              {filterOptions.marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Form Factor / Tipo (Computadoras / Escáneres) */}
          {(selectedFamily === 'computadoras' || selectedFamily === 'all' || selectedFamily === 'escaneres') && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'block' }}>
                Formato / Tipo
              </label>
              <select
                className="form-select"
                style={{ width: '100%', fontSize: 12, padding: '6px 10px' }}
                value={filterFormFactor}
                onChange={(e) => setFilterFormFactor(e.target.value)}
              >
                {filterOptions.formFactors.map(ff => <option key={ff} value={ff}>{ff}</option>)}
              </select>
            </div>
          )}

          {/* CPU (Computadoras / Tablets) */}
          {(selectedFamily === 'computadoras' || selectedFamily === 'all') && (
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

          {/* RAM (Computadoras / Tablets) */}
          {(selectedFamily === 'computadoras' || selectedFamily === 'tablets' || selectedFamily === 'all') && (
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

          {/* Almacenamiento (Computadoras / Tablets) */}
          {(selectedFamily === 'computadoras' || selectedFamily === 'tablets' || selectedFamily === 'all') && (
            <div>
              <label className="form-label" style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <HardDrive size={12} style={{ color: 'var(--c-warning)' }} />
                Disco / Almacenamiento
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

          {/* Pantalla (Pulgadas) (Computadoras / Monitores / Tablets) */}
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

          {/* Tipo de Panel (Monitores) */}
          {(selectedFamily === 'monitores' || selectedFamily === 'all') && (
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

          {/* Resolución (Monitores / Laptops) */}
          {(selectedFamily === 'monitores' || selectedFamily === 'computadoras' || selectedFamily === 'all') && (
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

          {/* Sistema Operativo (Computadoras) */}
          {(selectedFamily === 'computadoras' || selectedFamily === 'all') && (
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

      {/* ── 4. Toolbar Search & Stock Filter ─────────────────────────────── */}
      <div className="toolbar" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="toolbar-search" style={{ flex: 1, minWidth: 260, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--c-text-tertiary)' }} />
          <input
            className="form-input"
            style={{ width: '100%', paddingLeft: 36 }}
            placeholder="Buscar por Nro. de Parte, modelo, serie o palabras clave..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            onChange={(e) => setSoloConStock(e.target.checked)}
            style={{ accentColor: 'var(--c-success)', width: 15, height: 15 }}
          />
          <span style={{ color: soloConStock ? 'var(--c-success)' : 'var(--c-text-secondary)', fontWeight: soloConStock ? 600 : 400 }}>
            Solo con stock disponible
          </span>
        </label>

        <span style={{ fontSize: 12, color: 'var(--c-text-secondary)', background: 'var(--c-surface)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
          <strong>{filteredItems.length}</strong> productos encontrados
        </span>
      </div>

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
      ) : filteredItems.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-tertiary)' }}>
          <AlertCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>No se encontraron productos</h3>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            Ninguna ficha coincide con la combinación de componentes seleccionada. Prueba limpiando algunos filtros.
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
          {filteredItems.map((item, idx) => {
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
                  {/* Top Bar: Part Number & Brand & Form Factor */}
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
                        {item.specs.formFactor}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--c-text-secondary)',
                      marginBottom: 14,
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
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
                    {item.specs.display && item.specs.display !== 'S/D' && (
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
                              <span style={{ fontWeight: 600, color: isKing ? '#1e293b' : '#0f766e', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  <th>Formato</th>
                  <th>CPU</th>
                  <th>RAM</th>
                  <th>Disco</th>
                  <th>Pantalla</th>
                  <th>SO</th>
                  <th>Proveedor(es)</th>
                  <th style={{ textAlign: 'right' }}>Precio Min. (S/)</th>
                  <th style={{ textAlign: 'center' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const nroParte = item.nro_parte || 'S/N';
                  const pdfUrl = item.pdf_url;
                  const ofertas = Array.isArray(item.ofertas) ? item.ofertas : [];

                  return (
                    <tr key={item.id || idx}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--c-brand)', whiteSpace: 'nowrap' }}>
                        {nroParte}
                      </td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{item.marca || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--c-text-secondary)' }}>{item.specs.formFactor}</td>
                      <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-brand)' }}>{item.specs.cpuFull || '—'}</td>
                      <td style={{ fontSize: 11 }}>{item.specs.ram || '—'}</td>
                      <td style={{ fontSize: 11 }}>{item.specs.storage || '—'}</td>
                      <td style={{ fontSize: 11 }}>{item.specs.display || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--c-text-tertiary)' }}>{item.specs.os || '—'}</td>
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
    </div>
  );
};

export default FiltroPiezas;
