---
status: accepted
---

# The API runs on one always-on Fly machine, the frontend on Vercel Hobby

The app goes public as a portfolio site on a budget of about $5 a month. `frontend/` builds on
Vercel Hobby from `main` only, which is free for non-commercial use. The API is a single Fly.io
`shared-cpu-1x` machine with 512 MB in `iad`, always on, at $3.69 per 30 days plus $0.02/GB
outbound; Fly has no free tier and needs a card on file.

The browser calls the API directly, because no server component imports `lib/api.ts`. So the API
is publicly reachable, `CORS_ORIGINS` must name the Vercel origin, and `NEXT_PUBLIC_API_URL` is
inlined into the client bundle at `pnpm build`: moving either end means a frontend rebuild and a
backend deploy. Preview deploys are off for the same reason, since a preview's origin is never in
`CORS_ORIGINS` and its briefings would fail.

## One machine, one worker

The cost guard (`api/guard.py`) keeps the per-IP hours, the UTC-day count and the concurrency
slots in process memory. A second worker or a second machine would each allow the full limits,
and the two would never agree. So there is exactly one of each:

- one uvicorn worker, `--workers 1` in the image's command;
- `--ha=false` on every `fly deploy`, because Fly's first deploy otherwise creates two machines
  and no `fly.toml` key turns that off;
- `auto_stop_machines = "off"`, so the one machine never stops;
- `[deploy] strategy = "rolling"`, the default written out, which updates that machine in place
  (`canary` and `bluegreen` would boot a second).

512 MB is the budget's ceiling, and the API fits well inside it. In the local container it idled
at 122 MB and peaked at 155 MB running two briefings' tool fan-outs at once against the real
OpenF1 and FastF1, plus a standings view and a circuit-winners call, with Gemini unreachable and
no swap touched. That was arm64 and Fly runs amd64, so the first real briefing re-reads the peak
on the machine.

## The visitor's address comes from `Fly-Client-IP`

The guard keys on `request.client.host`, which behind Fly's proxy is the proxy, so every visitor
would share one hourly allowance. uvicorn's `--proxy-headers` fixes that only with
`FORWARDED_ALLOW_IPS` set to the proxy's exact address, and Fly does not document one. The value
that works without it, `*`, makes uvicorn take the leftmost `X-Forwarded-For` entry, which is the
one the visitor writes, so each forged header buys a fresh allowance. That is in the pinned
uvicorn 0.40's source (`get_trusted_client_host` returns `x_forwarded_for_hosts[0]`) and is
unchanged in 0.54. Fly's edge keeps a forged `X-Forwarded-For` leftmost and appends the real
address after it.

So `CLIENT_IP_HEADER=Fly-Client-IP` mounts `api/client_ip.py`, which takes exactly one plain
address from that one header, and the image runs uvicorn with `--no-proxy-headers`. uvicorn's
proxy handling is on by default, and the flag keeps a stray `FORWARDED_ALLOW_IPS` from switching
the leftmost-entry path back on.

This rests on behaviour Fly does not document. Its docs describe `Fly-Client-IP` as the client's
address as Fly's proxy saw it, and say nothing about a value the client sends. On 2026-10-13 a
request to Fly's own echo app sent a forged one, once and then twice, and got back exactly one
header carrying the real address. Because that is observed and not promised, the forged-header
check that `scripts/deploy-wizard.sh` runs after the first deploy is what proves it. If Fly ever
passes a forged value through, the per-IP limit is spoofable and only `BRIEFING_DAILY_CAP` holds.

## Deploys wait for CI

`.github/workflows/deploy.yml` runs on `workflow_run` when `CI` completes on `main`. It deploys
only after a successful run that a push triggered, and it checks out that run's `head_sha`, the
commit CI passed, which `main`'s tip may already have moved past. A manual run may deploy only
`main`. Vercel's Git integration builds the frontend by itself and does not wait for CI, which is
safe only while `main` changes through pull requests.

## Why not the alternatives

- **Railway or Render.** Neither documented a header its edge sets to the client's address, or
  its proxy's address (checked 2026-10-01), so the per-IP limit would have had to trust
  `X-Forwarded-For`. Fly was the only candidate that documented one.
- **`--proxy-headers` with `FORWARDED_ALLOW_IPS='*'`.** The leftmost entry wins, so the limit is
  one forged header away from meaning nothing.
- **Two machines**, Fly's default. Each would hold its own guard and allow the full limits.
  Sharing the state needs a store outside the process: a second service and a guard rewrite, for
  a portfolio's traffic.
- **Deploying the backend only when backend files change.** It would spare the guard a reset on a
  frontend-only merge. But the image also depends on `frontend/data/circuits/`, `fly.toml` and
  `.dockerignore`, so the filter is one more list to keep in step, and a miss ships a stale API.
  The reset it saves is harmless under the free Gemini tier.
- **A separate Gemini key or project for production** was left out of the first deploy. The site
  shares local development's free-tier key. Google's daily quota is the hard stop, so nothing can
  bill, and `BRIEFING_DAILY_CAP=8` at two calls a briefing keeps the site to 16 of the roughly 20
  calls a day. Local work gets what is left.

## What we accepted

- **A restart resets the guard.** Every deploy restarts the process, and every merge to `main`
  deploys, frontend-only ones included, so the day's count and every IP's hour start again.
  Google's quota is still the hard stop.
- **A deploy cuts open streams.** Nothing drains them; a cut briefing lands in the page's
  "connection dropped" state, with Try again.
- **Requests that never cross Fly's edge carry any `Fly-Client-IP` they like.** That is 6PN
  callers inside the organisation and Fly's health checker, and only organisation members can
  send them.
- **An IPv6 visitor can rotate addresses inside their /64** and get a fresh hourly allowance for
  each. `BRIEFING_DAILY_CAP` is the real ceiling there.
