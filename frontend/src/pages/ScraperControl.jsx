import React, { useState, useEffect } from 'react';
import { scraperApi } from '../services/api';
import { Play, Square, Loader2, CheckCircle, AlertCircle, Clock, Activity } from 'lucide-react';

const ScraperControl = () => {
  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState(null);
  const [catalogo, setCatalogo] = useState('Útiles de Escritorio');
  const [maxPages, setMaxPages] = useState(5);
  const [polling, setPolling] = useState(false);

  const checkStatus = async () => {
    if (!taskId) return;
    try {
      const response = await scraperApi.getStatus(taskId);
      setStatus(response.data);
      if (['SUCCESS', 'FAILURE', 'REVOKED'].includes(response.data.status)) {
        setPolling(false);
      }
    } catch (error) {
      console.error('Error checking status:', error);
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
      const response = await scraperApi.start({ catalogo, max_pages: maxPages });
      setTaskId(response.data.task_id);
      setStatus({ status: 'PENDING' });
      setPolling(true);
    } catch (error) {
      console.error('Error starting scrape:', error);
    }
  };

  const stopScrape = async () => {
    if (!taskId) return;
    try {
      await scraperApi.revoke(taskId, true);
      setPolling(false);
      checkStatus();
    } catch (error) {
      console.error('Error stopping scrape:', error);
    }
  };

  const getStatusBadge = (s) => {
    switch (s) {
      case 'SUCCESS': return 'badge-success';
      case 'FAILURE': return 'badge-danger';
      case 'PENDING': return 'badge-warning';
      case 'STARTED': return 'badge-info';
      default: return 'badge-info';
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Scraper</h1>
        <p>Motor de extracción de datos — Perú Compras</p>
      </div>

      <div className="scraper-grid">
        {/* Config Card */}
        <div className="card fade-up">
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Play size={15} style={{ color: 'var(--c-brand)' }} />
              Configurar Extracción
            </span>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Palabra Clave / Catálogo</label>
              <input
                type="text"
                className="form-input"
                value={catalogo}
                onChange={(e) => setCatalogo(e.target.value)}
                placeholder="Ej: Material de Oficina"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label className="form-label">
                Páginas máximas: <strong>{maxPages}</strong>
              </label>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value))}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-text-tertiary)', marginTop: 4 }}>
                <span>1</span>
                <span>25</span>
                <span>50</span>
              </div>
            </div>

            {!polling ? (
              <button onClick={startScrape} className="btn btn-primary btn-lg" style={{ width: '100%' }}>
                <Play size={16} />
                Lanzar Scraper
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
              <Activity size={15} style={{ color: 'var(--c-info)' }} />
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
                  Configura los parámetros y presiona Lanzar
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

                {status.result && (
                  <div style={{ width: '100%', marginTop: 20, padding: '16px', background: 'var(--c-bg)', borderRadius: 8 }}>
                    <div className="scraper-result-row">
                      <span style={{ color: 'var(--c-text-secondary)' }}>Registros insertados</span>
                      <strong style={{ color: 'var(--c-success)' }}>{status.result.inserted}</strong>
                    </div>
                    <div className="scraper-result-row">
                      <span style={{ color: 'var(--c-text-secondary)' }}>Registros actualizados</span>
                      <strong style={{ color: 'var(--c-brand)' }}>{status.result.updated}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity log */}
      <div className="card fade-up">
        <div className="card-header">
          <span className="card-title">Actividad Reciente</span>
        </div>
        <div className="empty-state">
          <Activity size={36} />
          <p>No hay actividad registrada en la sesión actual.</p>
        </div>
      </div>
    </div>
  );
};

export default ScraperControl;
