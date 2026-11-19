# 2026-11-19 — Diagnóstico Forense y Auditoría Profunda del Scraper de Órdenes Públicas (/scraper)

- **Fecha:** 2026-11-19
- **Tipo:** Investigación / Auditoría Técnica / Performance & Reliability
- **Estado:** Diagnóstico Completado
- **Módulos Analizados:** `frontend/src/pages/ScraperControl.jsx`, `backend/app/services/scraper.py`, `backend/app/worker/tasks.py`, `backend/app/services/crud.py`, `backend/app/api/endpoints/scraper.py`

---

## 1. Contexto y Solicitud del Usuario
El usuario solicitó investigar a fondo si algo se dañó o rompió en la ruta `/scraper` (`https://auditor.sekaitech.com.pe/scraper`) al ejecutar la extracción de órdenes de compra públicas desde el portal de Perú Compras.

---

## 2. Hallazgos y Pruebas en Vivo contra el Portal de Perú Compras

Se ejecutaron pruebas controladas en vivo con Playwright contra el portal oficial `https://catalogos.perucompras.gob.pe/ConsultaOrdenesPub`:

| Componente del Portal | Estado Real | Comportamiento Observado |
| :--- | :---: | :--- |
| **URL y Servidor ASP.NET** | ✅ Funcional | HTTP 200, responde de inmediato. |
| **Select2 (`#cboAcuerdo`)** | ✅ Funcional | Acuerdo `EXT-CE-2022-5 COMPUTADORAS DE ESCRITORIO...` aparece vigente en la primera opción. |
| **Inputs Fecha (`#fechaInicial`, `#fechaFinal`)** | ✅ Funcional | Reciben valores vía `.fill("YYYY-MM-DD")` tras evento `focus` (cambia dinámicamente de `text` a `date`). |
| **Checkbox `#chkDetallado`** | ✅ Funcional | Se marca sin oposición y habilita la consulta completa. |
| **Botón `#btnBuscar`** | ✅ Funcional | Ejecuta la consulta ASP.NET y renderiza filas de datos (`tr.FilaDatos`). |
| **Descarga Excel (`#aExportarXLSX`)** | ✅ Funcional | Dispara descarga limpia. Se descargó con éxito archivo de **715 KB** con **88 órdenes** reales. |
| **Motor ETL (`_process_excel`)** | ✅ Funcional | Agrupa por orden base, parsea productos anidados en JSON, calcula precios unitarios sin errores. |

**Conclusión preliminar:** El portal de Perú Compras **NO** está roto ni cambió sus selectores ni bloqueó las descargas de órdenes.

---

## 3. Causas Raíz del Fallo y de la Sensación de Bloqueo en Producción

El fallo reportado en producción se origina en una combinación de arquitectura asíncrona ciega, consumo desbordado de memoria y cuello de botella de base de datos:

### A. Ceguera de Progreso y "Falso Bloqueo al 88%" en Frontend
1. En `ScraperControl.jsx`, el rango de fechas por defecto es desde el `01/01/2026` hasta la fecha actual (`19/11/2026`).
2. En `scraper.py`, `_split_date_range(..., max_days=30)` fragmenta ese rango en **11 chunks de 30 días**.
3. **El backend nunca reporta progreso intermedio a Celery:** `tasks.py` solo invoca `self.update_state(state="STARTED")` al principio y no vuelve a actualizar Celery durante el procesamiento de los 11 chunks.
4. El frontend simula el progreso con un timer artificial que alcanza el 88% en 40 segundos y se congela allí durante 15 a 25 minutos. El usuario asume que el sistema se murió o se dañó.

### B. Saturación de Memoria RAM (OOM) y Muerte del Celery Worker (Signal 15)
1. El bucle de chunks en `run_scrape_sync` lanza `_download_excel`, la cual abre un navegador Chromium completo de Playwright **11 veces consecutivas**.
2. En un VPS Dokploy (2GB a 4GB de RAM) con Celery ejecutando con concurrencia 2 (`--concurrency=2`), Chromium satura la memoria física.
3. El kernel Linux ejecuta el OOM-Killer o envía `SIGTERM (15)` al proceso de Celery (`15 detected, shutting down`), interrumpiendo abruptamente la tarea y provocando que Flower pierda visibilidad del worker (`Inspect method active_queues/stats failed`).

### C. Cuello de Botella Masivo de Base de Datos (Row-by-Row vs Batch Upsert)
1. Para cada orden descargada, el código ejecuta:
   - `get_order_by_electronica` (1 SELECT).
   - `crud.upsert_order`, que internamente ejecuta otro `get_order_by_electronica` (1 SELECT adicional).
   - `db.commit()` y `db.refresh(existing)` **por cada fila individualmente**.
2. En un lote de 2,000 órdenes por chunk, esto genera **8,000 operaciones SQL síncronas**. En 11 chunks son hasta **88,000 transacciones individuales**, ralentizando la tarea a niveles extremos.
3. *Nota:* En `fichas_scraper.py` y `proveedores_scraper.py` ya se había solucionado esto con `insert().on_conflict_do_update()` en batches de 500 registros, pero `scraper.py` quedó con el método legacy.

### D. Timeout Extremo de Descarga (600 Segundos = 10 Minutos)
- `page.expect_download(timeout=600000)`: si un chunk no tiene órdenes o la red fluctúa, la tarea se congela esperando 10 minutos antes de continuar al siguiente chunk.

### E. Poda Destructiva Huérfana
- Al final de la sincronización se ejecuta `~PurchaseOrder.orden_electronica.like("OCAM-%").delete()`, eliminando órdenes legítimas físicas o pre-digitalizadas que no tengan el prefijo exacto `OCAM-`.

---

## 4. Plan de Acción Recomendado

1. **Batch Upsert en Base de Datos:** Reemplazar el loop fila por fila con inserción en lotes de 500 registros mediante `insert(PurchaseOrder).on_conflict_do_update(...)` (igual que en Módulo 2).
2. **Reutilización de Instancia de Browser:** Mantener una única sesión de Chromium abierta durante los chunks en lugar de cerrarla y reabrirla 11 veces.
3. **Reporte de Progreso Real a Celery:** Pasar `self` o un callback a `run_scrape_sync` para emitir `update_state(state="PROGRESS", meta={"current_chunk": i, "total_chunks": n, "inserted": ins, "updated": upd})`.
4. **Reducción de Timeout:** Ajustar el timeout de espera de descarga a 45-60s y omitir descarga si `tr.FilaDatos` es 0.
5. **UI Informativa en Frontend:** Mostrar el chunk actual, rango de fechas en proceso y conteos acumulados en tiempo real.
