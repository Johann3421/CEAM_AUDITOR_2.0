# Informe Técnico: Arquitectura de Módulos, Funcionalidades y Guía de Implementación Externa

- **Fecha:** 2026-10-03
- **Tipo:** Documentación / Arquitectura / Guía de Integración
- **Estado:** Completado

---

## 1. Resumen Ejecutivo
**CEAM AUDITOR 2.0** es una plataforma integral de inteligencia de mercado, auditoría y cotización para compras públicas peruanas (Perú Compras). Permite:
1. Extraer masivamente el catálogo oficial de fichas-producto y órdenes de compra adjudicadas (OCAMs).
2. Cruzar transacciones reales con productos para calcular precios mínimos históricos y recientes.
3. Desglosar especificaciones técnicas a nivel de componentes (CPU, RAM, Disco, Puertos, Garantía).
4. Monitorear a proveedores competidores (precios, stock regional y plazos de entrega).

---

## 2. Mapa Exhaustivo de Apartados / Módulos

| Apartado | Rutas (Frontend / Backend) | Propósito Principal | Datos y Tablas Manejadas |
|---|---|---|---|
| **Dashboard** | `/` <br> `GET /purchase-orders/stats` <br> `GET /fichas/precio-stats` | Vista gerencial de KPIs globales: volumen transaccionado (PEN/USD), total de órdenes, cobertura de precios, top proveedores y top entidades compradoras. | Agregaciones de `purchase_orders` y `fichas_producto`. |
| **Extraer Fichas** | `/fichas` (`FichasControl.jsx`) <br> `/scraper/fichas/start` | Orquestación del scraping del catálogo oficial de fichas técnicas desde el portal de Perú Compras vía tareas Celery asíncronas. | Ingesta y upsert en `fichas_producto`. |
| **Extraer Órdenes** | `/scraper` (`ScraperControl.jsx`) <br> `/scraper/start` | Orquestación del scraping de órdenes de compra públicas (OCAM) por rangos de fechas y acuerdos marco. | Ingesta masiva en `purchase_orders`. |
| **Ficha Producto** | `/fichas-catalogo` (`Fichas.jsx`) <br> `/fichas/` | Catálogo maestro de productos oficiales. Búsqueda por número de parte, marca, descripción y enlace a PDF oficial. | `fichas_producto`. |
| **Precio por Ficha** | `/precios-fichas` (`PreciosFichas.jsx`) <br> `/fichas/enrich-precios` | Inteligencia de precios: cruce automático entre órdenes y catálogo para determinar el mejor precio de venta del Estado, antigüedad y OCAM de referencia. | `fichas_producto` (campos `min_precio`, `orden_min`, `fecha_orden_min`). |
| **Órdenes de Compra** | `/orders` (`Orders.jsx`) <br> `/purchase-orders/` | Auditoría forense de +134,000 órdenes de compra emitidas por el Estado. Búsqueda multi-filtro y exportación Excel. | `purchase_orders`. |
| **Filtro por Piezas** | `/filtro-piezas` (`FiltroPiezas.jsx`) <br> `/proveedores/fichas` <br> `/proveedores/extraer-specs-pdf` | Buscador técnico granular de hardware (CPU, Gen, RAM, Disco SSD/HDD, Puertos, Pantalla). Extracción de specs desde PDFs y copiado rápido. | `fichas_producto`, parsing canónico (`specsParser.js`) y `specs_pdf`. |
| **Filtro por Proveedores** | `/proveedores-fichas` (`ProveedorFichas.jsx`) <br> `/proveedores/fichas` | Matriz competitiva de ofertas entre proveedores. Compara precios ofertados, stock disponible por región y plazos de entrega en días. | `ofertas_proveedor_history` + `fichas_producto`. |

---

## 3. Estrategias de Implementación en Otro Sistema

### Estrategia A: Arquitectura API / Microservicio (Recomendada)
- Mantener CEAM AUDITOR como un microservicio autónomo en su VPS.
- El sistema receptor (Cotizador web, CRM o ERP) consume la API REST de CEAM:
  1. Al cotizar un ítem, consulta `GET /api/v1/fichas/?search={nro_parte}` para autocompletar especificaciones oficiales.
  2. Consulta `GET /api/v1/fichas/precio-stats` o los campos de precio de la ficha para mostrar el precio de mercado referencial.
  3. Consulta `GET /api/v1/proveedores/fichas` para sugerir el proveedor más conveniente según plazo y stock.

### Estrategia B: Integración a Nivel de Base de Datos (ETL / Replicación)
- Sincronizar las 3 tablas troncales hacia la base de datos del otro sistema:
  1. `fichas_producto`: Catálogo central de bienes homologados con especificaciones.
  2. `purchase_orders`: Registro histórico de compras públicas.
  3. `ofertas_proveedor_history`: Registro de ofertas, stock y tiempos de entrega de la competencia.

### Estrategia C: Componentes Embebidos
- Modularizar los componentes React `FiltroPiezas` o `PreciosFichas` para montarlos en un portal de cotización existente, compartiendo el token/baseURL del API.
