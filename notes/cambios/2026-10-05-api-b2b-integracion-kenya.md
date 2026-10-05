# Cambio: Implementación de API B2B Server-to-Server e Integración con Ensamblador KENYA

- **Fecha:** 2026-10-05
- **Tipo:** Feature / Arquitectura / B2B Integration
- **Estado:** Completado

---

## Contexto y Objetivo
El usuario solicitó habilitar una API B2B en **CEAM AUDITOR 2.0** para alimentar al **Ensamblador KENYA ERP** con datos de inteligencia comercial de compras públicas peruanas (+134k órdenes de compra OCAM, fichas técnicas oficiales y ofertas de competidores).

---

## Archivos Creados y Modificados
1. **`backend/app/core/security_b2b.py`**:
   - Autenticación Server-to-Server mediante header estático `X-API-KEY`.
   - Variable de entorno `CEAM_B2B_SECRET` con fallback a clave predeterminada.
   - Dependencia `verificar_api_key_b2b` que deniega accesos no autorizados con HTTP 403 Forbidden.

2. **`backend/app/api/endpoints/integracion.py`**:
   - `GET /api/v1/integracion/fichas/top-desktop`: Agregación de órdenes de compra para obtener las computadoras más vendidas con especificaciones parseadas canónicamente y precios unitarios mínimos/promedios.
   - `GET /api/v1/integracion/benchmark/{nro_parte}`: Histórico de precios adjudicados (últimas 5 órdenes OCAM) y ofertas activas de competidores (Jorge Rojas, The King, etc.) con stock y plazos de entrega en días.
   - `POST /api/v1/integracion/auditar-specs`: Auditoría técnica "Zero-Waste" que compara componentes propuestos contra los mínimos de la ficha de Perú Compras para evitar descalificaciones o piezas sobredimensionadas.

3. **`backend/app/api/router.py`**:
   - Registro del router `integracion` bajo el prefijo `/integracion` (accesible en `/api/v1/integracion`).

4. **`integrations/kenya_b2b/`**:
   - `ceam_client.py`: Cliente HTTP Python desacoplado para el backend de KENYA.
   - `ai_advisor_tools.py`: Definición de herramientas nativas para Gemini Tool Calling.
   - `README.md`: Guía de conexión y configuración `.env`.

---

## Decisiones de Arquitectura
- **Seguridad Server-to-Server:** Se utiliza autenticación por API Key en cabecera en lugar de JWT de usuario final, optimizando la comunicación máquina-a-máquina.
- **Ley de Tesler:** El backend de CEAM resuelve la agregación SQL, normalización de campos y parsing de hardware, entregando al ensamblador datos 100% listos para cotizar en milisegundos.
- **YAGNI / Ponytail:** Sin nuevas tablas auxiliares; reutilización directa de `purchase_orders`, `fichas_producto` y `ofertas_proveedor_history`.
