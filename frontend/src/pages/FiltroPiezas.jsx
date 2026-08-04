import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cpu, HardDrive, Monitor, Layers, Search, Filter, CheckCircle,
  ExternalLink, Building2, LayoutGrid, List, Sparkles, X, Tag, RefreshCw
} from 'lucide-react';

const MOCK_PIEZAS_DATA = [
  {
    id: 1,
    nro_parte: '27-CB0003LA',
    descripcion: 'ALL IN ONE HP 27-CB0003LA AMD RYZEN 5 5500U 8GB 512GB SSD 27" FHD W11H',
    marca: 'HP',
    proveedor: 'THE KING COMPUTER E.I.R.L.',
    catalogo: 'COMPUTADORAS DE ESCRITORIO',
    specs: {
      cpu: 'AMD Ryzen 5',
      cpu_full: 'AMD Ryzen 5 5500U',
      ram: '8 GB',
      storage: '512 GB SSD',
      display: '27" FHD',
      form_factor: 'All-in-One'
    },
    precio_ref: 2580.00,
    precio_min: 2450.00,
    precio_max: 2790.00,
    n_ordenes: 18,
    pdf_url: 'https://prod-pc-cdn.azureedge.net/contproveedor/Documentos/Productos/sample.pdf'
  },
  {
    id: 2,
    nro_parte: 'LNV-THINK-M70S',
    descripcion: 'DESKTOP LENOVO THINKCENTRE M70S SFF INTEL CORE I7-12700 16GB 512GB SSD W11 PRO',
    marca: 'LENOVO',
    proveedor: 'DISTRIBUIDORA JORGE ROJAS S.A.C.',
    catalogo: 'COMPUTADORAS DE ESCRITORIO',
    specs: {
      cpu: 'Intel Core i7',
      cpu_full: 'Intel Core i7-12700',
      ram: '16 GB',
      storage: '512 GB SSD',
      display: 'Sin pantalla',
      form_factor: 'SFF Desktop'
    },
    precio_ref: 3990.00,
    precio_min: 3890.00,
    precio_max: 4250.00,
    n_ordenes: 25,
    pdf_url: '#'
  },
  {
    id: 3,
    nro_parte: 'HP-PROBOOK-450',
    descripcion: 'LAPTOP HP PROBOOK 450 G9 INTEL CORE I5-1235U 16GB 512GB SSD 15.6" FHD W11 PRO',
    marca: 'HP',
    proveedor: 'THE KING COMPUTER E.I.R.L.',
    catalogo: 'PORTÁTILES Y ESCÁNERES',
    specs: {
      cpu: 'Intel Core i5',
      cpu_full: 'Intel Core i5-1235U',
      ram: '16 GB',
      storage: '512 GB SSD',
      display: '15.6" FHD',
      form_factor: 'Laptop'
    },
    precio_ref: 3250.00,
    precio_min: 3100.00,
    precio_max: 3400.00,
    n_ordenes: 34,
    pdf_url: '#'
  },
  {
    id: 4,
    nro_parte: 'DELL-OPT-3090',
    descripcion: 'DELL OPTIPLEX 3090 TOWER INTEL CORE I5-10505 8GB 1TB HDD DOS',
    marca: 'DELL',
    proveedor: 'DISTRIBUIDORA JORGE ROJAS S.A.C.',
    catalogo: 'COMPUTADORAS DE ESCRITORIO',
    specs: {
      cpu: 'Intel Core i5',
      cpu_full: 'Intel Core i5-10505',
      ram: '8 GB',
      storage: '1 TB HDD',
      display: 'Sin pantalla',
      form_factor: 'Tower'
    },
    precio_ref: 2200.00,
    precio_min: 2100.00,
    precio_max: 2350.00,
    n_ordenes: 31,
    pdf_url: '#'
  },
  {
    id: 5,
    nro_parte: 'SK-TOWER-PRO15',
    descripcion: 'COMPUTADORA DE ESCRITORIO SEKAITECH PRO INTEL CORE I5-12400 16GB SSD 512GB W11',
    marca: 'SEKAITECH',
    proveedor: 'SEKAITECH E.I.R.L.',
    catalogo: 'COMPUTADORAS DE ESCRITORIO',
    specs: {
      cpu: 'Intel Core i5',
      cpu_full: 'Intel Core i5-12400',
      ram: '16 GB',
      storage: '512 GB SSD',
      display: '23.8" FHD',
      form_factor: 'Desktop + Monitor'
    },
    precio_ref: 2690.00,
    precio_min: 2600.00,
    precio_max: 2850.00,
    n_ordenes: 15,
    pdf_url: '#'
  }
];

const FILTER_OPTIONS = {
  cpus: ['Todos', 'Intel Core i7', 'Intel Core i5', 'Intel Core i3', 'AMD Ryzen 7', 'AMD Ryzen 5'],
  rams: ['Todos', '8 GB', '16 GB', '32 GB'],
  storages: ['Todos', '256 GB SSD', '512 GB SSD', '1 TB SSD', '1 TB HDD'],
  displays: ['Todos', '14" FHD', '15.6" FHD', '23.8" FHD', '27" FHD', 'Sin pantalla'],
  proveedores: ['Todos', 'THE KING COMPUTER E.I.R.L.', 'DISTRIBUIDORA JORGE ROJAS S.A.C.', 'SEKAITECH E.I.R.L.']
};

const fmt = (n) =>
  n == null ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FiltroPiezas = () => {
  const navigate = useNavigate();
  const [selectedCpu, setSelectedCpu] = useState('Todos');
  const [selectedRam, setSelectedRam] = useState('Todos');
  const [selectedStorage, setSelectedStorage] = useState('Todos');
  const [selectedDisplay, setSelectedDisplay] = useState('Todos');
  const [selectedProveedor, setSelectedProveedor] = useState('Todos');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Filter logic
  const filtered = useMemo(() => {
    return MOCK_PIEZAS_DATA.filter((item) => {
      if (selectedCpu !== 'Todos' && item.specs.cpu !== selectedCpu) return false;
      if (selectedRam !== 'Todos' && item.specs.ram !== selectedRam) return false;
      if (selectedStorage !== 'Todos' && item.specs.storage !== selectedStorage) return false;
      if (selectedDisplay !== 'Todos' && item.specs.display !== selectedDisplay) return false;
      if (selectedProveedor !== 'Todos' && !item.proveedor.includes(selectedProveedor.split(' ')[0])) return false;

      if (search) {
        const q = search.toLowerCase();
        const m1 = item.nro_parte.toLowerCase().includes(q);
        const m2 = item.descripcion.toLowerCase().includes(q);
        const m3 = item.marca.toLowerCase().includes(q);
        if (!m1 && !m2 && !m3) return false;
      }
      return true;
    });
  }, [selectedCpu, selectedRam, selectedStorage, selectedDisplay, selectedProveedor, search]);

  const resetPiezas = () => {
    setSelectedCpu('Todos');
    setSelectedRam('Todos');
    setSelectedStorage('Todos');
    setSelectedDisplay('Todos');
    setSelectedProveedor('Todos');
    setSearch('');
  };

  const hasActiveFilters = selectedCpu !== 'Todos' || selectedRam !== 'Todos' ||
    selectedStorage !== 'Todos' || selectedDisplay !== 'Todos' || selectedProveedor !== 'Todos' || !!search;

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Layers size={28} style={{ color: 'var(--c-brand)' }} />
            Filtro por Piezas y Componentes
          </h1>
          <p>
            Buscador y despiece de fichas producto por componentes técnicos (*CPU, RAM, Disco, Pantalla*) ampliando la vista Kenya a todos los productos del proveedor.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`btn ${viewMode === 'grid' ? 'btn-primary' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Vista Cuadrícula / Tarjetas"
          >
            <LayoutGrid size={15} />
            Tarjetas
          </button>
          <button
            className={`btn ${viewMode === 'table' ? 'btn-primary' : ''}`}
            onClick={() => setViewMode('table')}
            title="Vista Tabla"
          >
            <List size={15} />
            Tabla
          </button>
        </div>
      </div>

      {/* Main Spec Selector Matrix */}
      <div className="card fade-up" style={{ marginBottom: 20, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={16} style={{ color: 'var(--c-brand)' }} />
            Matriz de Despiece de Componentes
          </span>
          {hasActiveFilters && (
            <button onClick={resetPiezas} className="btn btn-sm" style={{ fontSize: 11 }}>
              <X size={12} /> Limpiar Filtros
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {/* CPU Selector */}
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Cpu size={14} style={{ color: 'var(--c-brand)' }} />
              Procesador (CPU)
            </label>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={selectedCpu}
              onChange={(e) => setSelectedCpu(e.target.value)}
            >
              {FILTER_OPTIONS.cpus.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* RAM Selector */}
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={14} style={{ color: 'var(--c-success)' }} />
              Memoria RAM
            </label>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={selectedRam}
              onChange={(e) => setSelectedRam(e.target.value)}
            >
              {FILTER_OPTIONS.rams.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Storage Selector */}
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HardDrive size={14} style={{ color: 'var(--c-warning)' }} />
              Almacenamiento
            </label>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={selectedStorage}
              onChange={(e) => setSelectedStorage(e.target.value)}
            >
              {FILTER_OPTIONS.storages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Display Selector */}
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Monitor size={14} style={{ color: '#7c3aed' }} />
              Pantalla / Formato
            </label>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={selectedDisplay}
              onChange={(e) => setSelectedDisplay(e.target.value)}
            >
              {FILTER_OPTIONS.displays.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Provider Selector */}
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={14} style={{ color: 'var(--c-info)' }} />
              Proveedor
            </label>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={selectedProveedor}
              onChange={(e) => setSelectedProveedor(e.target.value)}
            >
              {FILTER_OPTIONS.proveedores.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Toolbar Search Bar */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="toolbar-search" style={{ flex: 1 }}>
          <Search size={16} />
          <input
            className="form-input"
            placeholder="Buscar por código de producto, modelo o especificación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span style={{ fontSize: 12, color: 'var(--c-text-secondary)' }}>
          <strong>{filtered.length}</strong> productos coinciden
        </span>
      </div>

      {/* Grid or Table Results View */}
      {viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.length === 0 ? (
            <div className="card" style={{ gridColumn: '1 / -1', padding: 36, textAlign: 'center', color: 'var(--c-text-tertiary)' }}>
              No se encontraron fichas que coincidan con la combinación de piezas seleccionada.
            </div>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className="card fade-up" style={{ padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  {/* Top Row: Part Number & Brand */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--c-brand)', fontSize: 13 }}>
                      {item.nro_parte}
                    </span>
                    <span className="badge badge-info">{item.marca}</span>
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: 12, color: 'var(--c-text-secondary)', marginBottom: 12, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.descripcion}
                  </div>

                  {/* Component Badges Matrix */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(37,99,235,0.08)', color: 'var(--c-brand-dark)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Cpu size={12} /> {item.specs.cpu_full}
                    </span>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(5,150,105,0.08)', color: 'var(--c-success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Layers size={12} /> {item.specs.ram}
                    </span>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(217,119,6,0.08)', color: 'var(--c-warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <HardDrive size={12} /> {item.specs.storage}
                    </span>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(124,58,237,0.08)', color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Monitor size={12} /> {item.specs.display}
                    </span>
                  </div>
                </div>

                {/* Footer Price & Provider info */}
                <div style={{ borderTop: '1px solid var(--c-border-light)', paddingTop: 12, marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Building2 size={12} /> {item.proveedor}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)', display: 'block' }}>Precio Referencia Unit.</span>
                      <strong style={{ fontSize: 15, color: 'var(--c-text)' }}>S/ {fmt(item.precio_ref)}</strong>
                    </div>
                    {item.pdf_url && item.pdf_url !== '#' && (
                      <a href={item.pdf_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm" title="Ver Ficha Técnica">
                        <ExternalLink size={13} />
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="card fade-up">
          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>N° Parte</th>
                  <th>Descripción</th>
                  <th>CPU</th>
                  <th>RAM</th>
                  <th>Almacenamiento</th>
                  <th>Pantalla</th>
                  <th>Proveedor</th>
                  <th style={{ textAlign: 'right' }}>P. Ref (S/)</th>
                  <th style={{ textAlign: 'center' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--c-brand)' }}>
                      {item.nro_parte}
                    </td>
                    <td style={{ color: 'var(--c-text-secondary)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.descripcion}
                    </td>
                    <td>{item.specs.cpu_full}</td>
                    <td>{item.specs.ram}</td>
                    <td>{item.specs.storage}</td>
                    <td>{item.specs.display}</td>
                    <td style={{ fontSize: 12 }}>{item.proveedor}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>S/ {fmt(item.precio_ref)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {item.pdf_url && item.pdf_url !== '#' ? (
                        <a href={item.pdf_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                          <ExternalLink size={13} />
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiltroPiezas;
