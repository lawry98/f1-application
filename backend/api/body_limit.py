"""A cap on request bodies, applied before anything parses one.

FastAPI reads and parses the whole body before a route runs, so the briefing route's cost guard
(api/guard.py) only sees a request once its body is in memory, and a 422 echoes it back. One
300 MB POST took the process from 137 to 1,594 MB in 1.5s, past the 512 MB machine, and the
guard's per-IP and per-day counts live in that process: every OOM restart is a fresh allowance.

No route takes more than a ``BriefingRequest``, so one limit covers the app. A declared
``content-length`` over it is refused unread; a chunked body is counted as it arrives and refused
at the chunk that would cross it. A body within the limit is held here and replayed to the app
in one message, after which ``receive`` is the client's again: sse-starlette listens there for
the hang-up. Counting inside a wrapped ``receive`` instead would mean raising out of the app's
body read, which FastAPI turns into a 400 of its own; at 16 KiB, holding the body costs nothing.
"""

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Over twice the largest valid BriefingRequest: 6,013 bytes, 500 astral characters JSON-escaped.
MAX_BODY_BYTES = 16 * 1024


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if self._declared_too_long(scope):
            await self._refuse(scope, receive, send)
            return

        body = bytearray()
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] == "http.disconnect":
                return  # a fragment, and nobody left to answer
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_bytes:
                await self._refuse(scope, receive, send)
                return
            body += chunk
            more_body = message.get("more_body", False)

        pending: Message | None = {"type": "http.request", "body": bytes(body), "more_body": False}

        async def replay() -> Message:
            nonlocal pending
            if pending is None:
                return await receive()
            message, pending = pending, None
            return message

        await self.app(scope, replay, send)

    def _declared_too_long(self, scope: Scope) -> bool:
        # uvicorn refuses a length that is not a number itself; here one is just not trusted,
        # and the body is counted like any other.
        return any(
            value.isdigit() and int(value) > self.max_bytes
            for name, value in scope["headers"]
            if name == b"content-length"
        )

    async def _refuse(self, scope: Scope, receive: Receive, send: Send) -> None:
        # The rest of the upload is still arriving. Kept alive, uvicorn reads it to the end only
        # to discard it; told to close, it drops the socket once the 413 is out.
        response = JSONResponse(
            status_code=413,
            content={"code": "body_too_large", "max_bytes": self.max_bytes},
            headers={"Connection": "close"},
        )
        await response(scope, receive, send)
