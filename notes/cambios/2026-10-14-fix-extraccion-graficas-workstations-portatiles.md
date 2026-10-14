# 2026-10-14 — Corrección de Extracción de Tarjetas Gráficas en Workstations Portátiles

- **Fecha:** 2026-10-14
- **Tipo:** Bugfix / Mejora de Extracción y Normalización
- **Estado:** Completado y Verificado

---

## 1. Contexto y Problema Detectado
En la vista de Precios Fichas y Filtro por Piezas, las **Workstations Portátiles** (ej. Lenovo ThinkPad P16s, P16v, P14s, HP ZBook) figuraban con gráficos integrados o sin especificaciones extraídas (`specs_pdf: null`).

### Causas Raíz Identificadas:
1. **Fallo en Extracción Masiva (`proveedores.py`):**
   - El endpoint `/extraer-specs-pdf` recibe `categoria: "workstation_portatil"`.
   - No contaba con una cláusula `elif` para dicha categoría, cayendo en el `else` con `UPPER(categoria) LIKE '%WORKSTATION_PORTATIL%'`.
   - En la base de datos de Perú Compras, la categoría exacta es `'ESTACION DE TRABAJO PORTATIL'`, por lo que la consulta devolvía 0 registros y nunca procesaba ninguna ficha de workstation portátil.
2. **Asunción forzada en Frontend (`specsParser.js`):**
   - Al estar `specs_pdf` en `null` y no encontrar etiquetas como `VIDEO: DEDICADO`, el frontend asignaba por defecto `gpuTipo = 'Integrada'` y `gpuResumen = 'Gráficos Integrados'`, catalogando erróneamente todas las estaciones de trabajo como integradas.
3. **Omisión de términos técnicos en `pdf_extractor.py`:**
   - En fichas de Lenovo y HP vienen términos masculinos como `"Discretos, 8 GB GDDR7"` o `"Discreto"`. El normalizador solo buscaba la variante femenina `"DISCRETA"`.
   - Faltaban tokens en `TOKENS_PC_ORDENADOS` como `'Gráficos Discretos'`, `'Controlador Gráfico'`, etc.
   - En `fallback_descripcion`, solo se consideraba `VIDEO: DEDICADO` o marcas como `NVIDIA`/`RTX`, ignorando descripciones con `VIDEO: DISCRETOS...` o `VIDEO: INTEGRADO`.
4. **Normalización restrictiva en `dynamic_filters.py`:**
   - `normalizar_tarjeta_video()` eliminaba palabras como `"Integrados"` y `"Discretos"` devolviendo string vacío `""`, lo que impedía mapear los filtros dinámicos y filtrar por esas piezas en el dropdown.

---

## 2. Archivos Modificados
- `backend/app/api/endpoints/proveedores.py`:
  - Se añadieron ramas explícitas para `workstation_portatil` y `workstation` en el endpoint `/extraer-specs-pdf` asegurando la captura de las 196+ fichas técnicas con PDF.
- `backend/app/services/pdf_extractor.py`:
  - Se agregaron tokens en `TOKENS_PC_ORDENADOS` (`Gráficos Discretos`, `Controlador Gráfico`, etc.).
  - Normalización robusta para GPU dedicada: soporte para `DISCRET`, `GDDR5/6/7`, `VRAM`, etc.
  - Enriquecimiento de GPU integrada con el procesador (ej. Intel Arc Graphics para Core Ultra, Iris Xe para Core i5/i7, AMD Radeon para Ryzen).
  - Enlace de fallback en `extraer_especificaciones_pdf` si falta `graficos`.
- `backend/app/services/dynamic_filters.py`:
  - Se actualizó `normalizar_tarjeta_video` para reconocer `Gráficos Integrados`, `Gráficos Dedicados`, `Intel Arc Graphics`, GPU de Workstations (`RTX Ada`, `RTX Ax00`, `NVIDIA T-series`, `Quadro`) y memorias `GDDR6/GDDR7`.
- `frontend/src/utils/specsParser.js`:
  - Se actualizó la expresión regular de tarjetas dedicadas incluyendo `DISCRET`, `GDDR`, `QUADRO`, `ADA`.
  - Se enriqueció la visualización de GPUs integradas en base a la familia del procesador.
  - Se evitó clasificar como integradas las workstations portátiles pendientes de procesamiento.

---

## 3. Pruebas y Verificación
- Prueba en 30 PDFs reales de Workstations de Lenovo y HP:
  - 25 dedicadas detectadas exitosamente (ej. Discretos 8 GB GDDR7, NVIDIA 16 GB GDDR6, Discretos 6 GB).
  - 5 integradas con Core Ultra 9 / Ultra 7 enriquecidas adecuadamente a Intel Arc Graphics.
  - 0 errores de extracción.
- Compilación de Python validada con `py_compile` (0 errores).
- Build de Frontend completado con Vite (`npm run build` exitoso).

---

## 4. Próximos Pasos
- Ejecutar la extracción masiva de Workstations Portátiles desde la UI o endpoint `/extraer-specs-pdf`.
