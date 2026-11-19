# 2026-11-18 — Fix Extracción Fichas: Soporte para Nuevo Visor de Perú Compras, Auto-migración DDL y Batch Upsert

- **Fecha:** 2026-11-18
- **Tipo:** Bugfix / Scraping / Base de Datos / Rendimiento
- **Estado:** Completado
- **Módulos Afectados:** `backend/app/services/fichas_scraper.py`, `backend/app/api/endpoints/fichas.py`

---

## 1. Contexto y Problema Detectado
Al ejecutar la extracción del Módulo 2 (Fichas-producto) desde `https://auditor.sekaitech.com.pe/fichas`, la extracción finalizaba con 0 fichas guardadas/actualizadas y un conteo de errores masivo equivalente al total de registros descargados (más de 23,170 filas).

### Causas Raíz Identificadas:
1. **Actualización del Portal Perú Compras (Nuevo Visor de Fichas-producto):**
   - El nuevo visor (`https://buscadorcatalogos.perucompras.gob.pe/#`) actualizó la estructura del archivo Excel exportado, pasando de 9 columnas a 11 columnas.
   - Se incorporaron dos nuevas métricas financieras: `Monto Contratado` (`FLOAT`) y `Cant. OCAM` (`BIGINT`).
2. **Falta de Columnas en PostgreSQL de Producción:**
   - La tabla `fichas_producto` en PostgreSQL se creó originalmente sin `monto_contratado` ni `cant_ocam`.
   - `meta.create_all()` en SQLAlchemy no modifica ni añade columnas a tablas ya existentes en la BD.
   - Al intentar insertar o actualizar con `stmt = pg_insert(fichas_table).values(**val)`, PostgreSQL arrojaba `psycopg2.errors.UndefinedColumn: column "monto_contratado" of relation "fichas_producto" does not exist`, abortando la transacción (`current transaction is aborted, commands ignored until end of transaction block`).
3. **Fallas por Duplicados en Lotes:**
   - El catálogo exportado por Perú Compras incluye números de parte duplicados (4 filas duplicadas en el set de 23,176).
   - En PostgreSQL, si un lote contiene dos registros con la misma clave primaria, se produce el error: `ON CONFLICT DO UPDATE command cannot affect row a second time`.
4. **Ineficiencia de Inserción Fila a Fila:**
   - El código anterior ejecutaba `conn.execute()` individual por cada una de las 23,176 filas dentro de sub-bloques, tardando varios minutos y saturando el pool de conexiones.

---

## 2. Soluciones Implementadas

### A. Auto-migración Dinámica DDL (`backend/app/services/fichas_scraper.py`)
- Se implementó inspección de esquema en tiempo de ejecución con `sqlalchemy.inspect(engine)`.
- Antes de procesar el dataset, el scraper detecta automáticamente si existen columnas en el DataFrame que no existan en la tabla física de la BD, ejecutando de forma segura:
  ```sql
  ALTER TABLE fichas_producto ADD COLUMN IF NOT EXISTS "<col_name>" <TIPO>
  ```
- Soporta tipos nativos: `FLOAT` para montos, `BIGINT` para cantidades/conteos, `TIMESTAMP WITH TIME ZONE` para fechas y `TEXT` para campos de texto.
- Se añadió invalidación inmediata de la caché de columnas del endpoint API (`invalidate_safe_col_cache()`).

### B. Deduplicación Previa por Clave Primaria
- Se implementó:
  ```python
  df = df.drop_duplicates(subset=[key_col], keep="last").reset_index(drop=True)
  ```
- Elimina duplicados antes de preparar la inserción, garantizando idempotencia y evitando el error `ON CONFLICT DO UPDATE command cannot affect row a second time`.

### C. Batch Upsert Masivo con Fallback Resiliente por Savepoints
- Se optimizó el proceso para compilar una sola sentencia PostgreSQL parametrizada `pg_insert(fichas_table).on_conflict_do_update(...)`.
- La inserción se ejecuta en lotes (`BATCH_CHUNK_SIZE = 1000`) pasando la lista de diccionarios directamente a `conn.execute(stmt, batch_rows)`.
- El tiempo total de procesamiento de las 23,172 fichas bajó de más de 4 minutos a **~12 segundos**.
- **Fallback resiliente:** Si un lote llegase a fallar por algún error de datos no previsto, se atrapa la excepción y se reintenta fila por fila usando savepoints transaccionales (`conn.begin_nested()`), de modo que un registro defectuoso no invalide el resto del lote.

### D. Soporte en Endpoints y Exportación (`backend/app/api/endpoints/fichas.py`)
- Se integró `invalidate_safe_col_cache()` para que los endpoints de listado reconozcan inmediatamente las columnas recién creadas sin requerir reinicio del proceso FastAPI.
- Se agregaron las etiquetas `"monto_contratado"` y `"cant_ocam"` en el diccionario de exportación Excel `COL_LABELS` para incluir los nuevos campos en reportes descargables.

---

## 3. Próximos Pasos
- Desplegar cambios en producción mediante push a `main`.
- Ejecutar la extracción de fichas en `https://auditor.sekaitech.com.pe/fichas` para poblar el catálogo completo con las nuevas métricas.
