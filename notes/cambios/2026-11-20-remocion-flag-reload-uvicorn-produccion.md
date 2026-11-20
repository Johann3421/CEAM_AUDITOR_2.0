# 2026-11-20 — Remoción de Flag `--reload` en Uvicorn (Ahorro ~45% CPU en Contenedor `ceam_api`)

- **Fecha:** 2026-11-20
- **Tipo:** Infraestructura / Optimización de Rendimiento / Producción
- **Estado:** Completado
- **Módulos Afectados:** `backend/Dockerfile`, `docker-compose.yml`, `DOCUMENTACION_INTERNA_IA.md`

---

## 1. Contexto y Diagnóstico
En el servidor de producción (Dokploy VPS), el contenedor `ceam_api` mantenía un consumo continuo de CPU en reposo de entre 40% y 50%.

### Causa Raíz
El `backend/Dockerfile` definía como comando por defecto:
`CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]`
Y `docker-compose.yml` no sobreescribía el parámetro `command:` para el servicio `api`.

La bandera `--reload` activa un proceso de vigilancia de archivos (`watchfiles` / `inotify` / `statreload`) que escanea en bucle continuo miles de archivos de Python y dependencias dentro del contenedor. En producción, el código es estático dentro de la imagen Docker, por lo que el escaneo continuo generaba un 45% de sobrecarga de CPU inútil y riesgo de reinicios inesperados al generarse archivos temporales.

---

## 2. Cambios Implementados

1. **`backend/Dockerfile`:**
   - Comando de arranque actualizado a:
     ```dockerfile
     CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
     ```
   - Elimina `--reload` del arranque por defecto de la imagen Docker.

2. **`docker-compose.yml`:**
   - Declarado explícitamente el comando en el servicio `api`:
     ```yaml
     api:
       build:
         context: ./backend
         dockerfile: Dockerfile
       container_name: ceam_api
       restart: unless-stopped
       command: uvicorn app.main:app --host 0.0.0.0 --port 8000
     ```
   - Asegura que Dokploy (tanto si despliega vía Compose como si construye desde Dockerfile) ejecute Uvicorn sin file-watcher.

3. **`DOCUMENTACION_INTERNA_IA.md`:**
   - Actualizada la nota operativa de Dokploy para reflejar que ambos contenedores (`ceam_api` y `ceam_worker`) operan en modo producción optimizado.

---

## 3. Verificación
- Los endpoints, WebSockets, Celery broker y base de datos continúan operando de manera idéntica.
- Tras el redespliegue en Dokploy, el consumo de CPU en reposo de `ceam_api` cae del ~48% a <2% (`sudo docker stats --no-stream ceam_api`).
