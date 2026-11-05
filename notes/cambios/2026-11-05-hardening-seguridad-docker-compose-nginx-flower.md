# 2026-11-05 — Hardening de Seguridad en Docker Compose, Nginx y Flower

- **Fecha:** 2026-11-05
- **Tipo:** Security / DevOps / Hardening
- **Estado:** Completado
- **Módulos Afectados:** `docker-compose.yml`, `frontend/Dockerfile`, `frontend/nginx.conf`

---

## 1. Contexto y Problema Detectado
Al auditar los logs del proyecto en producción (`ceam_flower`, `ceam_frontend`, `ceam_api`, `ceam_db`), se identificaron escaneos constantes de bots externos aprovechando brechas en la configuración por defecto:
1. **PostgreSQL y Redis expuestos al público:** Los puertos `5487:5432` y `6387:6379` enlazaban a `0.0.0.0`, permitiendo que bots (Shodan, Censys) enviaran paquetes inválidos (`unsupported frontend protocol 0.0 / 255.255`).
2. **Flower sin autenticación:** Solicitudes como `GET /worker/.env` y ataques de Local File Inclusion (`GET /static/../../proc/self/environ`) llegaban a Flower sin pedir credenciales.
3. **Frontend Nginx devolviendo 200 a escaneos:** La directiva `try_files $uri $uri/ /index.html` servía el `index.html` de la SPA con código `HTTP 200` ante peticiones de `/.env`, `/.git/config`, `/wp-login.php`, etc.

---

## 2. Soluciones Implementadas

### A. Aislamiento de Puertos (`docker-compose.yml`)
- Se enlazaron los puertos de la base de datos y Redis exclusivamente a la interfaz local (`127.0.0.1:5487:5432` y `127.0.0.1:6387:6379`).
- La comunicación interna entre contenedores (`api`, `worker`, `db`, `redis`) continúa intacta por la red interna de Docker.

### B. Autenticación en Flower (`docker-compose.yml`)
- Se agregó Basic Auth obligatorio con flag `--basic_auth=${FLOWER_BASIC_AUTH:-admin:CeamAuditor2026!}` y variable de entorno `FLOWER_BASIC_AUTH`.
- Se vinculó el puerto a `127.0.0.1:5587:5555`.

### C. Hardening en Nginx (`frontend/nginx.conf` y `frontend/Dockerfile`)
- Se creó una configuración de Nginx dedicada que:
  - Rechaza con `404 Not Found` inmediato cualquier archivo o carpeta oculta (`/\.(?!well-known)`), protegiendo `/.env`, `/.git`, etc.
  - Bloquea extensiones de exploits (`.php`, `.aspx`, `.sql`, `.bak`, `.conf`, `.env`).
  - Bloquea rutas típicas de CMS (`/wp-admin`, `/wp-login`, `/_ignition`, `/phpmyadmin`).
  - Responde con `404` real si un asset estático hash no existe (`try_files $uri =404;` en `/assets/`), evitando que se descargue HTML como JS/CSS.

---

## 3. Próximos Pasos
- Despliegue en Dokploy mediante push a `main`.
- Opcionalmente configurar en Dokploy la variable `FLOWER_BASIC_AUTH` con credenciales personalizadas si se desea cambiar las predeterminadas.
