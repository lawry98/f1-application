"""The client-IP middleware: one header the edge proxy sets becomes ``request.client``.

The guard keys on ``request.client.host`` (api/guard.py), and so does uvicorn's access log, so
this middleware is the whole of "which visitor is this" in production. What it must never do is
key on text a visitor chose: anything but exactly one well-formed address leaves the TCP peer.
"""

import asyncio

import pytest
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from api.client_ip import ClientIPMiddleware

# TestClient's own peer, which every "left untouched" case must still report.
PEER = "testclient"


def whoami(request: Request) -> PlainTextResponse:
    return PlainTextResponse(request.client.host if request.client else "none")


def client_for(header: str = "Fly-Client-IP") -> TestClient:
    app = Starlette(routes=[Route("/whoami", whoami)])
    return TestClient(ClientIPMiddleware(app, header=header))


def host_seen(headers, header: str = "Fly-Client-IP") -> str:
    return client_for(header).get("/whoami", headers=headers).text


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("203.0.113.7", "203.0.113.7"),
        ("2001:db8::1", "2001:db8::1"),
        ("2001:DB8::1", "2001:db8::1"),  # canonical form, so one visitor is one key
        ("::ffff:203.0.113.7", "203.0.113.7"),  # mapped IPv4 keys as the IPv4 it is
        ("  203.0.113.7 ", "203.0.113.7"),
    ],
)
def test_the_header_becomes_the_client_address(value, expected):
    assert host_seen({"Fly-Client-IP": value}) == expected


def test_the_header_name_is_matched_without_regard_to_case():
    assert host_seen({"fly-client-ip": "203.0.113.7"}, header="FLY-CLIENT-IP") == "203.0.113.7"


def test_without_the_header_the_peer_is_left_alone():
    assert host_seen({}) == PEER


@pytest.mark.parametrize(
    "value",
    [
        "",
        "unknown",
        "203.0.113.7, 198.51.100.1",  # a list is a forwarding chain, not an address
        "203.0.113.7:4321",
        "[2001:db8::1]",
        "fe80::1%eth0",  # a zone means nothing from a client, and str() would keep it
        "01.2.3.4",
    ],
)
def test_a_value_that_is_not_one_plain_address_leaves_the_peer(value):
    assert host_seen({"Fly-Client-IP": value}) == PEER


def test_a_repeated_header_leaves_the_peer():
    """Fly's edge always sends exactly one, so two means the request did not come through it."""
    headers = [("Fly-Client-IP", "203.0.113.7"), ("Fly-Client-IP", "198.51.100.1")]

    assert host_seen(headers) == PEER


def test_x_forwarded_for_is_never_read():
    assert host_seen({"X-Forwarded-For": "203.0.113.7"}) == PEER


def test_a_non_http_scope_passes_through_untouched():
    """Lifespan has no headers and no client; the app must still start."""
    seen = []

    async def app(scope, receive, send):
        seen.append(dict(scope))

    scope = {"type": "lifespan", "asgi": {"version": "3.0"}}

    asyncio.run(ClientIPMiddleware(app, header="Fly-Client-IP")(scope, None, None))

    assert seen == [scope]
