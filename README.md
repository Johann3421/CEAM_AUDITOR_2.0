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

3. **Levantar con Docker:**
   ```bash
   docker-compose up --build
   ```
   - **Frontend**: http://localhost:3000
   - **API/Docs**: http://localhost:8000/docs
   - **Flower (Monitor Celery)**: http://localhost:5555

---

## 🚢 Despliegue en Dokploy (Paso a Paso)

Sigue estas instrucciones para desplegar todo el sistema en tu servidor:

### 1. Crear el Proyecto
- Entra a tu panel de Dokploy.
- Haz clic en **"Create Project"** y nómbralo `CEAM-AUDITOR`.

### 2. Configurar el Servicio (Docker Compose)
- Dentro del proyecto, haz clic en **"Create Service"** -> **"Compose"**.
- En **"Source"**, selecciona **GitHub** y conecta este repositorio: `Johann3421/CEAM_AUDITOR_2.0`.
- En **"Branch"**, escribe `main`.

### 3. Configurar Variables de Entorno (IMPORTANTE)
Ve a la pestaña **"Environment"** del servicio en Dokploy y añade estas variables:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@db:5432/ceam_auditor` |
| `CELERY_BROKER_URL` | `redis://redis:6379/0` |
| `CELERY_RESULT_BACKEND` | `redis://redis:6379/0` |
| `PROJECT_NAME` | `CEAM AUDITOR PRO` |
| `VITE_API_URL` | `https://tu-api.dominio.com/api/v1` (O la IP de tu servidor) |

### 4. Lanzar Despliegue
- Haz clic en **"Deploy"**.
- Dokploy leerá el archivo `docker-compose.yml`, construirá las imágenes del Backend y Frontend, y levantará Postgres y Redis automáticamente.

---

## 📊 Módulos Principales
- **Dashboard**: Vista general con KPIs de montos adjudicados y distribución por catálogo.
- **Órdenes**: Tabla interactiva con filtros avanzados y enlaces directos a los certificados PDF originales.
- **Scraper**: Panel de control para lanzar extracciones manuales, definir límites de páginas y monitorear el estado de las tareas asíncronas.

---
© 2026 CEAM Auditor Team
