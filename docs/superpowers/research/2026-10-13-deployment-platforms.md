# Deployment platforms — revalidation research, 2026-10-13

Primary-source checks behind the "Revalidated 2026-10-13" section of
[the deployment spec](../specs/2026-10-02-deployment-design.md). Three parts, researched in
parallel the same day: Fly.io, Vercel, and the runtime/CI pieces (uvicorn, sse-starlette, the base
image, GitHub Actions, Python's `ipaddress`, RFC 9110). Every claim carries the URL or file and line
it came from. `SP/` means the backend venv's `site-packages/` at the pinned versions in
`backend/requirements.txt`. Documentation-range addresses (`203.0.113.0/24`) are test values; the
real addresses seen in the live Fly test are redacted.

- [Part 1 — Fly.io](#part-1--flyio)
- [Part 2 — Vercel](#part-2--vercel)
- [Part 3 — Runtime and CI](#part-3--runtime-and-ci)

---

# Part 1 — Fly.io


Spec under review: `docs/superpowers/specs/2026-10-02-deployment-design.md`.

Every source here was fetched on 2026-10-13. Fly's docs now live on Mintlify at `docs.fly.io`
(`fly.io/docs/...` 301-redirects there), and each page can be fetched as raw Markdown by adding `.md`.
Code references are pinned to:

- `superfly/flyctl` master at `9068e6f4631c92f168476a9883df020d0ce12cd9`, with latest release `v0.4.116`, published 2026-10-12
- `superfly/fly-go` master at `9cd555203a0f329e698f30205a112a26bde8130a`
- `superfly/docs` (the Mintlify source; its whole history starts at `8f45520ceb`, 2026-09-17)

---

## 1. `Fly-Client-IP` and `X-Forwarded-For`

**Verdict: CHANGED (the quote), CONFIRMED (the behaviour, by live test).** The docs never said
Fly-Client-IP is "always set by the Fly Proxy". That phrase belongs to `Fly-Forwarded-Port`. The
docs also do not say whether a client-supplied Fly-Client-IP is overwritten. A live test today shows
the proxy **replaces** it, and **appends** to X-Forwarded-For.

Evidence:

- https://docs.fly.io/networking/request-headers (source: `superfly/docs` `networking/request-headers.mdx`):
  - Fly-Client-IP: "The IP address of the client from the perspective of Fly Proxy. If you are using
    another reverse proxy service in front of the Fly.io platform, this header will be set to proxy
    service's IP addresses…". The page does not say "always set".
  - Fly-Forwarded-Port: "This header is **always set by the Fly Proxy**…". This is where the spec's
    quote comes from.
  - X-Forwarded-For: "the last address (rightmost) in this list will be a shared or dedicated IP
    address assigned to your app. This header must be treated with caution to avoid spoofing
    attempts… If you aren't using another reverse proxy in front of the Fly.io platform, the
    `Fly-Client-IP` header might be a better choice."
  - X-Forwarded-Port: "may be set by the client".
- https://docs.fly.io/networking/services (header table): Fly-Client-IP is "The IP address Fly.io
  accepted a connection from", and Fly-Forwarded-Port is "always set by Fly.io".
- Fly employee PeterCxy (Discourse group `employee`), 2024-07-24,
  https://community.fly.io/t/minor-doc-correction/20944: "if you aren't using any other proxy… in
  front of Fly, then Fly-Client-IP would be the best header… (because Fly-Client-IP will point to the
  proxy in this case, as we don't know which proxies we are supposed to trust… when we parse
  X-Forwarded-For to set Fly-Client-IP)".
- Community test, 2022, https://community.fly.io/t/recommended-setting-for-trust-proxy-on-express/6346:
  a forged `X-Forwarded-For: 1.2.3.4` arrived as `1.2.3.4, <real ip>` (appended). That test did not
  forge Fly-Client-IP.
- **Live test today** against Fly's own echo app `https://debug.fly.dev/`, run once over HTTP/2 and
  once over HTTP/1.1 (real IPs redacted):
  - Sent `Fly-Client-IP: 203.0.113.7`, `X-Forwarded-For: 203.0.113.8` and `X-Real-IP: 203.0.113.9`. Received:
    - exactly one `Fly-Client-Ip: <real ip>`. The forged value was replaced.
    - `X-Forwarded-For: 203.0.113.8, <real ip>, 37.16.x.x`. The forged value was kept leftmost,
      the real IP was appended, and a Fly anycast address sits rightmost.
    - `X-Real-Ip: 203.0.113.9`. This header passes through untouched, so never trust it.
  - Sent two forged headers, `fly-client-ip: 203.0.113.7` and `Fly-Client-IP: 203.0.113.10`.
    Received one Fly-Client-IP header, carrying neither forged value.

Implication: reading `Fly-Client-IP` is sound when Fly's edge is the only proxy, which matches the
spec's verdict. One residual gap: traffic that does not cross the edge has no proxy-set value.
That covers 6PN/`.internal` callers inside the org and the health checker. Such a request could
carry any Fly-Client-IP, but only org members can send it. Keep the spec's post-deploy forged-header
check, because the overwrite is observed behaviour, not documented.

## 2. `fly deploy --ha=false`

**Verdict: CONFIRMED. No fly.toml equivalent exists.**

- https://docs.fly.io/apps/app-availability: on first deploy Fly Launch "creates and starts two
  Machines for process groups with services, sets automatic start and stop to true and minimum
  machines running to zero". To turn that off, use `fly deploy --ha=false`: "Create one Machine on
  first deploy or when your app is scaled down to zero Machines". The fallback is `fly scale count 1`.
- https://docs.fly.io/flyctl/cmd/fly_deploy: `--ha   Create spare machines that increases app
  availability (default true)`.
- flyctl source: `deploy.go` defines the flag `"ha"`, read at `IncreasedAvailability:
  flag.GetBool(ctx, "ha")`. `internal/appconfig/config.go` has no HA or count key among its
  top-level TOML fields. Keeping `--ha=false` in the CI command is right: it only matters when the
  app has zero Machines, for example after someone destroys the Machine.

## 3. fly.toml schema

**Verdict: CONFIRMED with corrections.**

- `auto_stop_machines` takes a string: `"off"`, `"stop"` or `"suspend"`. Booleans are still accepted
  for backward compatibility.
- `swap_size_mb` is top-level and still supported. Because it is a TOML top-level key, it must
  appear before the first `[table]`. Listed last, as in the spec's table, it would be parsed as a
  key of the preceding table.
- `min_machines_running` only applies when autostop is `"stop"` or `"suspend"`, so with `"off"` it
  does nothing.
- `memory = "512mb"` is the documented form. `memory_mb = 512` also parses.

Evidence, from https://docs.fly.io/reference/configuration unless marked otherwise:

- `app = "restless-fire-6276"`, `primary_region = "ord"`.
- swap: "Setting this option enables Linux swap on Machines… `swap_size_mb = 512`", placed under
  "Runtime options… placed at the top level". flyctl `config.go:56`: `SwapSizeMB *int
  toml:"swap_size_mb"` on the root `Config`.
- `[build] dockerfile`: "accepts a relative path to a Dockerfile, or a URL… This option will not
  change the Docker context path". The docs do not say what the path is relative to. flyctl
  `deploy_build.go:293-305`, `resolveDockerfilePath`, joins it to
  `filepath.Dir(appConfig.ConfigFilePath())`, so it is **relative to fly.toml's directory**.
- `[env]`: "Env values can only be strings… cannot begin with FLY_… Secrets take precedence over env
  variables with the same name."
- `[http_service]` fields:
  - `internal_port`: default 8080.
  - `force_https`: "A Boolean".
  - `auto_stop_machines`: 'Options are "off", "stop", or "suspend"… The default if not set is "off".'
  - `auto_start_machines`: "The default if not set is true."
  - `min_machines_running`: "The number of Machines to keep running… when auto_stop_machines is
    'stop' or 'suspend'."
  - The docs also say: "We recommend configuring auto_stop_machines and auto_start_machines so that
    they are both enabled or both disabled." The spec's `"off"` plus `true` departs from that on
    purpose, and that is defensible: if the Machine ever stops, for example after `on-fail` restart
    retries run out, the proxy restarts it on the next request.
- fly-go `machine_types.go:1252-1286`, `MachineAutostop.UnmarshalJSON`, accepts `true` (stop),
  `false` (off), `"off"`, `"stop"` and `"suspend"`, and nothing else.
- `[[http_service.checks]]`: example `grace_period = "10s"`, `interval = "30s"`, `method = "GET"`,
  `timeout = "5s"`, `path = "/"`. "Times are in milliseconds unless units are specified." The check
  "runs against the service on the Machine over the app's private network", so `force_https`, which
  is an edge redirect, does not affect it. flyctl `service.go:34-46` uses exactly these TOML names.
- `[[vm]]`: `size = "shared-cpu-1x"`. Memory "can be expressed with units, like… `memory =
  "512mb"`… or an integer… with MB as the default unit". "size has lower precedence than all other
  keys", so `memory` overrides the preset's 256 MB. flyctl `config.go:209-214`: `Compute{Size,
  Memory, *fly.MachineGuest inline}`, so `memory_mb` comes through `MachineGuest`. Both are in the
  flyctl fixture `internal/appconfig/testdata/full-reference.toml`.
- `[deploy] strategy`: see item 11.

A correct example. It parses with Python's `tomllib` to the intended structure. flyctl is not
installed here, so `fly config validate` has not been run.

```toml
app = "f1-briefing-api"
primary_region = "iad"
swap_size_mb = 512            # top-level: must stay above the first [table]

[build]
  dockerfile = "backend/Dockerfile"   # relative to this file's directory

[deploy]
  strategy = "rolling"        # the default today; explicit so a default change can't add a 2nd machine

[env]
  CLIENT_IP_HEADER = "Fly-Client-IP"
  CORS_ORIGINS = "https://<project>.vercel.app"
  BRIEFING_DAILY_CAP = "8"    # [env] values must be strings
  BRIEFING_PER_IP_PER_HOUR = "3"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1    # no-op while auto_stop_machines = "off"; harmless

  [[http_service.checks]]
    grace_period = "30s"
    interval = "30s"
    method = "GET"
    path = "/api/health"
    timeout = "5s"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

## 4. Proxy idle timeout of 60 s

**Verdict: CONFIRMED, from staff forum posts. The docs are silent on the default, and the timeout
is now configurable.**

- Fly staff, all with Discourse `staff=true`:
  - jerome, 2021-08-29, https://community.fly.io/t/does-the-tls-handler-close-idle-tcp-connections-after-60s/2373:
    "60s is our timeout for connections. If nothing in our out has been sent or received through them
    for 60s, then we close them. This is true of any TCP connection."
  - jerome, 2022-06-15/27, https://community.fly.io/t/request-timeouts-on-fly-io/5653: "60 seconds
    without any data being sent or received will cause the connection to be closed". Streams are
    fine "As long as they send something within 60 seconds of the last sent packet".
  - kurt, 2021-09-23, https://community.fly.io/t/increasing-idle-timeout/2619: "The 60s timeout
    resets if any data comes back."
- https://docs.fly.io/reference/configuration now documents `[http_service.http_options]
  idle_timeout = 600` ("Configure an idle-timeout for connections to your app"), with no default
  stated. fly-go `HTTPOptions.IdleTimeout *uint32` (`machine_types.go:766`).
- For the spec: sse-starlette 3.1.2, the version pinned in `backend/requirements.txt`, has
  `DEFAULT_PING_INTERVAL = 15`, which keeps the connection well inside 60 s. No change is needed.
  `idle_timeout` is available if more margin is ever wanted.

## 5. `superfly/flyctl-actions/setup-flyctl` and the CD guide

**Verdict: CONFIRMED, with a new pin.** The newest tag is `1.6`, which is also `v1` and `1`, and it
points at the current master commit `ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1` (2026-04-08, PR #108,
node24 runtime). The latest GitHub *Release* object is older: `1.5`, at `fc53c09e…`, published
2024-02-02, which still runs on `node20`.

- Pulled with `gh api` from `repos/superfly/flyctl-actions`:
  - tags: `1.6`, `v1` and `1` → `ed8efb33…`; `1.5` → `fc53c09e1bc3be6f54706524e3b82c4f462f77be`.
  - releases: newest is `1.5`, published 2024-02-02.
  - master HEAD is `ed8efb33…`.
- `setup-flyctl/action.yml` at master: `runs: using: node24`. Input `version`: "If unspecified or set
  to 'latest', the latest version… will be installed. Example: '0.0.306'". The default is `latest`.
  The same file at tag `1.5` says `using: node20`.
- README (https://github.com/superfly/flyctl-actions): "For production deployments, pin flyctl to a
  specific version". Usage is `uses: superfly/flyctl-actions/setup-flyctl@master` with `with:
  version: 0.0.462`, plus `flyctl deploy --remote-only` and `env: FLY_API_TOKEN: ${{
  secrets.FLY_API_TOKEN }}`.
- https://docs.fly.io/launch/continuous-deployment-with-github-actions:
  - Secret name `FLY_API_TOKEN`, created with `fly tokens create deploy -x 999999h` ("copy… including
    the `FlyV1` and space at the beginning").
  - Steps `- uses: superfly/flyctl-actions/setup-flyctl@master` and `- run: flyctl deploy
    --remote-only`.
  - `concurrency: deploy-group`.
  - The guide's own setup uses `fly launch --no-deploy`.
- https://docs.fly.io/flyctl/cmd/fly_deploy: `--remote-only` "This is the default. Use --local-only
  to build locally." The flag is therefore redundant but harmless.
- Recommended step:
  `uses: superfly/flyctl-actions/setup-flyctl@ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1 # 1.6`
  with `with: version: 0.4.115`. That is an exact flyctl release from 2026-10-08. `v0.4.116` is one
  day old, and flyctl ships almost daily.

## 6. `fly tokens create deploy`

**Verdict: CONFIRMED.** The token is scoped to one app, and the default expiry is 20 years.

- https://docs.fly.io/flyctl/cmd/fly_tokens_create_deploy: "Create an API token limited to managing a
  single app and its resources… Tokens are valid for 20 years by default. We recommend using a
  shorter expiry if practical."
  - Flags: `-a, --app`, `-c, --config`, `-x, --expiry duration (default 175200h0m0s)`, `-n, --name
    (default "flyctl deploy token")`.
  - Without `-a`, the app comes from `fly.toml` in the working directory.
- https://docs.fly.io/security/tokens: "App-scoped tokens are limited to managing a single app and its
  resources. Some organization-wide features like managing WireGuard tunnels… are also accessible to
  deploy tokens."
- For the spec: write `fly tokens create deploy -a <app> -x <duration>`.

## 7. `fly secrets set --stage`, `fly apps create`, `fly launch --no-deploy`

**Verdict: CONFIRMED.**

- https://docs.fly.io/flyctl/cmd/fly_secrets_set: `--stage   Set secrets but skip deployment for
  machine apps`.
- https://docs.fly.io/apps/secrets: "the staged secret will be available only on Machines that are
  started or updated after the `fly secrets set` command was run… the `fly secrets deploy` command
  will redeploy the current release with the staged secrets." The first `fly deploy` creates the
  Machine, so it gets the staged secrets.
- https://docs.fly.io/flyctl/cmd/fly_apps_create: usage `fly apps create <app name> [flags]`. It
  also accepts `--name`, `-o/--org` and `--save`. "This command won't generate a fly.toml".
- https://docs.fly.io/flyctl/cmd/fly_launch:
  - `--no-deploy`: "Do not immediately deploy the new app after fly launch creates and configures it".
  - `--copy-config`: "Use the configuration file if present without prompting".
  - `--no-github-workflow`: "Skip automatically provisioning a GitHub fly deploy workflow".
  - `--auto-stop` defaults to `"stop"`.

  The CD guide prefers `fly launch --no-deploy`. With a hand-written, committed fly.toml, `fly apps
  create <app>` is cleaner: `fly launch` can rewrite config, generate files and provision a workflow.
  Keep the spec's command.

## 8. Pricing and payment

**Verdict: CONFIRMED.** `shared-cpu-1x` with 512 MB in `iad` costs **$3.69 per 30 days**. A card is
required, and there is no free allowance.

- https://docs.fly.io/about/pricing:
  - "Started Machine, `shared-cpu-1x` with 512MB RAM | $3.69/month". Prices are for `iad`/`ewr`,
    "the lowest-priced regions".
  - "Monthly Machine prices assume 30 days… an always-on Machine costs slightly more in a 31-day
    month", which is about $3.81.
  - Outbound data is $0.02/GB in North America. Shared IPv4 and IPv6 are free, and dedicated IPv4
    is an optional $2/month. https://docs.fly.io/launch/deploy confirms that a deploy provisions
    "a public IPv6 and a shared public IPv4".
  - "Is there a free tier? No. New organizations don't have a free tier or a monthly free usage
    allowance."
  - "All organizations (except for Linked Organizations) require a credit card on file."
- https://docs.fly.io/about/free-trial: the trial is "2 hours of machine runtime or 7 days", and
  "Trial Machines are set to automatically stop after running for 5 minutes". An always-on Machine
  therefore needs the card, as setup step 1 says. "adding a card ends the free trial."
- https://docs.fly.io/about/billing: without a card, prepaid credits are possible, with a $25
  minimum.

## 9. Restart and OOM behaviour, and swap

**Verdict: CONFIRMED. Swap is still documented and still recommended for brief spikes.**

- https://docs.fly.io/machines/guides-examples/machine-restart-policy: "`on-fail`… Try up to
  `max_retries` (default 10) times within a 5-minute window… if it exits with a non-zero exit code…
  `on-fail` is the default… for Machines created by `fly launch` and `fly deploy`." fly.toml can
  override it with `[[restart]] policy/retries`.
- https://docs.fly.io/getting-started/troubleshooting: "If your app OOMs, the Machine crashes and
  health checks fail by definition… Look for OOM kill events. Fix: add memory". Also: "OOM kills
  look like crashes to the proxy."
- https://docs.fly.io/reference/configuration (swap): "Swapping to disk can help avoid out-of-memory
  crashes on brief spikes in memory use. Swap is much slower than RAM, so if performance is important,
  a better solution is to increase the Machine memory". This matches the spec's "cushion, not
  capacity" wording.
- https://docs.fly.io/reference/health-checks: "your Machines won't automatically restart or stop due
  to failing their health checks". Only a process exit triggers a restart.

## 10. Remote builder, Dockerfile path, build context, `.dockerignore`

**Verdict: CONFIRMED, with a wording fix.** The build context is the **working directory**, not
"the directory holding fly.toml". The two coincide when `flyctl deploy` runs at the repo root,
which is what CI does. `[build] dockerfile` is resolved relative to fly.toml's directory. The root
`.dockerignore` is honoured.

- https://docs.fly.io/reference/configuration:
  - The Dockerfile option "will not change the Docker context path, which is set to the project root
    directory by default. If you want the Dockerfile to use its containing directory as the context
    root, use `fly deploy <directory>`."
  - `ignorefile`: "By default, flyctl looks for the .dockerignore file in the working directory."
- https://docs.fly.io/flyctl/cmd/fly_deploy:
  - Usage `fly deploy [WORKING_DIRECTORY]`.
  - `--ignorefile` "Defaults to the .dockerignore file in the working directory".
  - `--depot` "(default 'auto')".
- flyctl source:
  - `command.go:886-909`: `ChangeWorkingDirectoryToFirstArgIfPresent` chdirs to the optional
    positional argument, otherwise keeps the cwd.
  - `deploy_build.go:302`: the Dockerfile path is joined to `filepath.Dir(ConfigFilePath())`.
  - `deploy_build.go:324-325`: `ignorefile` is joined the same way.
  - `imgsrc/archive.go:114-122`, `readDockerignore`: with no ignorefile set, it reads
    `filepath.Join(workingDir, ".dockerignore")`. With no `.dockerignore` at all, it excludes only
    `fly.toml`. It also re-includes the Dockerfile if a pattern excluded it (`parseDockerignore`).
  - `imgsrc/depot.go:267-290`: the Depot/BuildKit path, the default when the server-side flag
    `use-depot-for-builds` is on (`deploy_build.go:65-76`), mounts `context = opts.WorkingDir` and
    `dockerfile = dir of the Dockerfile` for frontend `dockerfile.v0`.

    That path does **not** pass flyctl's exclusions, so `.dockerignore` handling is BuildKit's own:
    it reads the context root's `.dockerignore`, or a `backend/Dockerfile.dockerignore` first if one
    exists. This is an inference from the code, not stated in Fly's docs.

    So the allow-list `.dockerignore` at the repo root applies on both build paths. Do not add a
    `[build] ignorefile`: the Depot path ignores it.

## 11. Health checks, deploy strategy, and never running two Machines

**Verdict: CONFIRMED.** `rolling` is the default. With one Machine it updates that Machine in place,
then waits for checks to pass. Failing checks fail the deploy, and there is no automatic rollback
for `rolling`. Rolling never runs two Machines at once; only `canary` and `bluegreen` boot extra
ones.

- https://docs.fly.io/reference/configuration ("Picking a deployment strategy"):
  - "rolling: The default strategy… One by one, each running Machine is taken down and replaced by a
    new release Machine."
  - "immediate: …without waiting for health checks to pass."
  - "canary: Boots a single, new Machine…"
  - "bluegreen: For every running Machine, a new one is booted alongside it".
  - Rolling's `max_unavailable` defaults to 0.33. `wait_timeout` defaults to 5m.
- https://docs.fly.io/launch/deploy: "`rolling` (default): wait for each Machine to be successfully
  deployed before starting the update of the next one". Also: "Smoke checks monitor Machines… for
  about 10 seconds after a Machine enters the started state… If a Machine is constantly restarting…
  the deployment is stopped."
- https://docs.fly.io/reference/health-checks: service-level checks (`[[http_service.checks]]`)
  "prevent traffic from being sent to unhealthy or slow-starting Machines". Health checks can "Halt
  or roll back deployments".
- https://docs.fly.io/apps/app-availability: "If there aren't any healthy Machines, then the
  connection will block, waiting for a Machine to become healthy." Requests that arrive mid-deploy
  wait rather than fail at once.
- flyctl source:
  - `deploy_plan.go:582-668`, `updateMachineWChecks`: it updates the existing Machine in place
    (`updateOrCreateMachine` → `updateMachineConfig` when the old Machine exists), runs smoke checks,
    then `lm.WaitForHealthchecksToPass(ctx, md.waitTimeout)`. A failure returns `unrecoverableError`.
  - `deploy_machines_deploymachinesapp.go:765-773`: `rolling` uses `pushForward: true`, while
    `bluegreen` calls `bg.Rollback` (`:777-787`).
  - A failed check therefore fails the `flyctl deploy`, so the GitHub job goes red, but the single
    Machine stays on the new release.
- Optional: setting `[deploy] strategy = "rolling"` explicitly pins the one-machine guarantee against
  a future default change. It costs nothing.

## 12. SSE through Fly's proxy

**Verdict: UNVERIFIABLE from the docs, with one real risk.** Fly documents no SSE-specific behaviour.
It does document that **the proxy compresses responses by default, and buffers responses in order
to compress them**. The docs do not say whether `text/event-stream` is compressed.

- https://docs.fly.io/reference/content-encoding:
  - "Unless your app explicitly sets a `Content-Encoding` header, we negotiate compression on your
    behalf based on the client's `Accept-Encoding` header" (zstd, then br, gzip, deflate).
  - "The proxy buffers responses before compressing them. That can break HTML streaming… To avoid
    buffering, disable compression by setting `Content-Encoding: none` for those responses."
  - "If your app sets one, the proxy passes the response through unmodified."
- Live check today: `debug.fly.dev` with a browser `Accept-Encoding` returned `content-encoding:
  zstd` on `text/plain`. Compression is on by default.
- The app: `sse-starlette` 3.1.2 sets `Cache-Control: no-store`, `Connection: keep-alive` and
  `X-Accel-Buffering: no`, and no `Content-Encoding`. Fly does not document honouring
  `X-Accel-Buffering`.
- What others report:
  - A user, 2026-07-18, https://community.fly.io/t/sse-events-delayed-several-seconds-for-ios-webkit-clients-over-http-2/28307:
    their `text/event-stream` had "no content-encoding even with browser Accept-Encoding". That
    suggests SSE is not compressed, but Fly has not confirmed it. The same post reports iOS/WebKit
    over Fly's HTTP/2 edge receiving small SSE events seconds late, until the next heartbeat. Their
    workaround is `[http_service.tls_options] alpn = ["http/1.1"]`. The thread got no Fly reply and
    is closed.
  - Fly staff (jerome), 2023-08-02, https://community.fly.io/t/response-buffering-inconsistent-results-when-reading-from-http-with-text-event-stream-mime-type/8430:
    a curl test showed one event per second through the proxy. curl sent no `Accept-Encoding`, so
    the test did not exercise compression. That thread's batching was eventually traced to the
    LiteFS proxy, not fly-proxy.
  - A Fly-side responder ("our logs", "our HTTP/2 stack"), 2026-04-10,
    https://community.fly.io/t/fly-io-proxy-adds-11-seconds-content-download-delay-to-small-json-responses-app-responds-in-11-milliseconds/27556:
    compression can be turned off with `[http_service.http_options] compress = false`, or with
    `Cache-Control: no-transform` in the response. `compress` exists in fly-go
    (`HTTPOptions.Compress *bool`, `machine_types.go:763`) and in flyctl's reference fixture, but
    it is **not** in the configuration reference.
- For the spec, choose one:
  - (a) Keep as is, and make the post-deploy "events arrive progressively" check explicit: run it
    from a real browser, or `curl -N --compressed -H 'Accept-Encoding: gzip, br, zstd'`, and assert
    the stream response has **no** `content-encoding`.
  - (b) Pre-empt it: have the SSE route send the documented `Content-Encoding: none`, or set
    `[http_service.http_options] compress = false` for the whole backend. The backend serves only
    small JSON, so dropping compression costs little.

  The 15 s ping bounds any WebKit/h2 delay to at most about 15 s per event.

---

## Spec changes required

1. **Finding 1:** change the quote. Fly-Client-IP is documented as "the IP address of the client
   from the perspective of Fly Proxy". "Always set" is Fly-Forwarded-Port. Add the evidence that
   matters: the overwrite of a client-supplied value was **tested** on 2026-10-13. The docs do not
   state it.
2. **fly.toml section:** "Fly builds from the directory holding it" should read "the build context
   is the working directory `flyctl deploy` runs in (the repo root, where fly.toml sits);
   `[build] dockerfile` resolves relative to fly.toml".
3. **fly.toml table:** move `swap_size_mb` to the top of the file, above `[build]`, as in the
   example in item 3. `min_machines_running = 1` is a documented no-op under
   `auto_stop_machines = "off"`; keep or drop it, but don't credit it in Finding 7. Optionally add
   `[deploy] strategy = "rolling"`.
4. **Deploy pipeline:** pin `superfly/flyctl-actions/setup-flyctl@ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1`
   (tag `1.6`, node24) with `version: 0.4.115`. `--remote-only` is now the default.
5. **Setup step 4:** `fly tokens create deploy -a <app> -x <duration>`. The default expiry is 20
   years, and Fly recommends shorter.
6. **SSE (Finding 8 and Verification):** add a check that the stream response carries no
   `content-encoding` under a browser `Accept-Encoding`, or pre-empt it as in item 12(b).
7. **Cost:** $3.69 per 30 days, about $3.81 in a 31-day month, plus $0.02/GB egress. "About $3.70"
   is fine.

---

# Part 2 — Vercel


Spec: `docs/superpowers/specs/2026-10-02-deployment-design.md`. Repo facts used: `frontend/package.json`
(`packageManager: pnpm@11.8.0`, `next 16.3.8`, no `engines`), `mise.toml` (Node 24.17.0),
`frontend/pnpm-lock.yaml` line 1 `lockfileVersion: '9.0'` (one YAML document, no `---`),
`frontend/pnpm-workspace.yaml` (`allowBuilds`, `minimumReleaseAgeExclude`, **no `packages:`**),
no `package.json` at the repo root, no `vercel.json` anywhere yet.

All URLs fetched 2026-10-13 (~16:00 UTC). Vercel docs were fetched as raw markdown (`<url>.md`);
each page's `last_updated` front-matter is quoted. Non-primary sources are marked **[community]**.

---

## 1. pnpm versions Vercel supports — CHANGED (docs stale, code ahead)

**Verdict.** The docs page still says pnpm 6–10. But Vercel's build code has known pnpm 11 since
`@vercel/build-utils` 14.3.0 (published 2026-08-21), and it honours a `packageManager: pnpm@11.x`
pin **without Corepack**, provided the build image has `/pnpm11`. So the spec's line "pnpm 11 runs
only through Corepack" no longer holds. Vercel still has no doc or changelog entry announcing pnpm 11
support, and the GitHub issue asking for it is still open.

Evidence:

- https://vercel.com/docs/package-managers (last_updated 2026-08-11): the supported-versions table
  lists pnpm as `6, 7, 8, 9, 10`. Its mapping: "`lockfileVersion`: 9.0 → pnpm 9 or 10\*". It also
  says "a `pnpm-lock.yaml` file with `lockfileVersion: 9.0` will be interpreted by pnpm 9 or 10",
  and "If you are using Corepack, Vercel will use the package manager specified in the
  `package.json` file's `packageManager` field instead."
- https://github.com/vercel/vercel/blob/main/packages/build-utils/CHANGELOG.md:
  - 14.3.0: "Honor `package.json` pnpm pins without Corepack, and default new projects to pnpm 11.
    When Corepack is off, `devEngines.packageManager` is preferred, then a lockfile-compatible
    `packageManager` field, then `engines.pnpm` as a selector. Unpinned lockfile `9.0` projects
    created on or after 2026-08-19 use pnpm 11 (Node 22+) if `/pnpm11` is present in the build image."
  - 14.9.1: "Delay the pnpm 11 created-at default so unpinned lockfile 9.0 projects stay on pnpm 10.
    pnpm 11's default `minimumReleaseAge` of 1 day was breaking installs … Explicit `packageManager` /
    `devEngines` pins to pnpm 11 are unchanged."
  - 14.0.4: "Support pnpm lockfiles containing multiple YAML documents."
  - npm registry publish dates: 14.0.4 2026-08-10, 14.3.0 2026-08-21, 14.9.1 2026-09-04; latest is
    14.20.1 (2026-10-09). https://registry.npmjs.org/@vercel%2Fbuild-utils
- Code, https://raw.githubusercontent.com/vercel/vercel/main/packages/build-utils/src/fs/run-user-scripts.ts
  (the same logic is in the published `dist/fs/run-user-scripts.js` of 14.20.1, via unpkg):
  - `INSTALLED_PNPM_MAJORS = [12, 11, 10, 9, 8, 7, 6]`. `isPnpmMajorAvailable(11)` returns
    `fs.existsSync('/pnpm11')`, with the comment "pnpm 6–10 are in every current build image. Newer
    majors are added independently".
  - `resolveCompatiblePnpmPin`: a `packageManager` of `pnpm@11.x` with lockfile 9.0 →
    `/pnpm11/node_modules/.bin` is put at the front of `PATH`.
    `validLockfileForPackageManager`: "case 12: case 11: case 10: return lockfileVersion === 9.0".
  - Unpinned 9.0: pnpm 11 only after `PNPM_11_PREFERRED_AT = 2027-03-01`, otherwise pnpm 10 (projects
    created after 2025-02-27), otherwise pnpm 9.
  - The log line to expect: "Detected \`pnpm-lock.yaml\` version 9 generated by pnpm@11.x from
    package.json#packageManager pnpm@11.8.0".
- **Inference (not documented):** `/pnpm11` exists in production images. The 14.9.1 rollback happened
  because pnpm 11 *was* running real builds. The minor version in `/pnpm11` is unknown.
- pnpm 11 then corrects the version itself. https://pnpm.io/settings/cli#pmonfail says of `pmOnFail`
  "Added in: v11.0.0 Default: download … download and run the declared pnpm version". So a `/pnpm11`
  of any minor runs 11.8.0.
- Lockfile format: pnpm 11 still writes `lockfileVersion: '9.0'` (this repo, line 1). pnpm 11 *can*
  add a second YAML document (config deps, `devEngines.packageManager`; see the "Other notable
  changes" section of https://pnpm.io/blog/releases/11.0). Vercel parses that since 14.0.4. This
  lockfile has only one document.
- Still open: https://github.com/vercel/vercel/issues/17434 "pnpm 11 and 12 not supported" (opened
  2026-08-12). PR #17450 "[build-utils] Add pnpm 11 support" is also open. Both lag behind the
  internal-sync code above.

## 2. Corepack on Vercel — CONFIRMED env var; CHANGED: it is a trap with Root Directory `frontend`

**Verdict.** The variable is still `ENABLE_EXPERIMENTAL_COREPACK=1`. But Vercel *enables* Corepack
from the `package.json` at the **repository root**, not at the Root Directory. This repo has no
root `package.json`. With the env var set, the likely result is that neither Corepack nor the
`/pnpm11` pin is used, and the build runs whatever `pnpm` the image has on `PATH`. **Drop the env
var** (see 1).

Evidence:

- https://vercel.com/docs/builds/configure-a-build#corepack (last_updated 2026-08-28): "You can
  enable Corepack by adding an environment variable with name `ENABLE_EXPERIMENTAL_COREPACK` and
  value `1` … Then, set the `packageManager` property in the `package.json` file **in the root of
  your repository**."
- Code, https://raw.githubusercontent.com/vercel/vercel/main/internals/cli-builder-integration/src/corepack.ts:
  `initCorepack` reads `join(repoRootPath, 'package.json')`. If `packageManager` is missing it warns
  "Could not enable corepack because package.json is missing "packageManager" property" and returns
  `null`. A missing file reads as `null` (`packages/cli/src/util/read-json-file.ts`).
- Code, `internals/cli-builder-integration/src/do-build.ts`:
  `const workPath = join(cwd, project.settings.rootDirectory || '.'); const repoRootPath = cwd;`.
  `packages/cli/src/commands/build/index.ts`: "If repo linked, update `cwd` to the repo root".
- Code, `run-user-scripts.ts` `usingCorepack()`: returns true whenever the env var is `1` **and**
  the package.json found walking up from the Root Directory has `packageManager`. Ours does
  (`frontend/package.json`). In that case `getPathOverrideForPackageManager` returns `NO_OVERRIDE`
  ("corepack is going to take care of it"), so the `/pnpm11` pin is skipped too.
- Vercel's own docs on the default `pnpm`: "if you specify `pnpm install` as your override install
  command, Vercel will use pnpm 6" (https://vercel.com/docs/package-managers). That is the likely
  `pnpm` on `PATH` when neither path applies.
- **[community]** https://community.vercel.com/t/corepack-packagemanager-package-json-root-directory-misconfig/9940
  (2025-05): "Vercel Build step looks specifically for package.json in the root of the repository
  and not in the Root Directory". Vercel Support's fix was turning off "Include files outside the
  root directory in the Build Step".
- **[community]** https://community.vercel.com/t/pnpm-v11-support/41674: shows the pnpm 9 fallback
  failing with `ERR_PNPM … packages field missing or empty` on a workspace file. Our
  `pnpm-workspace.yaml` has no `packages:`, so a pnpm 9 fallback would fail the same way. Another
  user there had Corepack download pnpm 10.10.0 against a pnpm 11 pin (a stray sub-package pin).
- Node: https://nodejs.org/docs/latest-v24.x/api/corepack.md says "Corepack will no longer be
  distributed starting with Node.js v25." So Node 24 still ships it. Locally,
  `mise exec node@24.17.0 -- corepack --version` → `0.35.0`. Vercel offers only 24.x/22.x (item 3),
  so Node 25 does not affect builds today. It is still a reason not to depend on Corepack.
- The setting "Include files outside the root directory in the Build Step" is the REST API field
  `sourceFilesOutsideRootDirectory`, "Indicates if there are source files outside of the root
  directory" (https://openapi.vercel.sh/). Its default for new projects is **not documented**.

If Corepack is ever needed (fallback only), it needs **either** "Include files outside the root
directory in the Build Step" turned off **or** a repo-root `package.json` carrying
`"packageManager": "pnpm@11.8.0"`.

## 3. Node.js on Vercel builds — CONFIRMED

- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions (last_updated 2026-02-27):
  "Current available versions are: **24.x** (default), **22.x**". Also: "You can define the major
  Node.js version in the `engines#node` section of the `package.json` to override the one you have
  selected in the Project Settings". `24.x` → "latest **24.x** version". "Only major versions are
  available. Vercel automatically rolls out minor and patch updates".
- https://vercel.com/docs/builds/build-image (fetched 2026-10-13): Node.js build image `24.x`, `22.x`.
- So `engines.node: "24.x"` in `frontend/package.json` (the Root Directory's) is correct. It
  matches the default, and pins the major against a later change of default. The patch is Vercel's
  latest 24.x, not mise's 24.17.0. Next 16 needs "Minimum Node.js version: 20.9"
  (https://nextjs.org/docs/app/getting-started/installation, version 16.4.0), and pnpm 11 needs
  Node 22+ (pnpm 11 release notes). Both are satisfied.

## 4. Preview deploys: `ignoreCommand` vs `git.deploymentEnabled` — CONFIRMED semantics; CHANGED recommendation

**`ignoreCommand` semantics — CONFIRMED.**

- https://vercel.com/docs/project-configuration/vercel-json#ignorecommand (last_updated
  2026-08-14): "When the command exits with code 1, the build will continue. When the command exits
  with 0, the build is ignored."
- https://vercel.com/docs/project-configuration/project-settings#ignored-build-step (last_updated
  2026-09-21) says the command "is executed within the Root Directory and can access the System
  Environment Variables that are available at build time". A built-in preset is "**Only build
  production**: When the `VERCEL_ENV` is production, a new build will be issued". Exit 0 sets the
  deployment state to `CANCELED`. Caveat: "Canceled builds are counted as full deployments … count
  towards your deployment quotas" (Hobby: 100 deployments/day, item 7).
- https://vercel.com/docs/environment-variables/system-environment-variables (last_updated
  2026-07-15): `VERCEL_ENV`, "Available at: Both build and runtime".
- https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel (last_updated
  2026-09-28) gives the same pattern, `if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit
  0; fi`. It adds: make sure "Automatically Expose System Environment Variables" is checked.
- So the spec's `[ "$VERCEL_ENV" != production ]` is correct: exit 0 (skip) for preview, exit 1
  (build) for production. Note it fails closed. If system variables are not exposed, `VERCEL_ENV`
  is empty, the test is true, and **production** is skipped too. That would show up as every
  deployment CANCELED.

**`git.deploymentEnabled` — the better primary control.**

- https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled
  (last_updated 2026-08-25): "Specify branches that should not trigger a deployment upon commits. By
  default, any unspecified branch is set to `true`." Use "minimatch syntax". "If a branch matches
  multiple rules and at least one rule is `true`, a deployment will occur." Setting `false` turns
  off all branches. Schema (https://openapi.vercel.sh/vercel.json) has `git.deploymentEnabled`:
  `boolean | {[branch]: boolean}`.
- It stops the deployment from being **created**, so it uses no deployment quota and leaves no
  CANCELED deployments. `ignoreCommand` still creates the deployment and then cancels it.
- **Glob trap (measured locally).** minimatch's `*` does not cross `/`. This repo's branches are
  `lc/…` and Dependabot's are `dependabot/npm_and_yarn/…`. Tested with the repo's own minimatch
  10.2.6 and 3.1.5: `minimatch('lc/deployment-design-impl-ef23cc','*') === false` and `'**'` →
  true. So the catch-all must be `"**"`, not `"*"`. Vercel's server-side matcher options are not
  public, so verify with a throwaway branch push.
- `vercel` CLI deploys and dashboard redeploys are not Git pushes, so `deploymentEnabled` does not
  cover them. Keep `ignoreCommand` as the backstop.

**Recommended `frontend/vercel.json`:**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": {
      "**": false,
      "main": true
    }
  },
  "ignoreCommand": "[ \"$VERCEL_ENV\" != production ]"
}
```

`main` matches both rules, and one rule is `true`, so it deploys. Every other branch matches only
`"**": false`. Also from the docs: "The first deployment of a new project is always a production
deployment" (https://vercel.com/docs/deployments/environments, last_updated 2026-09-17).
**[community]** Threads show people using `"*": false`, and one claims listing only `main` disables
the rest. That contradicts the docs' "any unspecified branch is set to `true`".

## 5. Root Directory `frontend` and `vercel.json` placement — CONFIRMED, with one caveat

- https://vercel.com/docs/project-configuration/vercel-json: "This file should be created in your
  project's root directory". https://vercel.com/docs/monorepos (last_updated 2026-08-11) shows
  per-app files like `apps/web/vercel.json`. The schema notes `git.skipUnaffectedProjects` is
  "Only read from the repository root `vercel.json`", which implies everything else is read from
  the project's. Code agrees: `do-build.ts` reads `join(workPath, 'vercel.json')`. → **`frontend/vercel.json`**.
- https://vercel.com/docs/builds/configure-a-build#root-directory: "Your app will not be able to
  access files outside of that directory. You also cannot use `..` to move up a level."
- The build needs only `frontend/`. Checked: `next.config.js` has no `outputFileTracingRoot`. The
  only build-time file reads are `lib/credits.ts` (`process.cwd()/public/...`) and
  `lib/share-image.tsx` (`process.cwd()/node_modules/@fontsource/...`), both inside `frontend/`.
- Caveat, from item 2: the separate setting "Include files outside the root directory in the Build
  Step" (`sourceFilesOutsideRootDirectory`) changes which `package.json` Corepack reads. It does not
  matter once Corepack is dropped.
- Hobby can link only personal-account repos: "Vercel does not support connecting a project on your
  Hobby team to Git repositories owned by Git organizations" (https://vercel.com/docs/limits).
  `lawry98/f1-application` is a personal repo, so that is fine.

## 6. Next.js 16 on Vercel; `NEXT_PUBLIC_*` — CONFIRMED

- https://vercel.com/docs/frameworks/full-stack/nextjs (last_updated 2026-09-08): "deploying to
  Vercel is zero-configuration". The page covers Next.js 16 features (PPR, "As of Next.js 16 …").
  https://vercel.com/docs/builds/configure-a-build#framework-preset: "Vercel automatically detects
  your project's framework". No 16-specific requirement was found beyond Node ≥ 20.9.
- https://nextjs.org/docs/app/guides/environment-variables (lastUpdated 2026-08-25): Next.js can
  "'inline' a value, at build time, into the js bundle", and "all `NEXT_PUBLIC_` variables will be
  frozen with the value evaluated at build time".
- https://vercel.com/docs/environment-variables/managing-environment-variables (last_updated
  2026-09-11): "Changes to environment variables are not applied to previous deployments … You must
  redeploy your project to update the value". The Redeploy dialog lets you choose "if you want to
  use the existing Build Cache" (https://vercel.com/docs/deployments/managing-deployments#redeploy-a-project).
  Redeploy rebuilds, so it re-inlines `NEXT_PUBLIC_*`.
- Side note, unverified: `app/opengraph-image.tsx` reads fonts from `node_modules` via
  `process.cwd()`. It uses no dynamic APIs, so it should prerender at build. Confirm `pnpm build`
  lists it as static (○), otherwise the runtime function would need those files traced.

## 7. Hobby plan terms and limits — CONFIRMED (with additions)

- Non-commercial only. https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage
  (last_updated 2026-09-14): "Hobby teams are restricted to non-commercial personal use only."
  Commercial means "financial gain of anyone involved in any part of the production". Examples:
  payments, ads, paid hosting. A personal portfolio with no ads or payments is within the terms.
  https://vercel.com/legal/terms#hobby-plan (Last Updated June 1, 2026): "You shall only use the
  Services under a Hobby plan for your personal or non-commercial use." Vercel "may shut down and
  terminate projects or deployments using the Hobby plan without notice".
- Monthly allotments (https://vercel.com/docs/plans/hobby, last_updated 2026-09-14): Fast Data
  Transfer 100 GB; Fast Origin Transfer 10 GB; CDN Requests 1,000,000; Function Invocations
  1,000,000; Active CPU 4 CPU-hrs; Provisioned Memory 360 GB-hrs; **Image Transformations 5,000**;
  Image Cache Reads 300,000; Image Cache Writes 100,000. If you go over, "you will have to wait until
  30 days have passed before you can use the feature again". Nothing is billed.
- Other limits (https://vercel.com/docs/limits, last_updated 2026-09-16): Deployments Created per Day
  100; Concurrent builds 1; Build time 45 min; function max duration 300 s; runtime logs kept 1 hour.
- Addition worth knowing (Terms): "if you are on a Hobby plan …, you agree that we may use Your
  Content to train our [AI] … You may opt-out of Model Training at any time by adjusting your Team
  account settings".
- `next/image` on Vercel uses Vercel Image Optimization. 5,000 transformations a month is the
  Hobby limit most likely to be hit first if traffic spikes.

## 8. Production-only environment variables — CONFIRMED

- Dashboard: Project → Settings → Environment Variables. "Configure which deployment environment(s)
  this variable should apply to", choosing from Production / Preview / Development, then Save and
  redeploy (https://vercel.com/docs/environment-variables/managing-environment-variables). Each
  variable is also Config or Secret: "Config values stay readable … Secret values are write-only
  after saving" (https://vercel.com/docs/environment-variables). `NEXT_PUBLIC_*` values are public
  anyway, so Config is fine.
- CLI: `vercel env add [name] [environment]`, e.g. `vercel env add NEXT_PUBLIC_API_URL production`.
  `echo [value] | vercel env add [name] [environment]` is also supported
  (https://vercel.com/docs/cli/env).
- Production variables apply to "your next Production Deployment … push a commit to the
  Production Branch … or run `vercel --prod`".

## 9. `allowBuilds` / `minimumReleaseAge` under Vercel; known pnpm 11 issues — CONFIRMED works in principle; issues are Corepack/pin-related

- Vercel runs plain `pnpm install` in the Root Directory, and pnpm reads `pnpm-workspace.yaml` from
  there. Vercel does not rewrite pnpm settings (`getInstallCommandForPackageManager` in
  `run-user-scripts.ts` adds only flags such as `--prod`). So `allowBuilds` and
  `minimumReleaseAgeExclude` apply as they do locally. pnpm docs:
  - `allowBuilds` "Added in: v10.26.0"; `strictDepBuilds` "Default: true … exit with a non-zero exit
    code if any dependencies have unreviewed build scripts" (https://pnpm.io/settings/build).
  - `minimumReleaseAge` "Default: 1440 (since v11)" (https://pnpm.io/settings/dependency-resolution).
  - Vercel's own changelog confirms the 1-day default bites on its builds too (build-utils 14.9.1,
    item 1).
- The Linux install is already proven: `.github/workflows/ci.yml` runs `pnpm install
  --frozen-lockfile` and `pnpm build` on `ubuntu-latest` with Node 24.17.0 and pnpm 11. So
  `allowBuilds: {unrs-resolver: true}` covers every build script on Linux.
- The `minimumReleaseAgeExclude` entries for `next@16.3.8` are inert now that the version is more
  than a day old. They are harmless on Vercel.
- Known issues:
  - **[community]** https://community.vercel.com/t/pnpm-11-not-supported-when-deploying-with-the-vercel-cli/47598
    (2026-08-12) shows a cloud log with `Running "vercel build"` and "Error while parsing config
    file: pnpm-lock.yaml" from a multi-document lockfile with `devEngines`. The parser was fixed in
    14.0.4. That project used `devEngines.packageManager`, not the `packageManager` field.
  - **[community]** thread 41674: the Corepack + sub-package pin mix-up, and a pnpm 9 fallback
    failing on a workspace file with no `packages` (item 2).
  - **[primary, open]** vercel/vercel#17434 (pnpm 11/12 unsupported in the docs) and #17560 (pnpm 12
    and `--unsafe-perm`, already fixed in 14.9.0).

---

## What the spec must change

| Spec location | Now | Change to |
|---|---|---|
| Finding 6 | "pnpm 6–10 natively; pnpm 11 only through Corepack" | Docs say 6–10, but build-utils ≥ 14.3.0 honours `packageManager: pnpm@11.8.0` without Corepack (needs `/pnpm11`; pnpm's `pmOnFail: download` then runs 11.8.0 exactly). With Root Directory `frontend` and no root `package.json`, Corepack does **not** engage, and setting the variable switches off the pin path. |
| Configuration row `ENABLE_EXPERIMENTAL_COREPACK` | Production, `1` | **Delete the row.** Fallback only: Corepack plus "Include files outside the root directory" turned off (or a root `package.json` with `packageManager`). |
| Deploy pipeline, frontend | `ignoreCommand` only | The `frontend/vercel.json` above: `git.deploymentEnabled {"**": false, "main": true}` plus the existing `ignoreCommand` as backstop. |
| Documentation → CLAUDE.md trap "pnpm 11 on Vercel needs Corepack" | — | Replace with: "Vercel picks pnpm 11 from `packageManager`, not Corepack. `ENABLE_EXPERIMENTAL_COREPACK` reads the *repo-root* `package.json`, which this repo lacks, so setting it breaks the install." |
| Verification table | — | Add: first build log shows `Detected \`pnpm-lock.yaml\` version 9 generated by pnpm@11.x from package.json#packageManager pnpm@11.8.0`. A push to a throwaway `lc/…` branch creates no deployment. |
| Decisions table, Frontend host "100 GB/mo transfer" | — | Still right. Add the 5,000/mo image-transformation cap and 100 deployments/day. |

---

# Part 3 — Runtime and CI


Spec: `docs/superpowers/specs/2026-10-02-deployment-design.md`.

Source note: the main checkout's venv (`/Volumes/SD500/Documents/personal/f1/backend/.venv`) **does not exist**.
I read the worktree's venv instead, which has the same pins:
`/Volumes/SD500/Documents/personal/f1/.claude/worktrees/deployment-design-impl-ef23cc/backend/.venv/lib/python3.12/site-packages/`
(uvicorn 0.40.0, starlette 0.50.0, fastapi 0.128.0, sse_starlette 3.1.2). Below, `SP/` means that path.

---

## 1. uvicorn `*` trust, the proxy-headers default, and the trust default

**CONFIRMED for 0.40.0, and unchanged in 0.54.0 (latest).** With `*`, uvicorn picks the leftmost (client-supplied) XFF entry. **One thing has CHANGED since 0.40:** from 0.53.0 the default trust list is `127.0.0.1,::1`.

- `SP/uvicorn/middleware/proxy_headers.py`
  - L71: `self.always_trust: bool = trusted_hosts in ("*", ["*"])`
  - L125–133:
    ```python
    def get_trusted_client_host(self, x_forwarded_for: str) -> str:
        ...
        x_forwarded_for_hosts = _parse_raw_hosts(x_forwarded_for)
        if self.always_trust:
            return x_forwarded_for_hosts[0]
    ```
    The spec's Finding 1 is right: `[0]` is the **leftmost** entry, the one the client wrote. Without `*` it walks the list right to left (L135–138) and returns the first untrusted entry.
  - L34–35, L46–58: the rewrite happens only when the TCP peer is trusted (`if client_host in self.trusted_hosts`). It then sets `scope["client"] = (host, 0)` **in place**.
  - L35: `headers = dict(scope["headers"])`. When an XFF header is repeated, 0.40 uses only the last one.
- **Proxy headers are ON by default.** `SP/uvicorn/main.py` L226–229 has `"--proxy-headers/--no-proxy-headers", is_flag=True, default=True`. `SP/uvicorn/config.py` L207 has `proxy_headers: bool = True`. L474–475 wrap the app in `ProxyHeadersMiddleware` when it is on. So `--no-proxy-headers` really does switch something off.
- **Trust default in 0.40.** `SP/uvicorn/config.py` L337–338 has `os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1")`. `main.py` L249 is the matching help text.
- **Latest release, 0.54.0** (PyPI, published 2026-09-25):
  - `https://raw.githubusercontent.com/Kludex/uvicorn/0.54.0/uvicorn/middleware/proxy_headers.py`: `*` still returns `_parse_host_port(x_forwarded_for_hosts[0])`. The leftmost entry still wins, and it now carries a port.
  - `.../0.54.0/uvicorn/config.py` L363: `os.environ.get("FORWARDED_ALLOW_IPS", "127.0.0.1,::1")`.
  - `.../0.54.0/uvicorn/main.py` L232–234: proxy headers are still `default=True`.
  - Release notes (`.../0.54.0/docs/release-notes.md`):
    - 0.53.0 "Trust IPv6 loopback in the default `FORWARDED_ALLOW_IPS` value (#3119)"
    - 0.49.0 "Consume duplicate forwarding headers"
    - 0.45.0 "Preserve forwarded client ports"
  - None of these affects the 0.40 pin.
- **Can Fly's proxy ever look like 127.0.0.1? No.** The Fly docs say to listen on 0.0.0.0 "(not `localhost`, not `127.0.0.1`)" and that "The Fly proxy connects from outside, so it can't reach your app" on loopback (https://docs.fly.io/getting-started/troubleshooting). With the default trust, uvicorn therefore never rewrites anything on Fly. `--no-proxy-headers` is still the right setting: it means a stray `FORWARDED_ALLOW_IPS=*` can never switch the rewrite on.
- Side effect, verified: with proxy headers off, `scope["scheme"]` stays `http`. Starlette's trailing-slash redirect builds an absolute URL from the scope (`SP/starlette/routing.py` L751–762: `URL(scope=redirect_scope)` → `RedirectResponse`), so a slash redirect would point at `http://<app>.fly.dev/...`. None of the frontend's paths (`frontend/lib/api.ts` L12, 23, 33, 110) has a trailing slash, so nothing hits it today.
- **Spec correction, Finding 1 citation.** The Fly page does **not** describe `Fly-Client-IP` as "always set by the Fly Proxy". That sentence belongs to **`Fly-Forwarded-Port`**. What the page says about `Fly-Client-IP` is: "The IP address of the client from the perspective of Fly Proxy". For `X-Forwarded-For` it says that "the Fly-Client-IP header might be a better choice" when no other reverse proxy is in front. The page also does not say that a client-sent `Fly-Client-IP` is overwritten (https://docs.fly.io/networking/request-headers; `fly.io/docs/...` returns a 301 to that URL). So the forged-header check after deploy is the only proof that overwriting happens.

## 2. Does uvicorn's access log use `scope["client"]`?

**CONFIRMED, with two conditions.** The access log reads the scope dict that was handed to the app, at `http.response.start`, so an in-place rewrite does reach the log line.

- The protocol does capture the peer before the app runs. `httptools_impl.py` L108 and `h11_impl.py` L98 both do `self.client = get_remote_addr(transport)`. But that value is only used to **seed** the scope:
  - `httptools_impl.py` L225–230: `self.scope = {... "client": self.client, ...}`
  - `h11_impl.py` L203–208: the same.
- The same dict object goes to the request cycle and to the app:
  - httptools L277–278 `RequestResponseCycle(scope=self.scope, ...)`, then L388 `self.scope = scope`, then L416–417 `await app(self.scope, self.receive, self.send)`
  - h11 L240–241, L383, L410–411: the same.
- The access line is written when the response starts, after the app has run:
  - `httptools_impl.py` L482–490: `self.access_logger.info('%s - "%s %s HTTP/%s" %d', get_client_addr(self.scope), ...)`
  - `h11_impl.py` L479–487: the same.
- `SP/uvicorn/protocols/utils.py` L45–49:
  ```python
  def get_client_addr(scope):
      client = scope.get("client")
      ...
      return "%s:%d" % client
  ```
- The `self.client` prefixes (httptools L112/119/187, h11 L102/109/281) appear only in **trace or error** messages, never in the access line.
- uvicorn's own `ProxyHeadersMiddleware` relies on exactly this mechanism (L58, an in-place `scope["client"] = ...`).
- 0.54.0 is unchanged: `utils.py` L51–55 is the same `get_client_addr`, and httptools L484 still calls `get_client_addr(self.scope)`.
- Nothing between uvicorn and the routes copies the scope. A grep of `SP/starlette`, `SP/fastapi` for `dict(scope` / `{**scope` / `scope.copy()` finds only `routing.py` L752, which is the slash-redirect probe. `Starlette.__call__` mutates the scope in place (`applications.py` L104).
- **Condition 1:** the middleware must mutate the scope in place, as the spec already says. Code that passes `dict(scope, client=...)` downstream would change the routes but **not** the access log.
- **Condition 2:** it must run before any middleware that answers on its own. `CORSMiddleware` replies to a preflight itself, without calling the inner app (`SP/starlette/middleware/cors.py` L88–91). If the client-IP middleware sits inside CORS, every preflight `OPTIONS` access line shows the proxy's address. See item 3.
- The log line will read `<ip>:0`, because the port is set to 0.
- The access log is on by default and goes to stdout, which `fly logs` collects: `SP/uvicorn/config.py` L89–98.
- **Verdict:** the spec's post-deploy check ("access line shows the real IP") is valid as written, provided the middleware is the outermost one (item 3).

## 3. `request.client` and middleware order

**CONFIRMED.**

- `SP/starlette/requests.py` L151–157 (`HTTPConnection.client`): `host_port = self.scope.get("client")` → `Address(*host_port)`.
- `SP/starlette/applications.py` L118–126: `add_middleware` does `self.user_middleware.insert(0, ...)`.
- `build_middleware_stack`, L85–94: `[ServerErrorMiddleware] + user_middleware + [ExceptionMiddleware]`, wrapped in `reversed(...)`. So **the middleware added last is the outermost of the user middleware**, always inside `ServerErrorMiddleware`.
- FastAPI 0.128 overrides `build_middleware_stack` with the same ordering, plus `AsyncExitStackMiddleware` innermost (`SP/fastapi/applications.py` L998–1043).
- **Recommendation:** in `create_app`, call `app.add_middleware(ClientIPMiddleware, ...)` **after** `add_cors(app)` (`backend/api/app.py` L23). It is then outside CORS, so preflight lines and every future middleware see the visitor's address. The guard works in either order.
- Two implementation notes:
  - The header must be matched **lowercased**. uvicorn lowercases names (`httptools_impl.py` L242, `h11_impl.py` L198), and the ASGI spec says names "should be lowercased, but it is not required" (https://github.com/django/asgiref/blob/main/specs/www.rst L124–126).
  - Decide what happens when the header appears twice, because Fly does not document overwriting a client-sent one. Taking the last occurrence or refusing duplicates are both safe. The forged-header check settles it on the real platform.

## 4. sse-starlette ping interval

**CONFIRMED: 15 s.**

- `SP/sse_starlette/sse.py`
  - L164: `DEFAULT_PING_INTERVAL = 15`
  - L219: `self.ping_interval = self.DEFAULT_PING_INTERVAL if ping is None else ping`
  - L301–307: `_ping` sleeps for `_ping_interval` between pings.
- `backend/api/routes.py` L389–391 constructs `_ReleasingEventSourceResponse(event_generator(), on_close=...)` with no `ping=`, so the default applies.
- Latest sse-starlette 3.5.0 is still 15 (`raw.githubusercontent.com/sysid/sse-starlette/v3.5.0/sse_starlette/sse.py` L264).

## 5. Docker base image

**CHANGED.** The default `slim` is now **trixie**, and bookworm is in Debian LTS.

Docker Hub API (`https://hub.docker.com/v2/repositories/library/python/tags/?name=3.12&page_size=100&ordering=last_updated`), with digests confirmed against the registry via `HEAD /v2/library/python/manifests/<tag>` (`docker-content-digest`, OCI index):

| Tag | Updated | Index digest |
|---|---|---|
| `3.12.15-slim-trixie` = `3.12-slim` = `3.12.15-slim` | 2026-10-09 | `sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1` |
| `3.12.15-slim-bookworm` = `3.12-slim-bookworm` | 2026-10-06 | `sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258` |

- The latest 3.12 patch is **3.12.15**.
- docker-library publishes both variants: `https://raw.githubusercontent.com/docker-library/python/master/versions.json` lists 3.12 as `3.12.15`, variants `slim-trixie` and `slim-bookworm`.
- The official-images manifest gives `3.12-slim` to trixie: `https://raw.githubusercontent.com/docker-library/official-images/master/library/python` L155 is `Tags: 3.12.15-slim-trixie, 3.12-slim-trixie, 3.12.15-slim, 3.12-slim`, and L165 is `3.12.15-slim-bookworm, 3.12-slim-bookworm`.
- Debian 12 "bookworm" LTS runs **2026-06-11 to 2028-06-30**, so regular security support has ended. Debian 13 "trixie" LTS runs from 2028-08-09 (https://wiki.debian.org/LTS).
- **Recommendation:** `FROM python:3.12.15-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1`.
  - Bookworm still works, if the spec wants to keep it: `python:3.12.15-slim-bookworm@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258`.
  - The spec's text ("`python:3.12-slim-bookworm` with the patch version pinned") needs updating either way.

## 6. `workflow_run`

**CONFIRMED.** One related spec gap, under "Spec gap" below.

From https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run (markdown via `docs.github.com/api/article/body`):

- "This event will only trigger a workflow run if the workflow file exists on the default branch."
- Activity types are `completed`, `requested` and `in_progress`. For this event `GITHUB_SHA` is the "Last commit on default branch" and `GITHUB_REF` is the "Default branch". That is why checking out `head_sha` is required.
- "The workflow started by the `workflow_run` event is able to access secrets and write tokens, even if the previous workflow was not."
- "A workflow run is triggered regardless of the conclusion of the previous workflow". The page's example uses `if: ${{ github.event.workflow_run.conclusion == 'success' }}`.
- `branches`: "specify what branches the triggering workflow must run on". That is the triggering run's `head_branch`.
- Limit: "can't use `workflow_run` to chain together more than three levels".

From https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_runworkflows:

- `workflows` "accept glob patterns ... to match more than one workflow name", with examples like "the workflow named `Build`". It matches by the `name:`, so `[CI]` matches `.github/workflows/ci.yml` L1 `name: CI`.

Payload fields:

- The REST "Get a workflow run" schema lists `head_branch`, `head_sha`, `event`, `status` and `conclusion` (https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run).
- A live check, `gh api repos/lawry98/f1-application/actions/runs/37360975123`, returned `{"name":"CI","event":"push","head_branch":"main","head_sha":"1613609…","conclusion":"failure"}`.

My inference, not stated in the docs: a pull-request CI run has its source branch as `head_branch`, so a fork branch named `main` would pass `branches: [main]`. The `event == 'push'` check is therefore necessary, not redundant.

actions/checkout v7.0.0 (and v4.4.0 via backport) refuses fork-PR code in `workflow_run`, but "only when `workflow_run.event` is a `pull_request*` event" (https://github.blog/changelog/2026-06-18-safer-pull_request_target-defaults-for-github-actions-checkout/). A push-only deploy is unaffected and needs no `allow-unsafe-pr-checkout`.

**Spec gap: manual dispatch would always skip.** On a `workflow_dispatch` run, `github.event.workflow_run` is absent. The spec's job condition (`conclusion == 'success' && event == 'push'`) would then skip every manual run, and `ref: ${{ github.event.workflow_run.head_sha }}` would be empty. The condition needs to be:

`if: github.event_name == 'workflow_dispatch' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push')`

and the ref needs to be:

`ref: ${{ github.event.workflow_run.head_sha || github.sha }}`

**Live state:** main's latest CI run (2026-10-05, run 37360975123) **failed**: the Backend job's tests in `tests/test_tools.py` hit date-dependent weather assertions (`'weekend_over' == 'partial'`, `KeyError: 'window'`). A `workflow_run` deploy will not fire until main is green.

## 7. Skipping cleanly when a secret is missing

**CONFIRMED.**

- From https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets: "Secrets cannot be directly referenced in `if:` conditionals. Instead, consider setting secrets as job-level environment variables, then referencing the environment variables to conditionally run steps in the job." Also: "If a secret has not been set, the return value of an expression referencing the secret ... will be an empty string."
- The documented example (workflow-syntax, "Example: Using secrets" under `jobs.<job_id>.steps[*].if`) sets `env: super_secret: ${{ secrets.SuperSecret }}` at job level, then uses `- if: ${{ env.super_secret != '' }}` on a step.
- The contexts availability table (https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability) shows `jobs.<job_id>.if` can use only `github, needs, vars, inputs`, with **no `env` or `secrets`**. `jobs.<job_id>.steps.if` can use `env`.
- So a **job-level** skip needs either a preceding job that exports an output (`needs.<job>.outputs.has_token == 'true'`) or a repository variable (`vars.X`). A **step-level** skip uses `env.X != ''`.

## 8. Latest action majors and the Node 20 removal

**CHANGED.** checkout is now at v7, and Node 20 is gone from the runners.

Latest releases (`api.github.com/repos/<r>/releases/latest`) and the runtime each major's `action.yml` declares:

| Action | Latest | Runtime of the major |
|---|---|---|
| actions/checkout | **v7.0.1** (2026-07-20) | v4 `node20`; v5, v6, v7 `node24` |
| docker/setup-buildx-action | **v4.4.1** (2026-09-16) | v3 `node20`, v4 `node24` |
| docker/build-push-action | **v7.4.0** (2026-09-15) | v6 `node20`, v7 `node24` |
| superfly/flyctl-actions | release **1.5** (2024-02-02) is `node20`; **tag `1.6` = `v1` = `ed8efb33836e8b2096c7fd3ba1c8afe303ebbff1`** (merged 2026-04-08, "upgrade-node-runtime") is `node24` | — |
| also used in ci.yml | setup-python v7.0.0, setup-node v7.1.0, cache v6.1.0, upload-artifact v7.0.2, pnpm/action-setup v6.1.0 | — |

- GitHub changelog, 2025-09-19, with editor's notes: runners use Node 24 by default from 2026-06-16, and Node 20 is removed on 2026-09-23 (https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).
- 2026-09-23: "Node 20 is no longer available on GitHub Actions runners", and the `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` opt-out is gone (https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/).
- Does `checkout@v4` still work? Yes, but only because it is **forced** onto Node 24. This repo's own CI on 2026-10-05 carries the annotation: "The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-python@v5 …" (`gh run view 37360975123`).
- **Recommendation for the new jobs:**
  - `actions/checkout@v7`
  - `superfly/flyctl-actions/setup-flyctl@1.6`, or pinned to SHA `ed8efb3…`. **Not** the 1.5 release, which is `node20`.
  - `docker build` needs no buildx action. If one is used, take setup-buildx v4 and build-push v7.

## 9. Docker and curl on the runner

**CONFIRMED, with one upcoming change.**

- runner-images `images/ubuntu/Ubuntu2404-Readme.md` (image 20261004.327.1): Docker Client/Server 28.0.4, Docker-Buildx 0.37.2, Compose 2.38.2, curl `8.5.0-2ubuntu10.15`.
- `Ubuntu2604-Readme.md` (20260927.149.1): Docker 29.4.2, Buildx 0.37.1, curl `8.18.0-1ubuntu2.7`. Source: https://github.com/actions/runner-images/tree/main/images/ubuntu.
- **Upcoming:** `ubuntu-latest` moves to **Ubuntu 26.04** in a rollout from **2026-10-19** to 2026-11-19 (https://github.com/actions/runner-images/issues/14748). Docker and curl are on both images, so the container job is unaffected. Pin `ubuntu-24.04` only if something else breaks.

## 10. `ipaddress` edge cases

**CONFIRMED, with notes.** Run with `python -I` on the venv's 3.12.13, and on the system 3.9.6 for comparison:

| Input | Result (3.12.13) |
|---|---|
| `'fe80::1%eth0'` | accepted, `str` = `'fe80::1%eth0'`, `scope_id='eth0'` |
| `'::1%1'` | accepted, `'::1%1'` |
| `'::ffff:1.2.3.4'` | `'::ffff:1.2.3.4'`, `ipv4_mapped=1.2.3.4` (3.9.6 gives `'::ffff:102:304'`) |
| `'2001:DB8::1'` | `'2001:db8::1'` (canonicalised) |
| `' 1.2.3.4'`, `'01.2.3.4'`, `'1.2.3.4:5678'`, `'[2001:db8::1]'`, `'a, b'` | `ValueError` |

- Python docs: an IPv6 string "may also have a scope zone ID, expressed with a suffix `%scope_id`", and "Same IPv6 addresses with different scope zone IDs are not equal". IPv4 leading zeros are rejected "Changed in version 3.9.5" (https://docs.python.org/3.12/library/ipaddress.html).
- The 3.12 source puts the scope back into `str()`: `/Users/lawrencecrasto/.local/share/mise/installs/python/3.12.13/lib/python3.12/ipaddress.py` L2007–2012 (`_ipv4_mapped_ipv6_to_str()`, then `+ '%' + self._scope_id`).
- The mapped-address formatting is version-dependent (https://github.com/python/cpython/issues/87799).
- **Recommendation:**
  - Strip the value before parsing; the spec already says so.
  - Refuse a value with a `scope_id`, since a zone means nothing in a client header.
  - Normalise with `ip = ip.ipv4_mapped or ip`, so a visitor keys the guard the same way in both spellings.
  - Use `str(ip)`, never the raw string, so `2001:DB8::1` and `2001:db8::1` get one allowance.

## 11. HTTP token grammar

**CONFIRMED.** RFC 9110 §5.6.2 (https://www.rfc-editor.org/rfc/rfc9110.txt, L1728–1744):

```
token          = 1*tchar

tchar          = "!" / "#" / "$" / "%" / "&" / "'" / "*"
               / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
               / DIGIT / ALPHA
               ; any VCHAR, except delimiters
```

Delimiters are `DQUOTE` and `"(),/:;<=>?@[\]{}"`. §5.1 (L1466) defines `field-name = token`.

The regex is `^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$`. `"Fly Client IP"` fails it on the spaces, as the spec's test expects.
