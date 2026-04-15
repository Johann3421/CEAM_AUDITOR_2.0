"""Fichas Producto REST endpoints."""
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import get_db

router = APIRouter(prefix="/fichas", tags=["Fichas Producto"])

_TABLE = "fichas_producto"


def _safe_col(db: Session) -> list[str]:
    """Return actual column names from the DB table (may not exist yet)."""
    try:
        rows = db.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :t ORDER BY ordinal_position"
            ),
            {"t": _TABLE},
        ).fetchall()
        return [r[0] for r in rows]
    except Exception:
        return []


@router.get("/")
def list_fichas(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    acuerdo_marco: Optional[str] = Query(None),
    catalogo: Optional[str] = Query(None),
    categoria: Optional[str] = Query(None),
    marca: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List fichas-producto with optional filters and pagination."""
    cols = _safe_col(db)
    if not cols:
        return []

    filters = []
    params: dict = {"skip": skip, "limit": limit}

    # Normalised column names coming from the DB
    col_set = set(cols)

    def _filter(col: str, val: str, param: str):
        if col in col_set and val:
            filters.append(f'"{col}" ILIKE :{param}')
            params[param] = f"%{val}%"

    _filter("acuerdo_marco", acuerdo_marco, "acuerdo")
    _filter("catálogo", catalogo, "catalogo")
    _filter("categoría", categoria, "categoria")
    _filter("marca", marca, "marca")
    _filter("estado_ficha_producto", estado, "estado")

    # Full-text search over description + nro_parte
    if search:
        search_cols = []
        for c in ("descripción_fichaproducto", "nro_parte_o_código_único_de_identificación",
                  "descripcin_fichaproducto", "nro_parte_o_cdigo_nico_de_identificacin"):
            if c in col_set:
                search_cols.append(f'"{c}" ILIKE :search')
        if search_cols:
            filters.append("(" + " OR ".join(search_cols) + ")")
            params["search"] = f"%{search}%"

    where_clause = ("WHERE " + " AND ".join(filters)) if filters else ""
    quoted_cols = ", ".join(f'"{c}"' for c in cols)
    sql = text(
        f'SELECT {quoted_cols} FROM {_TABLE} {where_clause}'
        f' ORDER BY fecha_extraccion DESC NULLS LAST'
        f' LIMIT :limit OFFSET :skip'
    )
    rows = db.execute(sql, params).fetchall()
    return [dict(zip(cols, row)) for row in rows]


@router.get("/stats")
def get_fichas_stats(db: Session = Depends(get_db)):
    """Aggregated statistics for the fichas dashboard panel."""
    cols = _safe_col(db)
    if not cols:
        return {
            "total_fichas": 0,
            "by_acuerdo": [],
            "by_categoria": [],
            "by_estado": [],
            "by_marca": [],
        }

    col_set = set(cols)

    def _agg(col: str, label: str):
        if col not in col_set:
            return []
        try:
            rows = db.execute(
                text(
                    f'SELECT "{col}", COUNT(*) as total FROM {_TABLE}'
                    f' GROUP BY "{col}" ORDER BY total DESC LIMIT 20'
                )
            ).fetchall()
            return [{"name": r[0] or "S/D", "total": r[1]} for r in rows]
        except Exception:
            return []

    total = 0
    try:
        total = db.execute(text(f"SELECT COUNT(*) FROM {_TABLE}")).scalar() or 0
    except Exception:
        pass

    return {
        "total_fichas": total,
        "by_acuerdo": _agg("acuerdo_marco", "acuerdo"),
        "by_categoria": _agg("categoría" if "categoría" in col_set else "categora", "categoria"),
        "by_estado": _agg("estado_ficha_producto", "estado"),
        "by_marca": _agg("marca", "marca"),
    }


@router.get("/precio-stats")
def get_precio_stats(db: Session = Depends(get_db)):
    """Coverage and volatility stats for enriched prices."""
    cols = _safe_col(db)
    if "precio_referencia" not in cols:
        return {"total": 0, "con_precio": 0, "sin_precio": 0, "coverage_pct": 0.0, "enriquecido_at": None, "volatilidad": {"baja": 0, "media": 0, "alta": 0}}
    try:
        total = db.execute(text(f"SELECT COUNT(*) FROM {_TABLE}")).scalar() or 0
        con_precio = db.execute(text(f"SELECT COUNT(*) FROM {_TABLE} WHERE precio_referencia IS NOT NULL")).scalar() or 0
        last_upd = db.execute(text(f"SELECT MAX(precio_actualizado_at) FROM {_TABLE}")).scalar()
        vol = db.execute(text(
            f"SELECT "
            f"COUNT(*) FILTER (WHERE precio_volatilidad < 20) as baja, "
            f"COUNT(*) FILTER (WHERE precio_volatilidad BETWEEN 20 AND 50) as media, "
            f"COUNT(*) FILTER (WHERE precio_volatilidad > 50) as alta "
            f"FROM {_TABLE} WHERE precio_referencia IS NOT NULL"
        )).fetchone()
        return {
            "total": total,
            "con_precio": con_precio,
            "sin_precio": total - con_precio,
            "coverage_pct": round(con_precio / total * 100, 1) if total > 0 else 0.0,
            "enriquecido_at": str(last_upd) if last_upd else None,
            "volatilidad": {"baja": vol[0] or 0, "media": vol[1] or 0, "alta": vol[2] or 0},
        }
    except Exception:
        return {"total": 0, "con_precio": 0, "sin_precio": 0, "coverage_pct": 0.0, "enriquecido_at": None, "volatilidad": {"baja": 0, "media": 0, "alta": 0}}


@router.post("/enrich-precios")
def enrich_precios(db: Session = Depends(get_db)):
    """
    Match fichas_producto ↔ purchase_orders by nro_parte and compute a
    canonical reference price using epsilon-neighborhood mode clustering.

    Algorithm (Discrete Math — proximity equivalence classes):
      - Sort all prices for a given nro_parte.
      - Build clusters: greedy scan; a price joins the current cluster if it
        falls within ε=5% of the cluster’s first element (anchor).
        Formally: (p₁, p₂) ∈ R  ⇔  p₂ ≤ p₁ × (1+ε).
      - Select the densest cluster (most orders at that price zone).
      - Canonical price = median of the densest cluster.
      - Volatility = (max − min) / global_median × 100  (% spread).
    """
    # 1. Add price columns to fichas_producto if not present
    price_cols = [
        ("precio_referencia", "NUMERIC(14,4)"),
        ("precio_min", "NUMERIC(14,4)"),
        ("precio_max", "NUMERIC(14,4)"),
        ("precio_mediana", "NUMERIC(14,4)"),
        ("precio_volatilidad", "NUMERIC(7,2)"),
        ("n_ordenes_precio", "INTEGER"),
        ("precio_actualizado_at", "TIMESTAMP WITH TIME ZONE"),
    ]
    try:
        for col_name, col_type in price_cols:
            db.execute(text(f"ALTER TABLE {_TABLE} ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al agregar columnas de precio: {e}")

    # 2. Detect nro_parte key column in fichas_producto
    cols = _safe_col(db)
    nro_col = next((c for c in cols if c.startswith("nro_parte")), None)
    if not nro_col:
        raise HTTPException(status_code=422, detail="No se encontró columna nro_parte en fichas_producto")

    # 3. Gather all prices from purchase_orders grouped by nro_parte
    raw = db.execute(text(
        "SELECT nro_parte, precio_unitario FROM purchase_orders "
        "WHERE nro_parte IS NOT NULL AND precio_unitario IS NOT NULL AND precio_unitario > 0"
    )).fetchall()
    price_map: dict = defaultdict(list)
    for nro, precio in raw:
        price_map[str(nro).strip()].append(float(precio))

    # 4. Epsilon-neighborhood mode clustering
    def canonical_price(precios: list) -> dict:
        precios_s = sorted(precios)
        EPS = 0.05  # 5% proximity tolerance
        clusters, current = [], [precios_s[0]]
        for p in precios_s[1:]:
            if current[0] > 0 and p <= current[0] * (1 + EPS):
                current.append(p)
            else:
                clusters.append(current)
                current = [p]
        clusters.append(current)
        best = max(clusters, key=len)
        canonical = statistics.median(best)
        med_g = statistics.median(precios_s)
        volatilidad = round((max(precios_s) - min(precios_s)) / med_g * 100, 2) if med_g > 0 else 0.0
        return {
            "precio_referencia": round(canonical, 4),
            "precio_min": round(min(precios_s), 4),
            "precio_max": round(max(precios_s), 4),
            "precio_mediana": round(med_g, 4),
            "precio_volatilidad": volatilidad,
            "n_ordenes_precio": len(precios_s),
        }

    # 5. Update fichas_producto
    now = datetime.now(tz=timezone.utc)
    fichas_keys = db.execute(text(f'SELECT "{nro_col}" FROM {_TABLE} WHERE "{nro_col}" IS NOT NULL')).fetchall()

    enriched = 0
    not_found = 0
    for (nro_val,) in fichas_keys:
        key = str(nro_val).strip()
        prices = price_map.get(key)
        if not prices:
            not_found += 1
            continue
        cp = canonical_price(prices)
        db.execute(text(
            f'UPDATE {_TABLE} SET '
            f'precio_referencia = :pr, precio_min = :pmin, precio_max = :pmax, '
            f'precio_mediana = :pmed, precio_volatilidad = :pvol, '
            f'n_ordenes_precio = :n, precio_actualizado_at = :ts '
            f'WHERE "{nro_col}" = :key'
        ), {"pr": cp["precio_referencia"], "pmin": cp["precio_min"], "pmax": cp["precio_max"],
            "pmed": cp["precio_mediana"], "pvol": cp["precio_volatilidad"],
            "n": cp["n_ordenes_precio"], "ts": now, "key": key})
        enriched += 1

    db.commit()
    total = len(fichas_keys)
    return {
        "enriched": enriched,
        "not_found": not_found,
        "total_fichas": total,
        "coverage_pct": round(enriched / total * 100, 1) if total > 0 else 0.0,
    }


@router.delete("/all")
def delete_all_fichas(db: Session = Depends(get_db)):
    """Truncate the fichas_producto table. Used to clear duplicates before a clean re-scrape."""
    try:
        db.execute(text(f"TRUNCATE TABLE {_TABLE} RESTART IDENTITY"))
        db.commit()
        return {"deleted": True, "message": "Tabla fichas_producto vaciada correctamente."}
    except Exception as e:
        db.rollback()
        raise


@router.get("/alertas-suspendidas")
async def get_alertas_suspendidas(
    acuerdo_marco: str = Query("EXT-CE-2022-5", description="Código del Acuerdo Marco a escanear"),
    db: Session = Depends(get_db)
):
    """
    Endpoint para n8n. Ejecuta el scraper de Módulo 2 en vivo y
    devuelve las fichas que pasaron de 'Ofertada' → 'Suspendida'.
    """
    from app.services.fichas_scraper import run_module_2, AGREEMENT_SELECTOR

    # Build the CSS selector from the agreement code
    selector = f'div[data-agreement*="{acuerdo_marco}"]'
            
    try:
        from app.db.database import engine as app_engine
        result = await run_module_2(
            engine=app_engine,
            agreement_selector=selector,
            agreement_code=acuerdo_marco,
            cleanup=True
        )
        
        deltas = result.get("deltas_suspendidas", [])
        
        # Agrupar por marca
        datos = {}
        for d in deltas:
            marca = d["marca"].upper() if d["marca"] else "OTRAS"
            if marca not in datos:
                datos[marca] = []
            datos[marca].append({
                "nro_parte": d["nro_parte"],
                "descripcion": d["descripcion"],
                "anterior": d["anterior"],
                "actual": d["actual"]
            })
            
        resumen = {}
        # Para cada marca que tuvo caídas, consultar en base de datos cuántas 'Ofertadas' le quedan
        cols = _safe_col(db)
        if "marca" in cols and "estado_ficha_producto" in cols:
            for marca in datos.keys():
                count = db.execute(
                    text(
                        f"SELECT COUNT(*) FROM {_TABLE} "
                        f"WHERE UPPER(marca) = :m AND UPPER(estado_ficha_producto) LIKE '%OFERTADA%'"
                    ),
                    {"m": marca}
                ).scalar() or 0
                resumen[marca] = {"ofertadas_actuales": count}
                
        return {
            "hayAlertas": len(deltas) > 0,
            "total_suspendidas": len(deltas),
            "datos": datos,
            "resumen": resumen,
            "meta": {
                "filepath": result.get("filepath"),
                "rows_processed": result.get("rows_processed"),
                "inserted": result.get("inserted"),
                "updated": result.get("updated")
            }
        }
        
    except Exception as e:
        import traceback
        return {
            "error": True,
            "message": str(e),
            "trace": traceback.format_exc()
        }
