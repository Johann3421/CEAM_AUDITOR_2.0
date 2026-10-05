# Integración Server-to-Server: CEAM AUDITOR 2.0 ◄──► ENSAMBLADOR KENYA ERP

## Arquitectura de Conexión
```text
┌────────────────────────────────────────┐                     ┌────────────────────────────────────────┐
│            CEAM AUDITOR 2.0            │  HTTP REST / JSON   │         ENSAMBLADOR KENYA ERP          │
│   (PostgreSQL +134k OCAMs, Scrapers)   │ ──────────────────► │ (FastAPI, SQLite, Motor Compatibilidad)│
│                                        │  Header: X-API-KEY  │                                        │
│  Router: /api/v1/integracion/          │ ◄────────────────── │ Cliente: app/services/ceam_client.py   │
└────────────────────────────────────────┘                     └────────────────────────────────────────┘
```

---

## 1. Configuración de Entorno en Ensamblador KENYA
Agrega en tu archivo `.env`:

```env
# En desarrollo local:
CEAM_API_URL=http://localhost:8000/api/v1/integracion
CEAM_API_KEY=kenya-ceam-b2b-secret-token-2026

# En producción (Dokploy / VPS):
# CEAM_API_URL=https://api-auditor.sekaitech.com.pe/api/v1/integracion
# CEAM_API_KEY=kenya-ceam-b2b-secret-token-2026
```

---

## 2. Endpoints Disponibles en CEAM AUDITOR 2.0

### Endpoint 1: Top Fichas de Computadoras más Vendidas
* **Método:** `GET /api/v1/integracion/fichas/top-desktop?limit=30&meses=12`
* **Cabecera requerida:** `X-API-KEY: kenya-ceam-b2b-secret-token-2026`
* **Uso:** Alimenta al Asistente IA y al configurador con las fichas que concentran el 80% de compras públicas de computadoras en Perú Compras.

### Endpoint 2: Benchmark Forense de Precios y Competencia
* **Método:** `GET /api/v1/integracion/benchmark/{nro_parte}`
* **Cabecera requerida:** `X-API-KEY: kenya-ceam-b2b-secret-token-2026`
* **Uso:** Responde a *"¿A qué precio se adjudicó este producto, quién ganó y qué stock/precios tienen competidores como Jorge Rojas o The King?"*.

### Endpoint 3: Auditor de Cumplimiento Técnico (Zero-Waste Spec)
* **Método:** `POST /api/v1/integracion/auditar-specs`
* **Cabecera requerida:** `X-API-KEY: kenya-ceam-b2b-secret-token-2026`
* **Payload:**
```json
{
  "nro_parte_ceam": "KNY-PRO-I5-16-512",
  "componentes_ensamble": {
    "cpu": "Intel Core i5 13400",
    "ram": "16GB DDR4 3200MHz",
    "storage": "512GB SSD NVMe M.2",
    "formato": "Slim / SFF",
    "psu": "250W 80 Plus"
  }
}
```
* **Respuesta:**
```json
{
  "cumple_100": true,
  "alertas_descalificacion": [],
  "desperdicio_margen": [
    {
      "pieza": "ALMACENAMIENTO",
      "requerido": "512GB NVMe",
      "ensamblado": "1TB NVMe",
      "impacto_margen_usd": 28.50
    }
  ],
  "total_impacto_desperdicio_usd": 28.50
}
```

---

## 3. Integración en el Backend de KENYA
1. Copia `ceam_client.py` en `app/services/ceam_client.py`.
2. Para conectar el Copiloto IA con Gemini, usa las tools definidas en `ai_advisor_tools.py`.
