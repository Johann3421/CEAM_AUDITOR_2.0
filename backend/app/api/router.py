"""Central API router — aggregates all endpoint routers."""
from fastapi import APIRouter

from app.api.endpoints import fichas, purchase_orders, scraper

api_router = APIRouter()

api_router.include_router(purchase_orders.router)
api_router.include_router(scraper.router)
api_router.include_router(fichas.router)
