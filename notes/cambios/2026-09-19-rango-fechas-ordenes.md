# Cambio: Visualización de Rango de Fechas de Extracción de Órdenes y Filtros de Fecha/Antigüedad

- **Fecha:** 2026-09-19
- **Tipo:** Feature / Bugfix / UX
- **Estado:** Completado

---

## Contexto y Objetivo
El usuario solicitó:
1. Agregar en la interfaz el rango de fechas en que se extrajeron las órdenes de compra.
2. Identificar y aplicar mejoras funcionales y de experiencia de usuario en las vistas principales (`Precios por Fichas`, `Órdenes de Compra` y `Dashboard`).

---

## Diagnóstico y Hallazgos
1. **Rango Real de Fechas:**
   - Órdenes de Compra (`purchase_orders`): `2022-12-28` al `2026-09-01` (134,208 órdenes extraídas).
   - Precios vinculados a fichas (`fichas_producto`): `2023-03-20` al `2026-09-01`.
2. **Bug Crítico en `crud.get_stats`:**
   - La comparación entre `last_fichas_update` (`datetime.datetime`) y `last_orders_update` (`datetime.date`) producía un `TypeError` no controlado silenciado por `except Exception: pass`, provocando que `last_update` devolviera `None` en el Dashboard (`Fecha de Actualización: —`).
3. **Carencia de Filtros Temporales:**
   - `Orders.jsx` no admitía filtrado por rango de fechas (`Desde` y `Hasta`).
   - `PreciosFichas.jsx` mostraba badges de antigüedad individuales por ficha pero carecía de selector de filtro por antigüedad y no mostraba el período global de las órdenes evaluadas.

---

## Archivos Modificados
- `backend/app/services/crud.py`:
  - Cálculo de `fecha_orden_min` y `fecha_orden_max` en `get_stats`.
  - Normalización y comparación segura de tipos de fecha para `last_update`.
  - Parámetros `fecha_inicio` y `fecha_fin` en `get_orders` y `count_orders_filtered`.
- `backend/app/api/endpoints/purchase_orders.py`:
  - Exposición de `fecha_inicio` y `fecha_fin` en `/`, `/summary` y `/export-excel`.
  - Inclusión del rango de fechas en el nombre del archivo Excel generado.
- `backend/app/api/endpoints/fichas.py`:
  - Retorno de `rango_ordenes` y `rango_fichas_precios` en `/precio-stats`.
  - Filtros `antiguedad`, `fecha_orden_desde` y `fecha_orden_hasta` en `_build_fichas_where`, aplicados a `/`, `/summary` y `/export-json`.
  - Cálculo de `rango_fechas` en `/summary` para el conjunto filtrado.
- `frontend/src/pages/PreciosFichas.jsx`:
  - Banner destacado con el rango de extracción global (`28/12/2022 — 01/09/2026`) y el rango de compras vinculadas a precios.
  - Filtro desplegable por antigüedad: `Todas`, `Recientes (≤ 3 meses)`, `Último año (≤ 12 meses)`, `Antiguas (> 1 año)`.
  - Barra de chips para filtros activos con opción de limpiar todo.
- `frontend/src/pages/Orders.jsx`:
  - Badge de período de órdenes extraídas en el encabezado (`28/12/2022 al 01/09/2026`).
  - Inputs de fecha `Desde` y `Hasta` en la barra de herramientas.
  - Chip de filtro activo para fechas y persistencia en la exportación Excel.
- `frontend/src/pages/Dashboard.jsx`:
  - Reparación de `Fecha de Actualización` con función de formato segura `fmt`.
  - Indicador de período de órdenes extraídas en el rótulo de la sección de Órdenes de Compra.

---

## Decisiones de Arquitectura
- **Ley de Tesler:** El filtrado por fechas se ejecuta a nivel de base de datos con `func.coalesce(fecha_publicacion, fecha_aceptacion)`, asegurando latencias mínimas sin saturar al navegador.
- **YAGNI & Ponytail:** Reutilización de columnas existentes (`fecha_orden_min`, `fecha_orden_max`, `precio_actualizado_at`) sin crear tablas auxiliares ni dependencias pesadas.
- **UI Limpia y Profesional:** Sin gradientes cliché de IA ni emojis dominantes; uso de chips semánticos discretos con la paleta neutra institucional del cotizador.

---

## Próximos Pasos
- Desplegar en producción mediante commit y push a la rama `main` (Dokploy auto-deploy).
- Monitorear logs de producción para validar la actualización de KPIs.
