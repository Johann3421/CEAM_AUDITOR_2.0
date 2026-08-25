import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { proveedoresApi } from '../services/api';
import HeaderFilter from '../components/HeaderFilter';
import {
  Building2, Search, FileText, ChevronLeft, ChevronRight,
  ExternalLink, Tag, DollarSign, Package, TrendingUp, X, RefreshCw,
  Code, Copy, Check, Cpu, HardDrive, Monitor, Download,
  ArrowUp, ArrowDown, ChevronsUpDown, Filter
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
  if (!desc) return {};
  const getMatch = (regex) => {
    const m = desc.match(regex);
    return m ? m[1].trim() : null;
  };

  const procesador = getMatch(/PROCESADOR:\s*([^;]+?)(?=\s+RAM:|\s+ALMACENAMIENTO:|$)/i);
  const ram = getMatch(/RAM:\s*([^;]+?)(?=\s+ALMACENAMIENTO:|\s+PANTALLA:|$)/i);
  const disco = getMatch(/ALMACENAMIENTO:\s*([^;]+?)(?=\s+PANTALLA:|\s+LAN:|$)/i);
  const pantalla = getMatch(/PANTALLA:\s*([^;]+?)(?=\s+LAN:|\s+WLAN:|$)/i);
  const so = getMatch(/SIST\.\s*OPER:\s*([^;]+?)(?=\s+UNIDAD|\s+TECLADO:|$)/i);
  const garantia = getMatch(/G\.\s*F:\s*([^;]+?)(?=\s+UNIDAD|\s+SIST\.|$)/i);
  const modelo = getMatch(/UNIDAD\s+([A-Z0-9_-]+)\s+([A-Z0-9\s_-]+?)(?=\s+[A-Z0-9_*#/-]+\s+SIST\.\s+MANEJO|$)/i);

  return {
    procesador,
    ram,
    disco,
    pantalla,
    so,
    garantia,
    modelo: modelo ? modelo.replace(/\s+/g, ' ') : null
  };
};

const ProveedorFichas = () => {
  const navigate = useNavigate();
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [search, setSearch] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('');
  const [stockFilter, setStockFilter] = useState(''); // '', 'with_stock', 'zero_stock'
  const [sortBy, setSortBy] = useState(''); // 'precio_asc', 'precio_desc', 'stock_desc', 'marca_asc'
  const [fichas, setFichas] = useState([]);
  const [totalFichas, setTotalFichas] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeMessage, setScrapeMessage] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedJsonItem, setSelectedJsonItem] = useState(null);
  const [copied, setCopied] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);

  const fetchFichasData = () => {
    setLoading(true);
    const provName = MAIN_PROVIDERS.find(p => p.id === selectedProvider)?.name || '';
    proveedoresApi.getFichas({
      proveedor: selectedProvider !== 'all' ? provName : undefined,
      search: search || undefined,
      marca: marcaFilter || undefined,
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
    fetchFichasData();
  }, [selectedProvider, search, marcaFilter, stockFilter, sortBy, page, limit]);

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
    setScrapeMessage('⚡ Conectando a Perú Compras e iniciando extracción...');
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

  const hasActiveFilters = Boolean(search || marcaFilter || stockFilter || sortBy || selectedProvider !== 'all');

  const clearAllFilters = () => {
    setSearch('');
    setMarcaFilter('');
    setStockFilter('');
    setSortBy('');
    setSelectedProvider('all');
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

  const activeProviderObj = MAIN_PROVIDERS.find(p => p.id === selectedProvider);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 700, margin: 0 }}>
            <Building2 size={26} style={{ color: 'var(--c-brand)' }} />
            Ofertas y Fichas de Proveedores — Perú Compras
          </h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--c-text-secondary)', fontSize: 14 }}>
            Catálogo completo extraído directamente del portal oficial (Acuerdo Marco EXT-CE-2022-5)
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleDownloadFullJson}
            disabled={exportingJson || totalFichas === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 15px', fontWeight: 600 }}
            title="Descargar todas las ofertas en un archivo .json"
          >
            <Download size={16} />
            {exportingJson ? 'Generando...' : '📥 Descargar JSON Completo'}
          </button>

          <button
            className="btn btn-primary"
            onClick={handleStartScrape}
            disabled={scraping}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontWeight: 600 }}
          >
            <RefreshCw size={16} className={scraping ? 'spin' : ''} />
            {scraping ? 'Extrayendo en 2do Plano...' : '⚡ Actualizar Ofertas (Scraper)'}
          </button>
        </div>
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

          {/* Live Browser Screenshot Preview */}
          {scrapeStatus?.latest_screenshot && (
            <div style={{ marginBottom: 14, background: '#f8fafc', border: '1px solid var(--c-border)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span>🖥️ Vista en Vivo del Navegador (Perú Compras)</span>
              </div>
              <img 
                src={scrapeStatus.latest_screenshot} 
                alt="Vista en vivo del navegador" 
                style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 6, border: '1px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} 
              />
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
            maxHeight: 180, 
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

      {/* KPI Stats Bar */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--c-brand)' }}>
            <Package size={20} />
          </div>
          <div>
            <div className="stat-value">{kpiStats.fichasCount.toLocaleString('es-PE')}</div>
            <div className="stat-label">Total Ofertas Extraídas</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 2 }}>
              Dataset oficial Perú Compras
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(5,150,105,0.1)', color: 'var(--c-success)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="stat-value">{kpiStats.totalStock} unid.</div>
            <div className="stat-label">Stock en Página Actual</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 2 }}>
              Existencias vigentes
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--c-warning)' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <div className="stat-value">USD {fmt(kpiStats.avgPrecio)}</div>
            <div className="stat-label">Precio Promedio Ofertado</div>
            <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 2 }}>
              Promedio unitario vigente
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="card fade-up" style={{ marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="toolbar-search" style={{ flex: 1, minWidth: 260 }}>
            <Search size={16} />
            <input
              className="form-input"
              placeholder="Buscar por N° Parte, Marca, Procesador o Modelo…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={14} style={{ color: 'var(--c-text-tertiary)' }} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text-secondary)' }}>Stock:</span>
            <select
              className="form-select"
              value={stockFilter}
              onChange={(e) => { setStockFilter(e.target.value); setPage(0); }}
              style={{ width: 150 }}
            >
              <option value="">Todos los stocks</option>
              <option value="with_stock">Con stock (&gt; 0)</option>
              <option value="zero_stock">Sin stock (0 unid.)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text-secondary)' }}>Proveedor:</span>
            <select
              className="form-select"
              value={selectedProvider}
              onChange={(e) => { setSelectedProvider(e.target.value); setPage(0); }}
              style={{ minWidth: 170 }}
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
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <X size={14} />
              Limpiar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="card fade-up" style={{ padding: 0, overflow: 'visible' }}>
        <div className="card-header" style={{ padding: '14px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600 }}>
            <FileText size={17} style={{ color: 'var(--c-brand)' }} />
            Listado de Fichas de Productos Ofertados
          </span>
          <span style={{ fontSize: 13, color: 'var(--c-text-secondary)' }}>
            Mostrando <strong>{fichas.length}</strong> de <strong>{totalFichas.toLocaleString('es-PE')}</strong> ofertas (Pág. {page + 1} de {Math.max(1, Math.ceil(totalFichas / limit))})
          </span>
        </div>

        <div className="table-wrap" style={{ overflow: 'visible' }}>
          <table className="data-table" style={{ fontSize: '0.86rem', width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--c-border)' }}>
                {/* 1. Marca & Código */}
                <th style={{ width: 170, padding: '12px 14px' }}>
                  <HeaderFilter
                    title="Marca & Código"
                    column="marca"
                    currentFilter={marcaFilter}
                    onFilterChange={(v) => { setMarcaFilter(v); setPage(0); }}
                    apiCall={proveedoresApi.getColumnFilter}
                  />
                </th>

                {/* 2. Ficha Técnica / Especificaciones */}
                <th style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Ficha Técnica / Especificaciones</span>
                  </div>
                </th>

                {/* 3. Estado */}
                <th style={{ width: 110, textAlign: 'center', padding: '12px 14px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span>Estado</span>
                  </div>
                </th>

                {/* 4. Precio Ofertado (con Sorting) */}
                <th 
                  onClick={() => toggleSort('precio')}
                  style={{ width: 150, textAlign: 'right', padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Precio"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    <span>Precio Ofertado</span>
                    {sortBy === 'precio_asc' ? (
                      <ArrowUp size={13} style={{ color: 'var(--c-brand)' }} />
                    ) : sortBy === 'precio_desc' ? (
                      <ArrowDown size={13} style={{ color: 'var(--c-brand)' }} />
                    ) : (
                      <ChevronsUpDown size={13} style={{ color: 'var(--c-text-tertiary)' }} />
                    )}
                  </div>
                </th>

                {/* 5. Stock (con Sorting) */}
                <th 
                  onClick={() => toggleSort('stock')}
                  style={{ width: 110, textAlign: 'center', padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
                  title="Ordenar por Existencias"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <span>Stock</span>
                    {sortBy === 'stock_desc' ? (
                      <ArrowDown size={13} style={{ color: 'var(--c-brand)' }} />
                    ) : (
                      <ChevronsUpDown size={13} style={{ color: 'var(--c-text-tertiary)' }} />
                    )}
                  </div>
                </th>

                {/* 6. Datos / Proveedor */}
                <th style={{ width: 140, textAlign: 'center', padding: '12px 14px' }}>
                  <HeaderFilter
                    title="Proveedor / Datos"
                    column="proveedor"
                    currentFilter={selectedProvider !== 'all' ? selectedProvider : ''}
                    onFilterChange={(v) => {
                      const match = MAIN_PROVIDERS.find(p => p.name === v || p.short === v);
                      setSelectedProvider(match ? match.id : (v ? v : 'all'));
                      setPage(0);
                    }}
                    apiCall={proveedoresApi.getColumnFilter}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={18} className="spin" />
                      <span>Cargando ofertas de la base de datos...</span>
                    </div>
                  </td>
                </tr>
              ) : fichas.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--c-text-tertiary)' }}>
                    No se encontraron registros para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                fichas.map((f, idx) => {
                  const specs = parseSpecs(f.descripcion);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--c-border)', transition: 'background 0.15s' }}>
                      {/* Marca & Nro Parte */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ 
                            display: 'inline-block',
                            padding: '2px 8px', 
                            borderRadius: 4, 
                            fontSize: 11, 
                            fontWeight: 700, 
                            background: f.marca === 'HP' ? '#eff6ff' : f.marca === 'LENOVO' ? '#fef2f2' : f.marca === 'DELL' ? '#f0fdf4' : '#f1f5f9',
                            color: f.marca === 'HP' ? '#1d4ed8' : f.marca === 'LENOVO' ? '#b91c1c' : f.marca === 'DELL' ? '#15803d' : '#334155',
                            width: 'fit-content'
                          }}>
                            {f.marca || 'VARIOS'}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, color: 'var(--c-text-primary)' }}>
                            {f.nro_parte || 'S/N'}
                          </span>
                        </div>
                      </td>

                      {/* Specs / Descripcion */}
                      <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontWeight: 600, color: 'var(--c-text-primary)', fontSize: 13 }}>
                            {specs.modelo ? `${f.marca} ${specs.modelo}` : (f.descripcion?.split(':')[0] || 'Computadora Todo en Uno')}
                          </div>

                          {/* Tech Specs Chips */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {specs.procesador && (
                              <span style={{ background: '#f1f5f9', color: '#1e293b', fontSize: 11, padding: '2px 7px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Cpu size={12} style={{ color: 'var(--c-brand)' }} />
                                {specs.procesador}
                              </span>
                            )}
                            {specs.ram && (
                              <span style={{ background: '#f1f5f9', color: '#1e293b', fontSize: 11, padding: '2px 7px', borderRadius: 4 }}>
                                RAM: <strong>{specs.ram}</strong>
                              </span>
                            )}
                            {specs.disco && (
                              <span style={{ background: '#f1f5f9', color: '#1e293b', fontSize: 11, padding: '2px 7px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <HardDrive size={12} />
                                {specs.disco}
                              </span>
                            )}
                            {specs.pantalla && (
                              <span style={{ background: '#f1f5f9', color: '#1e293b', fontSize: 11, padding: '2px 7px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Monitor size={12} />
                                {specs.pantalla}
                              </span>
                            )}
                            {specs.so && (
                              <span style={{ background: '#f1f5f9', color: '#1e293b', fontSize: 11, padding: '2px 7px', borderRadius: 4 }}>
                                {specs.so}
                              </span>
                            )}
                          </div>

                          {/* Raw text preview */}
                          <div style={{ fontSize: 11, color: 'var(--c-text-tertiary)', maxWidth: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.descripcion}>
                            {f.descripcion}
                          </div>
                        </div>
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '12px 14px', textAlign: 'center', verticalAlign: 'top' }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '3px 8px', 
                          borderRadius: 12, 
                          fontSize: 11, 
                          fontWeight: 600, 
                          background: '#ecfdf5', 
                          color: '#047857',
                          border: '1px solid #a7f3d0'
                        }}>
                          {f.estado || 'VIGENTE'}
                        </span>
                      </td>

                      {/* Precio */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text-primary)', fontFamily: 'monospace' }}>
                            {f.moneda || 'USD'} {fmt(f.precio_ofertado || f.precio_referencia)}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--c-text-tertiary)' }}>
                            P. Unitario Vigente
                          </span>
                        </div>
                      </td>

                      {/* Stock */}
                      <td style={{ padding: '12px 14px', textAlign: 'center', verticalAlign: 'top' }}>
                        <span style={{ 
                          display: 'inline-block',
                          padding: '3px 8px', 
                          borderRadius: 6, 
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
                      <td style={{ padding: '12px 14px', textAlign: 'center', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => setSelectedJsonItem(f)}
                            style={{ padding: '4px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Ver JSON completo de este registro"
                          >
                            <Code size={13} style={{ color: 'var(--c-brand)' }} />
                            <span>JSON</span>
                          </button>

                          {f.pdf_url && f.pdf_url !== '#' && (
                            <a
                              href={f.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm"
                              style={{ padding: '4px 6px' }}
                              title="Ver PDF Ficha Técnica"
                            >
                              <ExternalLink size={13} />
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
          padding: '14px 20px', 
          borderTop: '1px solid var(--c-border)',
          background: '#f8fafc',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--c-text-secondary)' }}>
            <span>Registros por página:</span>
            <select
              className="form-select"
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(0); }}
              style={{ width: 85, padding: '5px 8px' }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={500}>500</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0 || loading}
              className="btn btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px' }}
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              Página {page + 1} de {Math.max(1, Math.ceil(totalFichas / limit))}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={(page + 1) * limit >= totalFichas || loading}
              className="btn btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px' }}
            >
              Siguiente
              <ChevronRight size={16} />
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
            maxWidth: 750,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--c-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Code size={18} style={{ color: 'var(--c-brand)' }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                  Inspección de Objeto JSON — [{selectedJsonItem.marca}] {selectedJsonItem.nro_parte}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedJsonItem(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1, background: '#0f172a' }}>
              <pre style={{
                margin: 0,
                color: '#38bdf8',
                fontFamily: 'monospace',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap'
              }}>
                {JSON.stringify(selectedJsonItem, null, 2)}
              </pre>
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
                N° Parte: <strong>{selectedJsonItem.nro_parte}</strong> | Marca: <strong>{selectedJsonItem.marca}</strong>
              </span>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleCopyJson}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {copied ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}
                  {copied ? '¡Copiado!' : 'Copiar JSON'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setSelectedJsonItem(null)}
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
