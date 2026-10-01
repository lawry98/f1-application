"""CORS for the API, split out of main.py so tests can mount it without importing main.

Importing main runs ``validate_config()`` and switches on FastF1's on-disk cache, neither of
which belongs in a unit test (see the ``client`` fixture in tests/conftest.py).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS


def add_cors(app: FastAPI) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
        # A cross-origin script can read only the CORS-safelisted response headers unless the
        # server names the others. The briefing stream's 429/503 carry Retry-After, and the page
        # falls back to it when a rejection's JSON body cannot be read.
        expose_headers=["Retry-After"],
    )
