# 2026-11-19 — Implementación de KPIs Financieros (Monto Contratado, Cant. OCAM), Ordenamiento Inteligente y Modal de Detalles de Fichas

- **Fecha:** 2026-11-19
- **Tipo:** Feature / UX / Inteligencia de Negocio
- **Estado:** Completado
- **Módulos Afectados:** `frontend/src/components/fichas/FichaDetailModal.jsx`, `frontend/src/components/fichas/FichasTable.jsx`, `frontend/src/pages/Fichas.jsx`

---

## 1. Contexto y Objetivo
Tras el análisis forense de las nuevas capacidades del Visor de Fichas-producto de Perú Compras, se identificó que nuestra base de datos ya almacenaba `monto_contratado` y `cant_ocam`, pero el frontend no los exponía visualmente ni permitía ordenar por volumen de ventas, careciendo además de una vista modal con estadísticas de contratación y especificaciones desglosadas.

El objetivo fue cerrar la brecha con Perú Compras e implementar:
1. Visualización de `Monto Contratado (S/)` y `Cant. OCAM` en la tabla principal.
2. Ordenamiento inteligente (Mayor Monto Contratado, Más Vendidas OCAM, Más Recientes).
3. Modal interactivo de Detalle de Ficha (`FichaDetailModal.jsx`) con KPIs de contratación, foto en alta resolución, desglose técnico estructurado en lista clave-valor y botón de copiado de especificaciones técnicas para cotización en 1 clic.

---

## 2. Cambios Implementados

### A. Componente `FichaDetailModal.jsx` (`frontend/src/components/fichas/FichaDetailModal.jsx`)
- Diseñado bajo lineamientos antislop y no-IA (colores sobrios, sin gradientes cliché, bordes limpios y tipografía clara).
- **Cards de KPIs de Contratación:**
  - Monto Contratado Total (formato soles `S/ XX,XXX.XX`).
  - Cantidad de Órdenes de Compra formalizadas (`X órdenes OCAM`).
  - Rango de precios y mediana si la ficha cuenta con órdenes históricas.
- **Desglose Técnico Clave-Valor (`parseDescriptionFeatures`):**
  - Parsea automáticamente la descripción estándar de Perú Compras en pares estructurados (Procesador, RAM, Almacenamiento, Puertos HDMI/VGA/USB, Red LAN/WLAN, Garantía comercial, Sistema Operativo, Ofimática, RAEE).
- **Herramienta para Cotizadores:**
  - Botón "Copiar para Cotizador" que formatea la ficha completa al portapapeles.
  - Enlace directo a la Ficha Técnica Oficial (PDF en Azure CDN de Perú Compras).
  - Previsualización del producto.

### B. Tabla de Fichas Mejorada (`frontend/src/components/fichas/FichasTable.jsx`)
- Nuevas columnas visibles:
  - `Monto Contratado`: Muestra el acumulado formal contratado por el Estado con formateo regional `es-PE`.
  - `OCAM`: Conteo de órdenes con badge distintivo.
- Cabeceras interactivas con iconos de ordenamiento bidireccional (`ArrowUp`, `ArrowDown`, `ArrowUpDown`).
- Botón "Detalles" por fila y enlace interactivo sobre el número de parte.

### C. Barra de Herramientas y Control de Fichas (`frontend/src/pages/Fichas.jsx`)
- Selector rápido de ordenamiento:
  - 💰 Mayor Monto Contratado (por defecto)
  - 📦 Más Vendidas (OCAM)
  - 🕒 Más Recientes
  - 📅 Más Antiguas
  - 🏷️ Marca (A-Z)
- Integración completa con el modal `selectedFicha` y paso de parámetros `sort_by` y `sort_dir` hacia la API FastAPI.

---

## 3. Próximos Pasos
- Desplegar cambios en producción mediante git commit y push a `origin/main`.
- Validar visualización en vivo en `https://auditor.sekaitech.com.pe/fichas-catalogo`.
