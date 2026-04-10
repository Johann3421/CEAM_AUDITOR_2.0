# 🛡️ CEAM AUDITOR 2.0

Dashboard inteligente y extractor de datos avanzado para auditar órdenes de compra de **Perú Compras**. Sistema automatizado con extracción mediante Playwright, procesamiento asíncrono con Celery y visualización premium en React.

---

## 🚀 Tecnologías
- **Backend**: FastAPI, SQLAlchemy, PostgreSQL.
- **Worker**: Celery, Redis, Playwright (Scraper).
- **Frontend**: React 19 (Vite), Recharts, Lucide Icons, Glassmorphism CSS.
- **Despliegue**: Docker, Docker Compose, Dokploy.

---

## 🛠️ Configuración Local

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Johann3421/CEAM_AUDITOR_2.0.git
   cd CEAM_AUDITOR_2.0
   ```

2. **Variables de Entorno:**
   Copia el archivo de ejemplo y ajusta si es necesario:
   ```bash
   cp backend/.env.example backend/.env
   ```

3. **Levantar con Docker (Localmente):**
   ```bash
   docker-compose --env-file ./backend/.env up --build
   ```
   - **Frontend**: http://localhost:3087
   - **API/Docs**: http://localhost:8087/docs
   - **Flower (Monitor Celery)**: http://localhost:5587

---

## 🚢 Despliegue en Dokploy (Paso a Paso)

Para evitar colisiones de puertos con otros proyectos en tu servidor, **hemos modificado los puertos base expuestos hacia el host (ej. 8087, 3087, 5487, etc.).** 

Sigue estas instrucciones detalladas para desplegar y enlazar tus dominios:

### 1. Crear el Proyecto y el Servicio Compose
1. En el panel de Dokploy, ve a **Projects** -> **Create Project** (nómbralo `CEAM-AUDITOR`).
2. Entra al proyecto y da clic en **Create Service** -> selecciona **Compose**.
3. En **Source**, selecciona **GitHub** y busca `Johann3421/CEAM_AUDITOR_2.0`. 
4. Rama: `main`.

### 2. Configurar Variables de Entorno
Ve a la pestaña **Environment** de tu servicio Compose recién creado y añade:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@db:5432/ceam_auditor` *(Usa puerto interno 5432, Docker maneja la resolución por nombre `db`)* |
| `CELERY_BROKER_URL` | `redis://redis:6379/0` |
| `CELERY_RESULT_BACKEND` | `redis://redis:6379/0` |
| `PROJECT_NAME` | `CEAM AUDITOR PRO` |
| `VITE_API_URL` | **`https://api.tudominio.com/api/v1`** *(Esto es vital para que tu frontend envíe peticiones al backend a través de la web)* |

### 3. Lanzar Despliegue
Haz clic en **Deploy**. Dokploy empezará a compilar e iniciar todos los servicios y los amarrará a los puertos expuestos de forma interna: `8087` (Backend), `3087` (Frontend) y `5587` (Flower).

### 4. Configurar los Dominios (Redirección de Tráfico)
Dokploy necesita saber qué dominio apunta a qué puerto local. Como este es un entorno `docker-compose`, la forma más sencilla es crear "Dominios" o "Redirecciones" ("Traefik" / "Domains") en Dokploy:

1. **Ruta del Frontend (React)**:
   - Configura un dominio (ej. `auditor.tudominio.com`).
   - Apúntalo internamente al **Puerto Local del Servidor: `3087`**.
   - Habilita SSL (Let's Encrypt).
2. **Ruta de la API (Backend)**:
   - Configura otro dominio o subdominio (ej. `api.tudominio.com`).
   - Apúntalo internamente al **Puerto Local del Servidor: `8087`**.
   - Habilita SSL. *(Este es el mismo dominio que debes poner en la variable `VITE_API_URL`)*.
3. *(Opcional)* **Ruta de Monitor de Tareas (Flower)**:
   - Configura (ej. `celery.tudominio.com`).
   - Apúntalo al **Puerto Local: `5587`**.

---

## 📊 Módulos Principales
- **Dashboard**: Vista general con KPIs de montos adjudicados y distribución por catálogo.
- **Órdenes**: Tabla interactiva con filtros avanzados y enlaces directos a los certificados PDF originales.
- **Scraper**: Panel de control para lanzar extracciones manuales, definir límites de páginas y monitorear el estado de las tareas asíncronas.

---
© 2026 CEAM Auditor Team
