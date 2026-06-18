FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FORGE_HOST=0.0.0.0
ENV FORGE_DATA_DIR=/app/data

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgomp1 \
        libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY index.html app.js styles.css creator.html /app/
COPY backend /app/backend

WORKDIR /app/backend

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; port=os.getenv('FORGE_PORT') or os.getenv('PORT') or '8001'; urllib.request.urlopen(f'http://127.0.0.1:{port}/api/v1/health', timeout=3).read()"

CMD ["python", "run.py"]
