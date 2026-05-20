from app.db.database import SessionLocal
from sqlalchemy import text
db = SessionLocal()
res = db.execute(text("SELECT * FROM fichas_producto WHERE UPPER(marca) = 'KENYA' LIMIT 1")).fetchone()
if res:
    print(list(res._mapping.keys()))
    print(dict(res._mapping))
else:
    print('No data found for KENYA')
db.close()
