"""Fichas Producto REST endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
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
