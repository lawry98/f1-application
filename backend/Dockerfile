# The backend's production image. The context is the repo root, not backend/:
#
#   docker build -f backend/Dockerfile .
#
# The backend reads frontend/data/circuits/ at runtime (config.CIRCUIT_INDEX_PATH), so the image
# keeps the repo's layout, /app/backend beside /app/frontend/data/circuits. The root .dockerignore
# is an allow-list; read it before adding a COPY.

# Tag and digest, so a rebuild is the same base until someone edits this line.
FROM python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    FASTF1_CACHE_DIR=/tmp/fastf1

# Dependencies in their own layer, before the source, so a code-only change reuses it.
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt

COPY frontend/data/circuits/ /app/frontend/data/circuits/
COPY backend/ /app/backend/

RUN useradd --system --uid 10001 --create-home --home-dir /home/app app
USER app
WORKDIR /app/backend

EXPOSE 8080

# One worker: the cost guard's limits live in this process's memory (api/guard.py), so a second
# worker would double every one. --no-proxy-headers: uvicorn's X-Forwarded-For handling stays off
# even if FORWARDED_ALLOW_IPS is set by mistake — with '*' it trusts the leftmost, client-written
# entry. The visitor's address comes from CLIENT_IP_HEADER instead (api/client_ip.py).
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-proxy-headers"]
