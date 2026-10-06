# Bugfix: Corrección de Driver PostgreSQL (psycopg / psycopg2) en Contenedores Celery, Flower y API

- **Fecha:** 2026-10-06
- **Tipo:** Bugfix / DevOps / Database
- **Estado:** Completado

---

## Causa Raíz
En el despliegue reciente en Dokploy/VPS, los contenedores `ceam_worker` y `ceam_flower` (así como la API en caso de reinicio) fallaban al inicializar con el siguiente traceback:
```text
File "/app/app/worker/tasks.py", line 6, in <module>
    from app.db.database import SessionLocal
File "/app/app/db/database.py", line 5, in <module>
    engine = create_engine(settings.DATABASE_URL)
...
File "/usr/local/lib/python3.11/site-packages/sqlalchemy/dialects/postgresql/psycopg.py", line 497, in import_dbapi
    import psycopg
ModuleNotFoundError: No module named 'psycopg'
```
**Diagnóstico:**
1. La variable de entorno `DATABASE_URL` configurada en Dokploy contenía el esquema `postgresql+psycopg://` (driver psycopg v3 de SQLAlchemy 2.0).
2. Sin embargo, en `backend/requirements.txt` solo estaba especificado `psycopg2-binary>=2.9.9` (psycopg v2), por lo que el módulo `psycopg` no existía dentro de la imagen Docker de Python 3.11.
3. Esto ocasionaba un bucle de fallos (*crash loop*) al importar `app.db.database` tanto en el worker como en flower y api.

---

## Solución Aplicada
1. **`backend/requirements.txt`**:
   - Agregada la dependencia oficial `psycopg[binary]>=3.1.18` para soportar de forma nativa el dialecto `postgresql+psycopg://` en SQLAlchemy 2.0.
2. **`backend/app/db/database.py`**:
   - Implementada la función de normalización y fallback automático `_normalize_db_url(raw_url)`.
   - Si la URL especifica `postgresql+psycopg://` y no se encuentra el módulo `psycopg`, degrada automáticamente a `postgresql+psycopg2://`.
   - Normaliza prefijos antiguos (`postgres://` -> `postgresql://`).
   - Garantiza compatibilidad cruzada e ininterrumpida entre versiones de drivers en cualquier entorno (desarrollo local, Docker y Dokploy VPS).

---

## Próximos Pasos
- Commit y push a la rama `main` para que Dokploy ejecute el nuevo build con las dependencias y normalización aplicadas.
