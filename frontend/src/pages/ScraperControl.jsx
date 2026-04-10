import React, { useState, useEffect } from 'react';
import { scraperApi } from '../services/api';
import { Play, Square, Loader2, CheckCircle, AlertCircle, Clock, History } from 'lucide-react';

const ScraperControl = () => {
  const [task_id, setTaskId] = useState(null);
  const [status, setStatus] = useState(null);
  const [catalogo, setCatalogo] = useState('Útiles de Escritorio');
  const [maxPages, setMaxPages] = useState(5);
  const [polling, setPolling] = useState(false);

  const checkStatus = async () => {
    if (!task_id) return;
    try {
      const response = await scraperApi.getStatus(task_id);
      setStatus(response.data);
      if (['SUCCESS', 'FAILURE', 'REVOKED'].includes(response.data.status)) {
        setPolling(false);
      }
    } catch (error) {
      console.error("Error checking status:", error);
      setPolling(false);
    }
  };

  useEffect(() => {
    let interval;
    if (polling && task_id) {
      interval = setInterval(checkStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [polling, task_id]);

  const startScrape = async () => {
    try {
      const response = await scraperApi.start({ catalogo, max_pages: maxPages });
      setTaskId(response.data.task_id);
      setStatus({ status: 'PENDING' });
      setPolling(true);
    } catch (error) {
      console.error("Error starting scrape:", error);
    }
  };

  const stopScrape = async () => {
    if (!task_id) return;
    try {
      await scraperApi.revoke(task_id, true);
      setPolling(false);
      checkStatus();
    } catch (error) {
      console.error("Error stopping scrape:", error);
    }
  };

  const getStatusColor = (s) => {
    switch (s) {
      case 'SUCCESS': return 'text-emerald-500';
      case 'FAILURE': return 'text-red-500';
      case 'PENDING': return 'text-amber-500';
      case 'STARTED': return 'text-blue-500';
      default: return 'text-white/40';
    }
  };

  return (
    <div className="animate-fade">
      <h1>Scraper & Automatización</h1>
      <p className="subtitle">Configura y lanza motores de extracción de datos</p>

      <div className="chart-grid">
        {/* Configuration Card */}
        <div className="glass-effect p-8">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Play size={20} className="text-emerald-500" />
            Configurar Extracción
          </h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">Palabra Clave / Catálogo</label>
              <input 
                type="text" 
                className="input-custom" 
                value={catalogo}
                onChange={(e) => setCatalogo(e.target.value)}
                placeholder="Ej: Material de Oficina"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/60 mb-2">Páginas Máximas: {maxPages}</label>
              <input 
                type="range" 
                min="1" 
                max="50" 
                step="1"
                className="w-full accent-emerald-500"
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value))}
              />
            </div>

            <div className="flex gap-4 pt-4">
              {!polling ? (
                <button 
                  onClick={startScrape}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 py-4"
                >
                  <Play size={20} />
                  Lanzar Scraper
                </button>
              ) : (
                <button 
                  onClick={stopScrape}
                  className="bg-red-500 text-white flex-1 flex items-center justify-center gap-2 py-4 rounded-lg font-bold"
                >
                  <Square size={20} />
                  Detener Proceso
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Status Card */}
        <div className="glass-effect p-8 flex flex-col justify-center items-center text-center">
          {!status ? (
            <>
              <Clock size={64} className="text-white/5 mb-4" />
              <h4 className="text-lg font-semibold text-white/40">Esperando ejecución...</h4>
              <p className="text-sm text-white/20 mt-2">Configura los parámetros y presiona lanzar</p>
            </>
          ) : (
            <div className="w-full">
              <div className="mb-8">
                {polling ? (
                  <Loader2 size={64} className="text-blue-500 animate-spin mx-auto mb-4" />
                ) : status.status === 'SUCCESS' ? (
                  <CheckCircle size={64} className="text-emerald-500 mx-auto mb-4" />
                ) : (
                  <AlertCircle size={64} className="text-red-500 mx-auto mb-4" />
                )}
                <h4 className={`text-2xl font-bold ${getStatusColor(status.status)}`}>
                  {status.status}
                </h4>
                <p className="text-sm text-white/40 mt-1">ID: {task_id}</p>
              </div>

              {status.result && (
                <div className="bg-white/5 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between">
                    <span className="text-white/40">Insertadas:</span>
                    <span className="font-bold text-emerald-500">{status.result.inserted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Actualizadas:</span>
                    <span className="font-bold text-blue-500">{status.result.updated}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 glass-effect p-8">
        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
          <History size={20} className="text-blue-500" />
          Log de Actividad Reciente
        </h3>
        <div className="text-white/20 text-center py-10 italic">
          No hay actividad registrada en la sesión actual.
        </div>
      </div>
    </div>
  );
};

export default ScraperControl;
