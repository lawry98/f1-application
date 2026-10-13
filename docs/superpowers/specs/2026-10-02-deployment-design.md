# Deployment — design

**Date:** 2026-10-02 · **Branch:** `lc/application-deployment-d233e8` (off `main` at `62d901a`) · **Status:** approved 2026-10-02; revalidated 2026-10-13 against `main` at `1613609` — see [Revalidated 2026-10-13](#revalidated-2026-10-13), which overrides the sections above where they disagree

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

## Revalidated 2026-10-13

Re-checked before implementation, against `main` at `1613609` and each platform's current primary
sources. The evidence, with a URL or file and line for every claim, is in
[the research notes](../research/2026-10-13-deployment-platforms.md). Where this section and the
sections above disagree, this section wins. No decision was re-brainstormed; each change below
cites the evidence that forced it.

### What `main` changed since `62d901a`

| Change | Effect on this design |
|---|---|
| #54/#55: Gemini's server deadline is the run's `BRIEFING_DEADLINE_SECONDS`; the planner reads 2 × 15s at low thinking; the synthesizer reads 1 × 30s with one 503 retry when it fits | None. The worst case is still 87s ≤ the 90s deadline, so `BRIEFING_DEADLINE_SECONDS` stays at its default. A stream is never idle for 60s: sse-starlette pings every 15s (`DEFAULT_PING_INTERVAL = 15`, unchanged in 3.1.2). |
| Saved example briefings (sibling branch `lc/example-briefings`, unmerged) | None for the image. The examples are static frontend data (`frontend/data/briefing-examples/`) that Vercel serves; the backend never reads them. Their capture script lives in `backend/scripts/`, which the image excludes anyway. |
| `main`'s CI has been red since 2026-10-05 | Eight weather tests read the real clock against a fixed 2–4 Oct 2026 weekend. `deploy.yml` only runs after a green CI on `main`, so nothing could ever deploy. This branch carries the sibling's fix (`44276b4`, cherry-picked); whichever merges first, the other's merge is a no-op. |

### Decisions changed

| # | Was | Now | Why |
|---|---|---|---|
| R1 | Finding 1 quotes Fly-Client-IP as "always set by the Fly Proxy" | Fly documents it as "the IP address of the client from the perspective of Fly Proxy"; "always set" is said of `Fly-Forwarded-Port`. Decision unchanged: read `Fly-Client-IP`. | A live request to Fly's own echo app (`debug.fly.dev`, 2026-10-13) sent a forged `Fly-Client-IP` (once, and twice) and got exactly one header back carrying the real address. A forged `X-Forwarded-For` was kept leftmost with the real address appended; `X-Real-IP` passed through untouched. The overwrite is **observed, not documented**, so the post-deploy forged-header check stays and is the proof. |
| R2 | Base image `python:3.12-slim-bookworm`, patch pinned | `python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1` | `3.12-slim` is now trixie (Debian 13); bookworm left regular security support for LTS on 2026-06-11. Tag *and* digest, so a rebuild is the same image until someone edits the line. |
| R3 | Vercel env `ENABLE_EXPERIMENTAL_COREPACK=1` (Finding 6) | **Removed.** pnpm 11 comes from `frontend/package.json`'s `packageManager` field, with no Corepack. | Vercel enables Corepack from the **repo-root** `package.json` (docs, and `initCorepack` in Vercel's source), and this repo has none. With the variable set, Corepack does not start *and* Vercel's own pin path is switched off, leaving the image's default pnpm. Without it, `@vercel/build-utils` ≥ 14.3.0 honours `packageManager: pnpm@11.x` for a `lockfileVersion: '9.0'` lockfile, and pnpm 11's `pmOnFail: download` then runs exactly 11.8.0. Vercel's docs page still says pnpm 6–10; the code is ahead of it, so the first build log is checked (V1). |
| R4 | `frontend/vercel.json` = `ignoreCommand` only | `git.deploymentEnabled: {"**": false, "main": true}` **plus** the `ignoreCommand` as a backstop | A skipped `ignoreCommand` build still creates a (cancelled) deployment that counts against Hobby's 100 a day; `deploymentEnabled` stops it being created. The catch-all must be `**`: minimatch's `*` does not match `lc/…` or `dependabot/…/…` (measured). `ignoreCommand` stays for CLI and dashboard deploys, which are not Git pushes. It fails closed: with "Automatically expose System Environment Variables" off, `VERCEL_ENV` is empty and production is skipped too, so the wizard checks that setting. |
| R5 | `swap_size_mb` listed last in the fly.toml table | Top-level, above the first `[table]` | TOML: a key after a table header belongs to that table. |
| R6 | `min_machines_running = 1` (credited in Finding 7) | Dropped | Fly documents it as applying only when `auto_stop_machines` is `"stop"` or `"suspend"`; under `"off"` it does nothing. `--ha=false` and `auto_stop_machines = "off"` are what keep exactly one machine, always on. |
| R7 | No `[deploy]` table | `[deploy] strategy = "rolling"` | Already the default, and with one machine it updates that machine in place, then waits for health checks. Explicit, so a change of default can never boot a second machine (only `canary` and `bluegreen` do). |
| R8 | — | `[http_service.http_options] compress = false` | Fly's proxy compresses by default and documents that it "buffers responses before compressing them", which "can break HTML streaming". Whether it compresses `text/event-stream` is undocumented. The backend serves small JSON, so switching compression off costs nothing measurable. `compress` is in fly-go's `HTTPOptions` and confirmed by a Fly-side forum reply, but absent from the config reference — so V3 checks the stream has no `content-encoding`, and the documented per-response fallback (`Content-Encoding: none`) is held in reserve. |
| R9 | "Fly builds from the directory holding it" | The build context is the working directory `flyctl deploy` runs in; `[build] dockerfile` resolves relative to fly.toml's directory | flyctl source (`resolveDockerfilePath`, `readDockerignore`). Both are the repo root here, locally and in CI. No `[build] ignorefile`: the default (Depot) build path ignores it and reads the context root's `.dockerignore`. |
| R10 | Deploy job runs when `conclusion == 'success' && event == 'push'`, checks out `workflow_run.head_sha` | `if: (github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') \|\| (… == 'success' && … == 'push')`; ref `${{ github.event.workflow_run.head_sha \|\| github.sha }}` | On `workflow_dispatch` there is no `workflow_run` object, so the original condition skipped every manual run and the ref was empty. A manual run may only deploy `main`. |
| R11 | "Until `FLY_API_TOKEN` exists it must skip" (task brief) — mechanism unstated | Job-level `env: FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}`; every step after a `::notice::` is gated on `env.FLY_API_TOKEN != ''` | GitHub forbids `secrets` in `if:`, and a job-level `if` cannot see `env`. A missing secret reads as an empty string, so the job runs green with its deploy steps skipped. |
| R12 | `setup-flyctl`, "pinned" | `superfly/flyctl-actions/setup-flyctl@ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1  # 1.6` with `version: 0.4.115`; `actions/checkout@v7` in the new workflow | Release `1.5` (the newest GitHub *Release*) is a Node 20 action, and Node 20 left the runners on 2026-09-23; tag `1.6` is Node 24. flyctl `0.4.115` is an exact release from 2026-10-08 (flyctl ships almost daily; the README says pin it). The new `container` job in `ci.yml` keeps the file's existing `checkout@v4`, which still runs (forced onto Node 24); bumping every action in `ci.yml` is its own change. |
| R13 | `fly tokens create deploy` | `fly tokens create deploy -a <app> -x 8760h`, piped straight into `gh secret set FLY_API_TOKEN` | The default expiry is 20 years and Fly recommends shorter. One year, and the token is never printed. An expired token fails the deploy job loudly (it is non-empty), which is the reminder to rotate. |
| R14 | `.dockerignore` excludes `.env`, `.venv`, `tests`, `cache`, `__pycache__`, `.pytest_cache` | Also `backend/scripts`, `**/.coverage*`, `**/.ruff_cache` | Nothing in them runs in production. `scripts/` holds the fixture and example capture tools, which import from `tests/`. |

### Middleware details, from the source

| Question | Choice | Why |
|---|---|---|
| Where in the stack? | Outermost user middleware: added after `add_cors(app)` | `add_middleware` inserts at position 0, so the last added is outermost (`starlette/applications.py`). CORS answers a preflight without calling the inner app, so inside it every `OPTIONS` access line would show the proxy. |
| Does rewriting `scope["client"]` change uvicorn's access log? | Yes, when rewritten **in place** | The protocol seeds the scope from the socket, then logs from that same dict at response start (`httptools_impl.py` L225–230 and L482–490; `h11_impl.py` the same). The line reads `<ip>:0`. |
| Header name matching | Lowercased `bytes`, compared against the lowercased configured name | uvicorn lowercases header names; ASGI says "should". |
| The header appears more than once | Leave the scope untouched | Fly's edge always sends exactly one (R1), so a repeat means the request did not come through the edge — a caller on the private network, which can write any value. |
| `fe80::1%eth0` (a zone) | Leave the scope untouched | A zone means nothing in a client header, and `str()` keeps it, which would make one visitor several keys. |
| `::ffff:1.2.3.4` | Key as `1.2.3.4` (`ip.ipv4_mapped or ip`) | One visitor, one allowance, whichever spelling arrives. `str(ip)` is used, never the raw text, so `2001:DB8::1` and `2001:db8::1` share one too. |
| Whitespace | Stripped before parsing | `ipaddress` rejects a leading space. |
| Invalid `CLIENT_IP_HEADER` | Warn, off | RFC 9110 §5.6.2 `token = 1*tchar`; `"Fly Client IP"` fails on its spaces. Same pattern as the other env parsing. |

### Known limits, recorded rather than fixed

- **An IPv6 visitor can rotate addresses inside their /64** and get a fresh hourly allowance for each.
  `BRIEFING_DAILY_CAP=8` is the real ceiling, and the guard's `max_tracked_ips` bounds memory.
  Keying the guard by /64 is a guard change, out of scope.
- **Requests that do not cross Fly's edge carry no proxy-set `Fly-Client-IP`**: 6PN/`.internal`
  callers inside the org and the health checker. Only org members can send them.
- **With proxy headers off, `scope["scheme"]` is `http`**, so a Starlette trailing-slash redirect
  would point at `http://<app>.fly.dev/…` (and `force_https` would bounce it back). No frontend path
  has a trailing slash, so nothing reaches it today.
- **iOS/WebKit over Fly's HTTP/2 edge** may receive small SSE events seconds late, until the next
  ping (one community report, 2026-07, no Fly reply; workaround `alpn = ["http/1.1"]`). The 15s ping
  bounds it. Not acted on without a reproduction.
- **Vercel Hobby** also caps image transformations at 5,000 a month and deployments at 100 a day;
  over a limit the feature pauses for 30 days and nothing bills. Hobby content may be used for model
  training unless opted out in the team's settings — the wizard points at the toggle.

### Names, chosen

| Question | Choice | Why |
|---|---|---|
| `<app>` | `f1-race-briefing-api` → `https://f1-race-briefing-api.fly.dev` | No DNS for it on 2026-10-13. `fly apps create` is the real test; on a clash the wizard takes another name and rewrites fly.toml. |
| `<project>` | `f1-race-briefing` → `https://f1-race-briefing.vercel.app` | `DEPLOYMENT_NOT_FOUND` on 2026-10-13. Vercel assigns a suffixed domain on a clash, so the wizard reads the real one back before writing `CORS_ORIGINS` and `NEXT_PUBLIC_SITE_URL`. |

### Sizing, under a zero-Gemini budget

This implementation runs with no Gemini budget, so the ≈4-call sizing load above cannot run. It is
replaced by the heaviest load reachable without one: the container runs with a dummy
`GOOGLE_API_KEY` **and** `--add-host generativelanguage.googleapis.com:127.0.0.1`, so no request
reaches Google at all; the planner then degrades to `DEFAULT_TOOLS` and the full tool fan-out runs
against the real OpenF1/FastF1. Two such briefings run concurrently, plus a `/api/standings` and an
`/api/circuits/<id>/winners`, under `--memory 512m --memory-swap 1g`, then `memory.peak` is read.
What it misses is the synthesizer's own allocation: one prompt of tool JSON (~tens of KB) and the
streamed reply — small next to the pandas/FastF1 fan-out. The local container is arm64 (Colima);
Fly's is amd64, built by the CI `container` job. The thresholds in Sizing apply unchanged, and the
first post-deploy briefing re-reads the peak on the real machine (`fly ssh console -C "cat
/sys/fs/cgroup/memory.peak"`, V5).

### Verification, added

| # | Check | Pass |
|---|---|---|
| V1 | Vercel's first build log | contains ``Detected `pnpm-lock.yaml` version 9 generated by pnpm@11.x from package.json#packageManager pnpm@11.8.0`` |
| V2 | The next push to any `lc/…` branch | no Preview deployment appears in Vercel |
| V3 | `curl -N` the briefing stream with `Accept-Encoding: gzip, br, zstd` | no `content-encoding` header, and events arrive spread over the run |
| V4 | Forged `Fly-Client-IP` + `X-Forwarded-For` request (the original row) | the guard's and the access log's address is the real one — now the only proof of R1 |
| V5 | `memory.peak` on the Fly machine after the first real briefing | under the Sizing thresholds |

### Self-review decisions (no human in the loop)

The implementation brief ran without a reviewer to ask, so each open question was decided here:

| Question | Choice | Why |
|---|---|---|
| SSE compression: check only, or pre-empt? | Pre-empt with `compress = false`, and check (V3) | Zero app code, nothing to lose on small JSON; the check catches it if the undocumented key is ignored. |
| Middleware on a repeated header: last value, or refuse? | Refuse (scope untouched) | Fly sends one; a repeat is off-edge by construction (R1). |
| Bump `ci.yml`'s Node 20 action majors here? | No; flagged as its own change | It touches every job; this branch adds one. |
| Where the research lives | `docs/superpowers/research/` (new) | The repo had no research-notes convention; it sits beside `specs/` and `plans/`. |
