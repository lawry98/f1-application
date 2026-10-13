"""The FastAPI app, built by a factory so tests can make one without importing main.

Importing main runs ``validate_config()`` and switches on FastF1's on-disk cache, neither of
which belongs in a unit test (see the ``client`` fixture in tests/conftest.py).
"""

import logging

from fastapi import FastAPI

from api.client_ip import ClientIPMiddleware
from api.cors import add_cors
from api.routes import router

logger = logging.getLogger(__name__)


def create_app(*, expose_docs: bool, client_ip_header: str | None = None) -> FastAPI:
    """Build the API.

    ``expose_docs`` serves /docs, /redoc and /openapi.json; off, all three 404.
    ``client_ip_header`` names the header the edge proxy writes the visitor's address into
    (api/client_ip.py); ``None`` leaves ``request.client`` as the TCP peer.
    """
    docs_urls = {} if expose_docs else {"docs_url": None, "redoc_url": None, "openapi_url": None}
    app = FastAPI(
        title="F1 Briefing Agent API",
        description="AI-powered F1 race weekend briefing generator",
        version="1.0.0",
        **docs_urls,
    )

    add_cors(app)
    # Added after CORS, so it wraps it: CORS answers a preflight without calling what it wraps,
    # and the access log should show the visitor on those lines too.
    if client_ip_header:
        app.add_middleware(ClientIPMiddleware, header=client_ip_header)
        logger.info("Client address read from the %s header", client_ip_header)

    app.include_router(router)

    @app.get("/")
    async def root() -> dict:
        """API root — links to the health check, and to the docs when they are served."""
        links = {"message": "F1 Briefing Agent API", "health": "/api/health"}
        if expose_docs:
            links["docs"] = "/docs"
        return links

    return app
