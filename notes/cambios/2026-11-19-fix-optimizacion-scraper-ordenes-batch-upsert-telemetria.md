# 2026-11-19 — Optimización Radical y Fix del Scraper de Órdenes (/scraper): Batch Upsert PostgreSQL, Reutilización de Browser y Telemetría en Tiempo Real

- **Fecha:** 2026-11-19
- **Tipo:** Bugfix / Performance Optimization / Architectural Refactor
- **Estado:** Completado
- **Módulos Afectados:** `backend/app/services/scraper.py`, `backend/app/worker/tasks.py`, `frontend/src/pages/ScraperControl.jsx`

---

## 1. Contexto y Problema
En la ruta `/scraper` (`https://auditor.sekaitech.com.pe/scraper`), la extracción de órdenes de compra públicas presentaba bloqueos severos en producción:
1. **Falso congelamiento al 88%:** Celery no reportaba progreso intermedio entre chunks de 30 días, dejando al frontend con un timer artificial detenido en 88% durante 15 a 25 minutos.
2. **Caída del Celery Worker por OOM (Signal 15):** Se creaba y destruía Chromium 11 veces consecutivas por cada extracción anual, saturando la memoria RAM del VPS Dokploy y provocando la muerte del proceso `ceam_worker`.
3. **Cuello de botella I/O en PostgreSQL:** Cada orden se insertaba individualmente con 2 consultas `SELECT`, un `db.commit()` y un `db.refresh()`, generando hasta 88,000 operaciones SQL síncronas por corrida.
4. **Timeouts excesivos:** Espera de 600s para descargas inexistentes en chunks sin órdenes.
5. **Poda destructiva huérfana:** Eliminaba órdenes físicas legítimas sin prefijo `OCAM-`.

---

## 2. Soluciones Implementadas

### A. Batch Upsert Nativo PostgreSQL (`backend/app/services/scraper.py`)
- Implementada la función `batch_upsert_orders(db_session, orders)`:
  - Deduplica en memoria por `orden_electronica` para evitar violaciones de cardinalidad.
  - Pre-consulta en un solo `SELECT ... WHERE orden_electronica IN (...)` para contar altas vs actualizaciones.
  - Ejecuta `insert(PurchaseOrder).on_conflict_do_update(index_elements=['orden_electronica'], set_=...)` en lotes de 500 registros con un único `commit()`.
  - Reduce las transacciones SQL de 88,000 a ~22 por extracción anual (aceleración de más del 95%).

### B. Reutilización de Instancia Única de Playwright (`_run_scrape_async`)
- Se abre una única sesión de Chromium (`async_playwright()`) al inicio del job.
- Se selecciona el Acuerdo Marco en Select2 una sola vez.
- Para cada chunk de 30 días, se actualizan los inputs `#fechaInicial` y `#fechaFinal`, se pulsa `#btnBuscar` y se verifica si `tr.FilaDatos > 0`.
- Si el chunk no tiene registros, se omite de inmediato la descarga de Excel (0 segundos de espera en vez de 600s).
- Si el chunk tiene registros, el timeout de descarga se ajustó a 60s seguro.

### C. Telemetría de Progreso Real Celery ↔ Frontend
- **Backend (`tasks.py`):** Define `progress_callback` que emite `self.update_state(state="PROGRESS", meta={...})` con el porcentaje real, bloque actual (`Bloque X de N`), rango de fechas, registros insertados y actualizados.
- **Frontend (`ScraperControl.jsx`):**
  - Prioriza `status.meta.progress` sobre la simulación artificial.
  - Muestra en la barra de progreso la fase actual (`status.meta.phase_desc`: ej. *Consultando bloque 3 de 11 (2026-03-01 al 2026-03-31)*).
  - Incluye un badge de telemetría en vivo con el bloque en proceso y contadores acumulados de órdenes insertadas y actualizadas en tiempo real.

### D. Poda Segura de Registros Huérfanos
- Se reemplazó el filtro `NOT LIKE 'OCAM-%'` por validación estricta de valores nulos o corruptos (`orden_electronica` o `nro_orden_fisica` nulos o vacíos), preservando órdenes físicas válidas.

---

## 3. Verificación y Resultados
- **Backend:** `backend/app/services/scraper.py` y `backend/app/worker/tasks.py` compilaron exitosamente con `py_compile`.
- **SQL Generado:** Sentencia `INSERT INTO purchase_orders ... ON CONFLICT DO UPDATE` validada contra dialecto PostgreSQL.
- **Frontend:** Compilación con Vite en `frontend/` exitosa en 928ms sin errores.
