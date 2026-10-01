"""Tests for the app factory: which surfaces the deployed API serves.

Built through ``create_app`` rather than by importing main, for the reason the ``client``
fixture gives: importing main validates the config and switches on FastF1's disk cache.
"""

import pytest
from fastapi.testclient import TestClient

from api.app import create_app

# FastAPI mounts the OAuth2 redirect only alongside the Swagger UI, so it goes with the rest.
DOCS_PATHS = ["/docs", "/docs/oauth2-redirect", "/redoc", "/openapi.json"]


@pytest.mark.parametrize("path", DOCS_PATHS)
def test_the_api_docs_are_not_served_when_off(path):
    client = TestClient(create_app(expose_docs=False))

    assert client.get(path).status_code == 404


@pytest.mark.parametrize("path", DOCS_PATHS)
def test_the_api_docs_are_served_when_on(path):
    client = TestClient(create_app(expose_docs=True))

    assert client.get(path).status_code == 200


def test_the_root_does_not_advertise_docs_that_are_off():
    body = TestClient(create_app(expose_docs=False)).get("/").json()

    assert "docs" not in body
    assert body["health"] == "/api/health"


def test_the_root_advertises_the_docs_when_on():
    assert TestClient(create_app(expose_docs=True)).get("/").json()["docs"] == "/docs"


def test_the_app_serves_the_api_router():
    assert TestClient(create_app(expose_docs=False)).get("/api/health").status_code == 200
