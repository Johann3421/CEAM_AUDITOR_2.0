# 2026-10-15 — Unificación de Conteos en Filtro por Piezas (Ley de Tesler)

- **Fecha:** 2026-10-15
- **Tipo:** Refactor / UX / Bugfix
- **Estado:** Completado y Verificado en Producción
- **Módulos Afectados:** Backend (`proveedores.py`), Frontend (`FiltroPiezas.jsx`)

---

## 1. Contexto y Problema Detectado
En la vista de `/filtro-piezas` (`https://auditor.sekaitech.com.pe/filtro-piezas`):
- El badge de la categoría (ej. Workstations Torre) mostraba **8,835**.
- El total de productos en catálogo mostraba **3,339**.
- Al iniciar la extracción masiva se indicaban **5,936** fichas.
- Esta divergencia exponía la complejidad interna de la base de datos (filas de ofertas de proveedores vs fichas con PDF vs productos vigentes agrupados), violando directamente la **Ley de Tesler** y generando confusión en el usuario.

---

## 2. Decisiones de Arquitectura y Solución Aplicada
Toda la complejidad fue absorbida en el backend para que el frontend mantenga **un único número coherente y consistente** en todas las vistas:

1. **Backend (`get_categories_count` en `proveedores.py`):**
   - Agrupación por `group_key` (Nro. de parte normalizado o hash MD5 si es S/N).
   - Filtrado estricto de productos excluidos por Perú Compras (`UPPER(estado_ficha_producto) NOT LIKE 'EXCLU%'`).
   - `COUNT(DISTINCT group_key)` por categoría, alineándose 100% con los productos únicos que lista el catálogo.
   - Resultado para Workstations Torre: exactamente **3,339**.
   - Resultado para Workstations Portátiles: exactamente **196**.

2. **Backend (`extraer_specs_pdf_endpoint` y `_run_bulk_category_extraction` en `proveedores.py`):**
   - Extracción masiva ahora utiliza exactamente el mismo universo agrupado por `group_key` sin fichas excluidas.
   - Si un producto no cuenta con URL de PDF directa, el worker procesa sus especificaciones mediante `descripcion_fallback` de Perú Compras, garantizando que el 100% de los productos de la categoría queden analizados.

3. **Frontend (`FiltroPiezas.jsx`):**
   - Toolbar unificado en `Total en catálogo: {totalItems} productos` (eliminada la etiqueta ambigua de ofertas).
   - Menú de extracción, modales de confirmación y banners de progreso ahora reportan de forma simple y limpia: `Procesando {processed} de {total} productos ({percent}%)`.

---

## 3. Verificación
- Deploy automático en producción Dokploy verificado vía subagente de navegador y endpoints de API.
- Tab "⚡ Workstations Torre": **3,339**.
- Catálogo: **3,339 productos**.
- Coherencia total entre números.
