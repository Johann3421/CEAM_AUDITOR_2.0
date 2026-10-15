# Índice Principal — CEAM AUDITOR 2.0

Bóveda de conocimiento y memoria técnica persistente del sistema **CEAM AUDITOR 2.0**.

---

## Historial de Cambios y Sesiones
- [[notes/cambios/2026-10-15-unificacion-conteos-filtro-piezas-ley-tesler|2026-10-15 — Unificación de Conteos en Filtro por Piezas (Ley de Tesler)]]
- [[notes/cambios/2026-10-14-fix-separacion-workstations-torre-portatiles-y-extraccion-automatica|2026-10-14 — Separación Estricta de Workstations Torre vs Portátiles y Automatización de Extracción de Gráficas]]
- [[notes/cambios/2026-10-14-fix-extraccion-graficas-workstations-portatiles|2026-10-14 — Corrección de Extracción de Tarjetas Gráficas en Workstations Portátiles]]
- [[notes/cambios/2026-10-06-fix-psycopg-driver-database-celery-flower|2026-10-06 — Bugfix: Corrección de Driver PostgreSQL (psycopg / psycopg2) en Contenedores Celery, Flower y API]]
- [[notes/cambios/2026-10-05-api-b2b-integracion-kenya|2026-10-05 — Implementación de API B2B Server-to-Server e Integración con Ensamblador KENYA]]
- [[notes/cambios/2026-10-03-informe-arquitectura-modulos-ceam|2026-10-03 — Informe Técnico: Arquitectura de Módulos, Funcionalidades y Guía de Implementación Externa]]
- [[notes/cambios/2026-09-21-boton-copiar-caracteristicas-filtro-piezas|2026-09-21 — Botón de Copiar Características en Filtro por Piezas]]
- [[notes/cambios/2026-09-19-rango-fechas-ordenes|2026-09-19 — Visualización de Rango de Fechas de Extracción de Órdenes y Filtros de Fecha/Antigüedad]]

---

## Módulos y Arquitectura
- **Backend:** FastAPI, SQLAlchemy, PostgreSQL, Celery, Redis.
- **Frontend:** React + Vite, Axios, Lucide Icons, Vanilla CSS.
- **Producción:** Dokploy VPS, despliegue continuo vía rama `main`.
