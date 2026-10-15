# 2026-10-14 — Separación Estricta de Workstations Torre vs Portátiles y Automatización de Extracción de Gráficas

- **Fecha:** 2026-10-14
- **Tipo:** Bugfix / Arquitectura / UX
- **Estado:** Completado y Verificado en Producción

---

## 1. Contexto y Problemas Detectados
1. **Mezcla de categorías:**
   - En la vista de Filtro por Piezas, la pestaña **Workstations Torre** (`categoria = 'workstation'`) mostraba 196 estaciones de trabajo portátiles (ej. ThinkPad P16s, P14s, ZBook) debido a que la condición SQL buscaba `UPPER(categoria) LIKE '%ESTACION DE TRABAJO%'` sin excluir tokens portátiles. Dado que las portátiles están registradas como `'ESTACION DE TRABAJO PORTATIL'`, aparecían mezcladas.
2. **Extracción manual ficha por ficha obligatoria:**
   - La extracción masiva por categoría saltaba las fichas que ya tuvieran registros previos o estuvieran sin forzar (`forzar = False`), impidiendo actualizar las especificaciones y gráficas de las fichas ya registradas.
   - La caché TTL en memoria de `dynamic_filters.py` (300s) no se invalidaba tras la extracción, provocando que los dropdowns de "Tarjeta Gráfica" figuraran vacíos aun después de haberse procesado las fichas.
   - El botón principal de extracción en la interfaz operaba a nivel de página sin parámetro `forzar: true`.

---

## 2. Solución Implementada

### A. Backend (`backend/app/api/endpoints/proveedores.py` & `backend/app/services/dynamic_filters.py`)
1. **Exclusión mutua estricta de categorías:**
   - En `get_fichas` y `categories_count`: `workstation` ahora excluye estrictamente `NOT LIKE '%PORTATIL%'`, `NOT LIKE '%PORTÁTIL%'` y `NOT LIKE '%LAPTOP%'` en `categoria` y `descripcion_producto`.
   - `workstation_portatil` exige explícitamente tokens portátiles.
   - Sincronizado en las consultas dinámicas de `dynamic_filters.py` y en los alias de `extraer_specs_pdf_endpoint`.
2. **Invalidación reactiva de caché:**
   - Se implementó `invalidar_cache_filtros()` en `dynamic_filters.py`.
   - Se invoca automáticamente tras commits de extracción por lote (`batch >= 10`), lote de ítems de página (`req.items`) y ficha individual, garantizando que el endpoint `/proveedores/filter-options` refresque instantáneamente las opciones de GPU disponibles.

### B. Frontend (`frontend/src/pages/FiltroPiezas.jsx` & `frontend/src/utils/specsParser.js`)
1. **Etiquetado claro de Form Factor:**
   - `specsParser.js` ahora asigna explícitamente `'Workstation Torre'` o `'Workstation Portátil'` según el análisis de categoría y descripción.
2. **Extracción y actualización automática y forzada:**
   - `handleExtraerCategoria(true)`: envía por defecto `forzar: true` para sobreescribir y actualizar todas las fichas oficiales y sus GPUs.
   - `handleExtraerSpecsPage` y `handleExtraerIndividual`: configurados con `forzar: true` y disparan `reloadFilterOptions()` de inmediato al terminar.
   - El polling de fondo invoca `reloadFilterOptions()` al completarse la tarea de extracción.

---

## 3. Verificación en Producción (`https://auditor.sekaitech.com.pe/filtro-piezas`)
1. **Separación estricta de productos:**
   - **Workstations Torre:** 3,339 fichas (0 portátiles, 100% torres de escritorio, HP Z2, Vastec Threadripper, etc.).
   - **Workstations Portátiles:** 196 fichas (100% laptops ThinkPad P-series, ZBook, etc.).
2. **Extracción masiva y persistencia de GPUs:**
   - Las fichas de Workstations Torre se enriquecieron automáticamente con sus especificaciones de tarjeta gráfica (ej. `12 GB de memoria gráfica`, `Tarjeta de Video Profesional de 20 GB con ECC`, etc.).
   - El dropdown de filtro dinámico **Tarjeta Gráfica** para Workstations Torre ahora cuenta con **16 opciones detectadas** (`Dedicada 12 GB`, `Dedicada 16 GB`, `Dedicada 20 GB`, `Dedicada 24 GB`, `Dedicada 32 GB`, `Dedicada 4 GB`, `Dedicada 48 GB`, `Dedicada 8 GB`, etc.).
3. **Validación visual automatizada:**
   - Subagente de navegador validó ambas pestañas sin inconsistencias visuales ni cruces de equipos.

---

## 4. Archivos Modificados
- `backend/app/api/endpoints/proveedores.py`
- `backend/app/services/dynamic_filters.py`
- `frontend/src/pages/FiltroPiezas.jsx`
- `frontend/src/utils/specsParser.js`
