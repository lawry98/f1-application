# Deployment — design

**Date:** 2026-10-02 · **Branch:** `lc/application-deployment-d233e8` (off `main` at `62d901a`) · **Status:** awaiting review

## Goal

Put the app on the public internet as a portfolio site: the Next.js frontend on Vercel, the
FastAPI backend on one always-on Fly.io machine, for about $3.70 a month. Nothing is deployed
today and the repo has no Dockerfile, no host config and no deploy workflow.

## Decisions

Approved in brainstorming, 2026-10-01/02.

| Question | Decision | Why |
|---|---|---|
| Purpose, budget | Public portfolio, ~$5/mo | — |
| Frontend host | Vercel Hobby, root directory `frontend/`, production from `main` only | Free; a non-commercial portfolio is within Hobby's terms; 100 GB/mo transfer |
| Backend host | Fly.io, 1 × `shared-cpu-1x`, **512 MB, never more**, region `iad` | The only candidate that documents its client-IP header; a rolling deploy of one machine never runs two at once; deploys can wait for CI |
| Domain | Platform subdomains: `<project>.vercel.app`, `<app>.fly.dev` | No DNS work. A custom domain later needs a frontend rebuild (`NEXT_PUBLIC_*` are build-time) |
| Gemini | Free tier, shared key with local dev, `BRIEFING_DAILY_CAP=8`, `BRIEFING_PER_IP_PER_HOUR=3` | 8 × 2 calls = 16 of the ~20/day; Google's own quota is the hard stop, so nothing can bill |
| Preview deploys | Off | A preview's origin is not in `CORS_ORIGINS`, so its briefings would fail |
| Visitor IP | New `CLIENT_IP_HEADER` middleware reading `Fly-Client-IP`; uvicorn `--no-proxy-headers` | See Finding 1 |
| Deploy trigger | Backend: GitHub Actions after CI passes on `main`. Frontend: Vercel's Git integration | Backend redeploys on every `main` merge, frontend-only ones included (Finding 4) |
| Draining on deploy | None | A briefing cut by a deploy already lands in the page's "connection dropped" + Try again state |

## Findings that shaped this

Researched 2026-10-01 from each host's docs; measured locally the same day.

1. **`FORWARDED_ALLOW_IPS='*'` makes the per-IP limit spoofable.** In uvicorn 0.40,
   `_TrustedHosts.get_trusted_client_host` returns `x_forwarded_for_hosts[0]` — the
   *leftmost*, client-supplied entry — whenever every host is trusted. A visitor sending a fresh
   `X-Forwarded-For` per request gets a fresh allowance each time. A trust list needs the edge
   proxy's source address, which Fly, Railway and Render all leave undocumented. Fly documents
   `Fly-Client-IP` as "always set by the Fly Proxy"
   ([docs](https://docs.fly.io/networking/request-headers)), so the app reads that instead and
   uvicorn's own proxy handling is switched off.
2. **The backend reads the frontend tree at runtime.** `config.py:136` resolves
   `../frontend/data/circuits/index.json` relative to itself, and `tools/circuit_winners.py`
   also opens per-circuit files and `coordinates.json` beside it. The image must keep that
   layout. The directory is 180 KB.
3. **Every frontend → backend call is made by the browser** (`lib/api.ts`; no server
   component imports it). So the backend must be publicly reachable, CORS must name the Vercel
   origin, and `NEXT_PUBLIC_API_URL` is baked into the client bundle at `pnpm build`.
4. **A restart resets the guard.** The per-IP hours, the day count and the concurrency slots
   live in process memory (`api/guard.py`), so each deploy starts the day's count again. Under
   the free tier that is harmless, which is why path-gating deploys is not worth its edge cases.
5. **Memory.** The app is 147 MB resident right after import (`ru_maxrss`, macOS, dummy key).
   Peak under load is unmeasured; see Sizing.
6. **Vercel supports pnpm 6–10 natively.** pnpm 11 runs only through Corepack
   (`ENABLE_EXPERIMENTAL_COREPACK=1` with `packageManager: pnpm@11.8.0`, already set)
   ([docs](https://vercel.com/docs/package-managers)).
7. **Fly's first deploy makes two machines and stops idle ones** by default. `--ha=false`,
   `auto_stop_machines = "off"` and `min_machines_running = 1` give exactly one, always on —
   the guard's one-worker rule at the machine level.
8. **Streams survive.** Fly's proxy closes a connection idle for 60 s; sse-starlette pings every
   15 s, and a briefing's deadline is 90 s.

## Architecture

```
browser ──HTML/JS──▶ <project>.vercel.app    Vercel Hobby, frontend/, built from main
   └────fetch/SSE──▶ <app>.fly.dev            Fly, 1 machine, iad, always on
                         └─▶ Gemini · OpenF1 · FastF1 · Tavily · OpenWeather
```

`<app>` and `<project>` are chosen once, in setup step 2, before anything is built: both URLs
are baked into the frontend bundle and into `CORS_ORIGINS`.

### Configuration

| Setting | Where | Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Vercel env, Production | `https://<app>.fly.dev` |
| `NEXT_PUBLIC_SITE_URL` | Vercel env, Production | `https://<project>.vercel.app` |
| `ENABLE_EXPERIMENTAL_COREPACK` | Vercel env, Production | `1` |
| Node | `engines.node` in `frontend/package.json` | `24.x`, matching `mise.toml` |
| `ENABLE_INTERNAL_ROUTES` | — | unset, so `/candy` is not found |
| `GOOGLE_API_KEY`, `TAVILY_API_KEY`, `OPENWEATHER_API_KEY` | `fly secrets` | real keys, typed by the owner |
| `CORS_ORIGINS` | `fly.toml [env]` | `https://<project>.vercel.app` |
| `BRIEFING_DAILY_CAP`, `BRIEFING_PER_IP_PER_HOUR` | `fly.toml [env]` | `8`, `3` |
| `BRIEFING_MAX_CONCURRENT` | `fly.toml [env]` only if Sizing says so | `1` |
| `CLIENT_IP_HEADER` | `fly.toml [env]` | `Fly-Client-IP` |
| `FASTF1_CACHE_DIR` | Dockerfile `ENV` | `/tmp/fastf1` |
| `EXPOSE_API_DOCS` | — | unset, so `/docs`, `/redoc`, `/openapi.json` 404 |

## Backend container

**`backend/Dockerfile`**, built with the repo root as context:

- `python:3.12-slim-bookworm` with the patch version pinned.
- `requirements.txt` is copied and installed in its own layer, before the source, so a code-only
  change reuses the dependency layer.
- `backend/` → `/app/backend`, `frontend/data/circuits/` → `/app/frontend/data/circuits`.
  `WORKDIR /app/backend`.
- A non-root user runs the process.
- `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1",
  "--no-proxy-headers"]`. Explicit `--no-proxy-headers` means a stray `FORWARDED_ALLOW_IPS`
  can never turn the spoofable path back on.

**`.dockerignore`** at the repo root is an allow-list: `*`, then `!backend/` and
`!frontend/data/circuits/`, then `backend/.env`, `backend/.venv`, `backend/tests`,
`backend/cache`, `**/__pycache__` and `**/.pytest_cache` excluded again. A local `backend/.env`
can never be baked into an image, and the 30 MB of teardown PNGs and `node_modules` never enter
the build context.

**`fly.toml`** at the repo root (Fly builds from the directory holding it):

| Key | Value |
|---|---|
| `app`, `primary_region` | `<app>`, `iad` |
| `[build] dockerfile` | `backend/Dockerfile` |
| `[env]` | the `fly.toml [env]` rows of the Configuration table |
| `[http_service]` | `internal_port = 8080`, `force_https = true`, `auto_stop_machines = "off"`, `auto_start_machines = true`, `min_machines_running = 1` |
| `[[http_service.checks]]` | `GET /api/health`, interval 30 s, timeout 5 s, grace period 30 s |
| `[[vm]]` | `size = "shared-cpu-1x"`, `memory = "512mb"` |
| `swap_size_mb` | `512` |

Swap is a cushion, not capacity: a spike past 512 MB runs slowly instead of the machine being
killed for memory, which would cut every open stream and reset the guard.

### Sizing

Measured before the first deploy, in the local container, by reading
`/sys/fs/cgroup/memory.peak` after two concurrent briefings plus a `/standings` view and a
`/api/circuits/<id>/winners` call (≈4 Gemini calls).

| Peak | Action |
|---|---|
| < 400 MB | ship as configured |
| 400–512 MB | add `BRIEFING_MAX_CONCURRENT = "1"` to `[env]` |
| > 512 MB | stop and report; the 512 MB ceiling is fixed |

## Visitor-IP middleware

The one change to application code.

- **`backend/api/client_ip.py`** — a pure ASGI middleware constructed with a header name. On an
  `http` scope carrying that header, it strips the value and parses it with
  `ipaddress.ip_address` (v4 or v6). On success it sets `scope["client"] = (str(ip), 0)` in
  place, so `request.client.host`, and with it the guard, and uvicorn's access log all see the
  visitor. A missing or unparseable value leaves the scope untouched.
- **`config.py`** reads `CLIENT_IP_HEADER`. Unset or empty means off, so local dev is unchanged.
  A value that is not a valid HTTP header token warns and stays off, following the existing
  env-parsing pattern.
- **`create_app(expose_docs=..., client_ip_header=...)`** mounts it only when a header is
  configured; `main.py` passes the config value, as it already does for `EXPOSE_API_DOCS`.
- `api/guard.py` is untouched: it still keys on `request.client.host` and never parses a
  forwarding header itself.

Tests (pytest, `backend/tests/api/`):

| Case | Expectation |
|---|---|
| Header carries an IPv4 / IPv6 address | `request.client.host` is that address |
| Header absent, empty, or not an IP | client unchanged |
| `client_ip_header=None` | middleware not mounted |
| `CLIENT_IP_HEADER` not a token (`"Fly Client IP"`) | warns, resolves to `None` |
| Guard, two different header values | two separate per-IP allowances |
| Guard, one value across requests | one shared allowance |

## Deploy pipeline

**Backend — `.github/workflows/deploy.yml`.**

- Triggers: `workflow_run` on workflow `CI`, `types: [completed]`, `branches: [main]`, and
  `workflow_dispatch`.
- The job runs only when the run's `conclusion == 'success'` and its `event == 'push'`.
- It checks out `github.event.workflow_run.head_sha`, the exact commit CI passed, not `main`'s
  tip.
- It installs flyctl with `superfly/flyctl-actions/setup-flyctl`, pinned, and runs
  `flyctl deploy --remote-only --ha=false` using `FLY_API_TOKEN`.
- `concurrency: { group: deploy-backend, cancel-in-progress: false }`.

**Frontend — Vercel's Git integration**, production branch `main`.
`frontend/vercel.json` sets `"ignoreCommand": "[ \"$VERCEL_ENV\" != production ]"`, which exits
0, and so skips, for every non-production build. Vercel does not wait for CI, which holds only
while `main` moves through PRs.

**CI — new `container` job in `ci.yml`.**

- It builds the image with `docker build -f backend/Dockerfile .`.
- It boots the image with `GOOGLE_API_KEY=ci-dummy` and polls `/api/health` until it returns 200.
- Inside the container it asserts that `CIRCUIT_INDEX_PATH` and `CIRCUIT_COORDINATES_PATH`
  exist and that `/app/backend/.env` does not.

A broken Dockerfile or allow-list then fails on the PR, not in the deploy after merge.

**`make docker`** builds the image and runs it with `--env-file backend/.env` on
`localhost:8080`. It dispatches only, like the rest of the Makefile.

## Setup — owner-only steps

These need the owner's accounts, card or keys. The README runbook gives the exact commands.

1. `brew install flyctl`, `fly auth signup` (or `login`), add a card.
2. Choose `<app>` and `<project>`; `fly apps create <app>`.
3. `fly secrets set GOOGLE_API_KEY=… TAVILY_API_KEY=… OPENWEATHER_API_KEY=… --stage`.
4. `fly tokens create deploy`, then add it as GitHub repo secret `FLY_API_TOKEN`.
5. Vercel: sign in with GitHub, import `lawry98/f1-application`, root directory `frontend`, set
   the three Production env vars.

After step 2 the names are committed into `fly.toml` and `CORS_ORIGINS`. Claude runs the first
`fly deploy --ha=false` once the owner has logged in and approves it, then the checks below.

## Verification

**Before the first deploy (local container):**

- The image builds; `/app/backend/.env` is absent; the circuit index and coordinates are present.
- Sizing, as above.
- Middleware tests pass, and the full `make ci` suite is green.

**After the first deploy:**

| Check | Pass |
|---|---|
| `GET /api/health` | 200 |
| `GET /docs`, `/openapi.json` | 404 |
| CORS preflight, `Origin: https://<project>.vercel.app` | `access-control-allow-origin` echoes it |
| CORS preflight, any other origin | no `access-control-allow-origin` |
| Request with forged `Fly-Client-IP: 203.0.113.7` and `X-Forwarded-For: 203.0.113.7` | `fly logs` access line shows the real IP, not `203.0.113.7` |
| `fly machines list` | exactly one machine, 512 MB |
| Every sitemap route on the Vercel site | renders, no console errors |
| `og:image`, `robots.txt` `Sitemap:` | absolute, on `https://<project>.vercel.app` |
| `/candy` | not-found page |
| One real briefing from the Vercel site | events arrive progressively, not in one burst at the end (≈2 Gemini calls) |

## Documentation

- **README** — a "Deployment" section: the topology, the setup runbook, how to redeploy, and how
  to change a URL (rebuild the frontend, update `CORS_ORIGINS`).
- **CLAUDE.md** — a `CLIENT_IP_HEADER` row in the env table, and these traps:
  - uvicorn's `*` trusts the leftmost, client-supplied entry;
  - `.dockerignore` is an allow-list;
  - a `NEXT_PUBLIC_*` change needs a frontend rebuild;
  - `--ha=false` is what keeps one machine;
  - pnpm 11 on Vercel needs Corepack.
- **`backend/env.example`** — `CLIENT_IP_HEADER`, and the cost-guard comment's proxy advice
  corrected to match.
- **`docs/adr/0005-deploy-on-fly-and-vercel.md`** — the topology, the one-machine rule and the
  client-IP choice.

## Out of scope

- A custom domain.
- A separate Gemini key or project for production.
- Paid Gemini.
- Persistent guard state that survives restarts.
- Draining in-flight briefings on deploy.
- Path-gated backend deploys.
- Preview environments with their own backend.
- Monitoring or alerting beyond Fly's health check.
