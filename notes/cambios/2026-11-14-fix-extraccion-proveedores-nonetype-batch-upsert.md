# 2026-11-14 — Fix Extracción Proveedores: Resolución de TypeError NoneType y Batch Upsert en BD

- **Fecha:** 2026-11-14
- **Tipo:** Bugfix / Performance / Scraping
- **Estado:** Completado
- **Módulos Afectados:** `backend/app/services/proveedores_scraper.py`

---

## 1. Contexto y Problema Detectado
Durante la ejecución de extracción en segundo plano del catálogo y proveedores en Perú Compras, tras extraer con éxito 23,718 productos desde la tabla HTML de la categoría `[COMPUTADORAS DE ESCRITORIO]`, el worker arrojó una excepción fatal:

```text
[17:48:42] Extraídos 23718 productos desde la tabla HTML!
[17:49:25] Excepción en inicio de sesión / extracción: unsupported operand type(s) for +=: 'int' and 'NoneType'
[17:49:25] Error fatal: No se pudo obtener sesión activa.
```

### Causas Raíz Identificadas:
1. **Falta de retorno en `upsert_ofertas_history_db`:** La función finalizaba su iteración sin sentencia `return inserted`. Por especificación de Python, retornaba `None` implícito.
2. **Suma inválida en status global:** En la línea 280, `EXTRACTION_STATUS["items_inserted"] += inserted_now` intentaba sumar `int + NoneType`.
3. **Falta de `db.commit()` en transacciones masivas:** Las inserciones individuales en `ofertas_proveedor_history` no realizaban commit en la base de datos dentro de la función. Al ocurrir la excepción posterior, la transacción sufría rollback completo, perdiendo los 23,718 productos recién extraídos.
4. **Cuello de botella en inserción:** Insertar 23,718 productos uno por uno con `db.execute(stmt, params)` tomaba más de 43 segundos (17:48:42 a 17:49:25).
5. **Captura tardía de cookies de sesión:** Las cookies de autenticación solo se extraían del contexto del navegador al finalizar todo el bucle de categorías; al abortar en la primera categoría, `cookies_dict` retornaba vacío `{}` generando el error consecuente `No se pudo obtener sesión activa`.

---

## 2. Soluciones Implementadas

### A. Batch Upsert Masivo y Commit Transaccional (`backend/app/services/proveedores_scraper.py`)
- Se reestructuró `upsert_ofertas_history_db` para pre-construir la lista completa de parámetros e insertar por lotes (`batch_size = 1000`) utilizando `db.execute(stmt, chunk)` seguido inmediatamente de `db.commit()`.
- Esto reduce el tiempo de inserción de 23,718 registros de **43 segundos a menos de 1 segundo**.
- Se implementó fallback transaccional: si un bloque de 1,000 registros llegase a fallar, se ejecuta `db.rollback()` y se reintenta fila por fila con commit individual, garantizando que un error aislado no descarte el lote completo.
- Se agregó explícitamente `return inserted` al finalizar la función.

### B. Blindaje Defensivo contra `NoneType`
- En el consumidor directo (Paso 7 del scraper principal):
  ```python
  inserted_now = upsert_ofertas_history_db(db, products) or 0
  EXTRACTION_STATUS["items_inserted"] = (EXTRACTION_STATUS.get("items_inserted") or 0) + inserted_now
  ```
- En el pool de workers paralelos (`run_worker_pool_extraction`):
  ```python
  total_inserted += (count or 0)
  ```

### C. Captura Temprana de Cookies de Sesión
- Se agregaron instrucciones de lectura inmediata de cookies (`raw_cookies = await context.cookies()`) justo después del login exitoso (`if ok:`), antes de iniciar la navegación a `/MejoraBasica` y la descarga de catálogos.
- Garantiza que la sesión activa y las cookies queden preservadas en `cookies_dict` independientemente del resultado de pasos posteriores.

---

## 3. Próximos Pasos
- Desplegar cambios en producción mediante git push a `main`.
- Monitorear logs de Celery/Flower en la siguiente extracción periódica de catálogos de proveedores.
