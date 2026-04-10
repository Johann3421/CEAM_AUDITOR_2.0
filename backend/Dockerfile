# ── CEAM Auditor 2.0 — Backend Dockerfile ──────────────────────────────────
FROM python:3.11-slim

# System deps for Playwright + psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (Chromium only)
RUN playwright install chromium --with-deps

# Copy application source
COPY . .

# Expose API port
EXPOSE 8000

# Default command: run FastAPI with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
