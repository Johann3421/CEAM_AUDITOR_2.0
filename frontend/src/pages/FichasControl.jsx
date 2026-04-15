import React, { useState, useEffect } from 'react';
import { fichasApi, fichasProductoApi } from '../services/api';
import {
  Play, Square, Loader2, CheckCircle, AlertCircle,
  Clock, Database, List, Info, FileSpreadsheet, Trash2,
} from 'lucide-react';

const FichasControl = () => {
  const [taskId, setTaskId]           = useState(null);
  const [status, setStatus]           = useState(null);
  const [acuerdos, setAcuerdos]       = useState([]);
  const [agreementCode, setAgreementCode] = useState('');
  const [polling, setPolling]         = useState(false);

  // Load acuerdos marco list from backend on mount
  useEffect(() => {
    fichasApi.getAcuerdos()
      .then((res) => {
        const list = res.data.acuerdos || [];
        setAcuerdos(list);
        if (list.length > 0) setAgreementCode(list[0].code);
      })
      .catch(() => {
        // Fallback for dev
        const fallback = [{ code: 'EXT-CE-2022-5', label: 'EXT-CE-2022-5 — Computadoras de Escritorio, Portátiles y Escáneres' }];
        setAcuerdos(fallback);
        setAgreementCode(fallback[0].code);
      });
  }, []);

  const checkStatus = async () => {
    if (!taskId) return;
    try {
      const response = await fichasApi.getStatus(taskId);
      setStatus(response.data);
      if (['SUCCESS', 'FAILURE', 'REVOKED'].includes(response.data.status)) {
        setPolling(false);
      }
    } catch (error) {
      console.error('Error checking fichas status:', error);
      setPolling(false);
    }
  };

  useEffect(() => {
    let interval;
    if (polling && taskId) {
      interval = setInterval(checkStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [polling, taskId]);

  const startScrape = async () => {
    try {
      const response = await fichasApi.start({ agreement_code: agreementCode });
      setTaskId(response.data.task_id);
      setStatus({ status: 'PENDING' });
      setPolling(true);
    } catch (error) {
      console.error('Error starting fichas scrape:', error);
    }
  };

  const stopScrape = async () => {
    if (!taskId) return;
    try {
      await fichasApi.revoke(taskId, true);
      setPolling(false);
      checkStatus();
    } catch (error) {
      console.error('Error stopping fichas scrape:', error);
    }
  };

  const getStatusBadge = (s) => {
    switch (s) {
      case 'SUCCESS': return 'badge-success';
      case 'FAILURE': return 'badge-danger';
      case 'PENDING': return 'badge-warning';
      case 'STARTED': return 'badge-info';
      default:        return 'badge-info';
    }
  };

  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState(null);

  const handleDeleteAll = async () => {
    if (!window.confirm('¿Estás seguro? Esto borrará TODAS las fichas de la base de datos. El próximo scraping las re-insertará desde cero.')) return;
    setDeleting(true);
    setDeleteMsg(null);
    try {
      await fichasProductoApi.deleteAll();
      setDeleteMsg({ ok: true, text: 'Tabla vaciada correctamente. Puedes lanzar el scraper para re-poblarla.' });
    } catch (e) {
      setDeleteMsg({ ok: false, text: `Error al borrar: ${e?.response?.data?.detail || e.message}` });
    } finally {
      setDeleting(false);
    }
  };

  const selectedLabel = acuerdos.find((a) => a.code === agreementCode)?.label || agreementCode;

  return (
    <div>
      <div className="page-header">
        <h1>Fichas Producto</h1>
        <p>Módulo 2 · Extractor de fichas desde el Buscador de Catálogos de Perú Compras</p>
      </div>

      {/* Info banner */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 18px',
        background: 'rgba(37,99,235,0.07)',
        border: '1px solid rgba(37,99,235,0.22)',
        borderRadius: 'var(--radius)',
        marginBottom: 24,
        fontSize: 13,
        color: 'var(--c-text-secondary)',
        lineHeight: 1.6,
      }}>
        <Info size={16} style={{ color: 'var(--c-brand)', marginTop: 2, flexShrink: 0 }} />
        <span>
          Este módulo descarga el catálogo completo de fichas-producto desde{' '}
          <strong style={{ color: 'var(--c-text)' }}>buscadorcatalogos.perucompras.gob.pe</strong>.
          La generación del Excel en el servidor puede tomar hasta <strong style={{ color: 'var(--c-text)' }}>5 minutos</strong>.
          Los datos se almacenan en la tabla <code style={{ background: 'var(--c-bg)', padding: '1px 6px', borderRadius: 4 }}>fichas_producto</code>.
        </span>
      </div>

      <div className="scraper-grid">
        {/* Config Card */}
        <div className="card fade-up">
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileSpreadsheet size={15} style={{ color: 'var(--c-brand)' }} />
              Configurar Extracción
            </span>
          </div>
          <div className="card-body">

            {/* Agreement dropdown */}
            <div style={{ marginBottom: 24 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <List size={12} />
                Acuerdo Marco
              </label>
              <select
                className="form-select"
                style={{ width: '100%' }}
                value={agreementCode}
                onChange={(e) => setAgreementCode(e.target.value)}
              >
                {acuerdos.map((a) => (
                  <option key={a.code} value={a.code}>{a.label}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 6 }}>
                Selecciona el acuerdo marco cuyas fichas-producto deseas extraer.
              </p>
            </div>

            {/* Info box */}
            <div style={{
              padding: '12px 14px',
              background: 'var(--c-bg)',
              borderRadius: 8,
              marginBottom: 24,
              fontSize: 12,
              color: 'var(--c-text-secondary)',
              lineHeight: 1.7,
            }}>
              <div style={{ marginBottom: 4 }}>
                <strong style={{ color: 'var(--c-text)' }}>Código:</strong> {agreementCode}
              </div>
              <div style={{ color: 'var(--c-text-tertiary)', fontSize: 11 }}>
                La extracción descargará el Excel completo sin filtro de fecha.
                El upsert usa <code>codigo_ficha</code> como clave primaria.
              </div>
            </div>

            {!polling ? (
              <button
                onClick={startScrape}
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                disabled={!agreementCode}
              >
                <Play size={16} />
                Lanzar Extracción de Fichas
              </button>
            ) : (
              <button onClick={stopScrape} className="btn btn-danger btn-lg" style={{ width: '100%' }}>
                <Square size={16} />
                Detener Proceso
              </button>
            )}
          </div>
        </div>

        {/* Status Card */}
        <div className="card fade-up">
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={15} style={{ color: 'var(--c-info)' }} />
              Estado en Tiempo Real
            </span>
          </div>
          <div className="card-body">
            {!status ? (
              <div className="scraper-status-center">
                <Clock size={48} style={{ color: 'var(--c-border)', marginBottom: 12 }} />
                <p style={{ fontWeight: 500, color: 'var(--c-text-secondary)' }}>
                  Esperando ejecución...
                </p>
                <p style={{ fontSize: 12, color: 'var(--c-text-tertiary)', marginTop: 4 }}>
                  Selecciona un acuerdo marco y presiona Lanzar
                </p>
              </div>
            ) : (
              <div className="scraper-status-center">
                {polling ? (
                  <Loader2 size={48} className="spin" style={{ color: 'var(--c-brand)', marginBottom: 16 }} />
                ) : status.status === 'SUCCESS' ? (
                  <CheckCircle size={48} style={{ color: 'var(--c-success)', marginBottom: 16 }} />
                ) : (
                  <AlertCircle size={48} style={{ color: 'var(--c-danger)', marginBottom: 16 }} />
                )}

                <span className={`badge ${getStatusBadge(status.status)}`} style={{ fontSize: 13, padding: '4px 16px', marginBottom: 8 }}>
                  {status.status}
                </span>

                {taskId && (
                  <p style={{ fontSize: 11, color: 'var(--c-text-tertiary)', fontFamily: 'monospace', marginTop: 4 }}>
                    ID: {taskId}
                  </p>
                )}

                {/* Agreement label */}
                {polling && (
                  <div style={{ width: '100%', marginTop: 12, padding: '10px 14px', background: 'var(--c-bg)', borderRadius: 8, fontSize: 12, color: 'var(--c-text-secondary)', textAlign: 'left' }}>
                    <strong>Acuerdo:</strong> {selectedLabel}
                  </div>
                )}

                {status.status === 'STARTED' && (
                  <p style={{ fontSize: 12, color: 'var(--c-text-tertiary)', marginTop: 12, textAlign: 'center' }}>
                    Descargando Excel desde el servidor de Perú Compras...
                    <br />Este proceso puede demorar hasta 5 minutos.
                  </p>
                )}

                {status.result && (
                  <div style={{ width: '100%', marginTop: 16, padding: '16px', background: 'var(--c-bg)', borderRadius: 8 }}>
                    <div className="scraper-result-row">
                      <span style={{ color: 'var(--c-text-secondary)' }}>Fichas procesadas</span>
                      <strong style={{ color: 'var(--c-text)' }}>{status.result.rows_processed ?? '—'}</strong>
                    </div>
                    <div className="scraper-result-row">
                      <span style={{ color: 'var(--c-text-secondary)' }}>Fichas insertadas</span>
                      <strong style={{ color: 'var(--c-success)' }}>{status.result.inserted}</strong>
                    </div>
                    <div className="scraper-result-row">
                      <span style={{ color: 'var(--c-text-secondary)' }}>Fichas actualizadas</span>
                      <strong style={{ color: 'var(--c-brand)' }}>{status.result.updated}</strong>
                    </div>
                    {status.result.errors > 0 && (
                      <div className="scraper-result-row">
                        <span style={{ color: 'var(--c-text-secondary)' }}>Filas con error</span>
                        <strong style={{ color: 'var(--c-warning)' }}>{status.result.errors}</strong>
                      </div>
                    )}
                  </div>
                )}

                {status.error && (
                  <div style={{ width: '100%', marginTop: 16, padding: '14px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8 }}>
                    <p style={{ color: 'var(--c-danger)', fontSize: 13, margin: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>
                      <strong>Error:</strong> {status.error}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card fade-up" style={{ border: '1px solid rgba(239,68,68,0.35)' }}>
        <div className="card-header" style={{ borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
          <span className="card-title" style={{ color: 'var(--c-danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trash2 size={14} />
            Zona de mantenimiento
          </span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--c-text-secondary)', marginBottom: 16 }}>
            Borra <strong>todas</strong> las fichas de la base de datos. Útil para eliminar duplicados acumulados.
            Tras borrar, lanza el scraper para re-insertar desde cero con upsert correcto.
          </p>
          {deleteMsg && (
            <div style={{
              marginBottom: 14,
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              background: deleteMsg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${deleteMsg.ok ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
              color: deleteMsg.ok ? 'var(--c-success)' : 'var(--c-danger)',
            }}>
              {deleteMsg.text}
            </div>
          )}
          <button
            className="btn btn-danger"
            onClick={handleDeleteAll}
            disabled={deleting || polling}
          >
            {deleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
            {deleting ? 'Borrando...' : 'Borrar todas las fichas'}
          </button>
        </div>
      </div>

      {/* About this module */}
      <div className="card fade-up">
        <div className="card-header">
          <span className="card-title">Acerca de este módulo</span>
        </div>
        <div style={{ padding: '16px 20px', lineHeight: 1.8, fontSize: 13, color: 'var(--c-text-secondary)' }}>
          <p style={{ margin: '0 0 10px' }}>
            El <strong style={{ color: 'var(--c-text)' }}>Módulo 2</strong> extrae fichas-producto del Buscador de Catálogos de Perú Compras
            (<code style={{ background: 'var(--c-bg)', padding: '1px 6px', borderRadius: 4 }}>buscadorcatalogos.perucompras.gob.pe</code>).
            A diferencia del Módulo 1, no usa filtros de fecha: descarga la ficha completa vigente del acuerdo marco seleccionado.
          </p>
          <ul style={{ paddingLeft: 20, margin: '0 0 10px', color: 'var(--c-text-secondary)' }}>
            <li>Upsert por <code>codigo_ficha</code> — no duplica registros en re-ejecuciones.</li>
            <li>Preserva <code>fecha_primera_carga</code> en actualizaciones.</li>
            <li>Columnas de precio en formato Perú (separador de miles <code>.</code>, decimales <code>,</code>).</li>
            <li>Los datos quedan disponibles en la tabla <code>fichas_producto</code> de la base de datos.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default FichasControl;
