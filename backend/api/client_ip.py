"""The visitor's address, read from the one header the edge proxy sets.

The cost guard keys on ``request.client.host`` (api/guard.py), and uvicorn's access log prints the
same ``scope["client"]``. Behind Fly's proxy that is the proxy, so every visitor would share one
hourly allowance. uvicorn's own fix, ``--proxy-headers``, is no fix there: Fly does not document its
proxy's address, and ``FORWARDED_ALLOW_IPS='*'`` makes uvicorn trust the *leftmost* X-Forwarded-For
entry, which the visitor writes. Fly's ``Fly-Client-IP`` is set by the proxy itself, and a value the
visitor sends is replaced (observed 2026-10-13; see docs/adr/0005-deploy-on-fly-and-vercel.md).

So this reads exactly that header and nothing else, and rewrites ``scope["client"]`` **in place**,
which is what makes the access log agree with the guard. Anything but exactly one plain address
leaves the TCP peer: a repeated header means the request did not come through the edge, and a
zone id or a list is not an address a client can have.
"""

import ipaddress

from starlette.types import ASGIApp, Receive, Scope, Send


class ClientIPMiddleware:
    def __init__(self, app: ASGIApp, *, header: str) -> None:
        self.app = app
        # ASGI header names arrive as lowercased bytes.
        self._header = header.lower().encode("latin-1")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            visitor = self._visitor(scope)
            if visitor is not None:
                scope["client"] = (visitor, 0)
        await self.app(scope, receive, send)

    def _visitor(self, scope: Scope) -> str | None:
        values = [value for name, value in scope["headers"] if name.lower() == self._header]
        if len(values) != 1:
            return None
        try:
            ip = ipaddress.ip_address(values[0].decode("latin-1").strip())
        except ValueError:
            return None
        if isinstance(ip, ipaddress.IPv6Address):
            if ip.scope_id is not None:
                return None
            ip = ip.ipv4_mapped or ip
        return str(ip)
