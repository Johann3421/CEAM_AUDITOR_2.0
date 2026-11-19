# 2026-11-19 — Análisis Forense: Discrepancia de Fichas en Perú Compras, Dualidad de Plataformas y Normalización de Marca Rhinobox

- **Fecha:** 2026-11-19
- **Tipo:** Análisis Técnico / UX / Robustecimiento de Búsqueda
- **Estado:** Completado
- **Módulos Afectados:** `backend/app/api/endpoints/fichas.py`, `backend/app/api/endpoints/proveedores.py`

---

## 1. Contexto y Consulta del Usuario
Al finalizar la extracción del Módulo 2 (Fichas-producto) desde `https://auditor.sekaitech.com.pe/fichas`, el sistema reportó:
- Fichas procesadas: 23,176
- Fichas insertadas: 0
- Fichas actualizadas: 23,172

El usuario observó que "en ese catálogo hay más fichas" y señaló que "con la marca rinobox en nuestro sistema sale muchas menos fichas de los que hay en Perú Compras", solicitando una investigación a profundidad y un análisis realista.

---

## 2. Hallazgos de la Investigación Forense

### A. ¿Por qué 23,176 procesadas, 0 insertadas y 23,172 actualizadas?
1. **Conteo en Origen (Perú Compras):**
   - En el nuevo portal consultivo de Perú Compras (`https://buscadorcatalogos.perucompras.gob.pe/#`), la tarjeta oficial del acuerdo marco `EXT-CE-2022-5 COMPUTADORAS DE ESCRITORIO, COMPUTADORAS PORTATILES Y ESCANERES` indica textualmente:
     - `Fichas-producto: 23,176`
     - `Monto contratado total: S/ 1,125,409,611.89`
2. **Descarga Oficial:**
   - Al pulsar el botón oficial de descarga del catálogo ("aquí"), el servidor de Perú Compras genera un archivo Excel con exactamente **23,176 filas**.
3. **Deduplicación:**
   - Existen **4 números de parte duplicados** en el dataset oficial de Perú Compras, resultando en **23,172 fichas únicas**.
4. **Lógica de Base de Datos:**
   - La corrida previa ya había insertado las 23,172 fichas en `fichas_producto`.
   - La nueva corrida realizó un `ON CONFLICT DO UPDATE` (upsert), por lo que se actualizaron las 23,172 existentes e insertaron 0 nuevas. No hubo error alguno.

### B. ¿Por qué parecen existir más fichas en Perú Compras? (Dualidad de Plataformas)
Perú Compras mantiene **dos plataformas separadas** con distintos propósitos y alcances:

1. **Visor Público de Fichas-producto (`buscadorcatalogos.perucompras.gob.pe/#`):**
   - Muestra el aviso explícito: *"📢 Este visor muestra únicamente fichas-producto ofertadas y su contratación"*.
   - Alcance: Solo incluye fichas que cuentan con ofertas activas y contrataciones registradas en el acuerdo vigente.
   - Total para `EXT-CE-2022-5`: **23,176 fichas**.
   - Total para categoría Escritorio: **12,537 fichas**.

2. **Plataforma Transaccional de Catálogos Electrónicos (`catalogos.perucompras.gob.pe`):**
   - Es el portal interno donde los proveedores cotizan y gestionan ofertas (utilizado por el Módulo 1 en `proveedores_scraper.py`).
   - En la sección **Mejora Básica** (`_ListaProductosOfertados`), únicamente en la categoría Computadoras de Escritorio figuran **23,718 productos**. El catálogo completo supera los **35,000 ítems**.
   - **Razón:** Incluye fichas sin contratación histórica, fichas en borrador, suspendidas o provenientes de acuerdos marco previos que aún son cotizables por los proveedores admitidos.

### C. El caso de la marca RINOBOX / RHINOBOX
1. **Ortografía Oficial:**
   - La razón social y marca registrada en Perú Compras es **`RHINOBOX`** (con **`H`**).
2. **Cotejo de Cantidad de Fichas:**
   - En el Visor de Perú Compras (`buscadorcatalogos`): Al buscar `RHINOBOX`, arroja:
     > *"Se han encontrado 4,234 Fichas-producto"*
   - En nuestra base de datos (`fichas_producto`): Existen exactamente **4,234 fichas** de la marca `RHINOBOX`. El sistema tiene el 100.0% de las fichas de dicha marca presentes en el Visor oficial.
3. **Origen de la Discrepancia Percibida:**
   - **Búsqueda por texto con typo:** Si en nuestro buscador se escribía `rinobox` (sin H), la consulta `ILIKE '%rinobox%'` devolvía **0 resultados** porque en la BD está como `RHINOBOX`.
   - **Confusión de Módulos:** En `Filtro por Piezas` (`/filtro-piezas`), la vista consume `ofertas_proveedor_history` (Módulo 1). El proveedor *The King Computer* tiene ofertados **3,922** productos de Rhinobox, y *Jorge Rojas* tiene **0**. El usuario comparaba las ofertas de un proveedor específico (3,922) contra el catálogo general de Perú Compras (4,234).

---

## 3. Mejoras Implementadas (Ley de Tesler)
Para evitar que errores tipográficos o diferencias de módulos afecten la experiencia del usuario:
1. **Normalización Automática de Alias:**
   - En `backend/app/api/endpoints/fichas.py` y `backend/app/api/endpoints/proveedores.py`, cualquier búsqueda o filtro de marca con el valor `rinobox` se normaliza automáticamente en backend hacia `rhinobox`.
2. **Inclusión de Marca en Búsqueda General:**
   - Se añadió la columna `marca` dentro del conjunto de columnas analizadas por el parámetro `search` en `fichas.py`.
