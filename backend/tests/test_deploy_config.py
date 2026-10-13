"""Guards for the deploy config, which only flyctl, Docker and the owner's shell ever read.

fly.toml, the image's CMD and the wizard's copy of the placeholder pattern reach production
without any other test parsing them, so a one-line edit to one of them would pass the rest of the
suite. Why each value is what it is: docs/adr/0005-deploy-on-fly-and-vercel.md and the deployment
spec's "Revalidated 2026-10-13" section.
"""

import json
import re
import tomllib
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import config
from api.app import create_app

REPO = Path(__file__).resolve().parents[2]
FLY_TOML = REPO / "fly.toml"
WIZARD = REPO / "scripts" / "deploy-wizard.sh"

# ADR-0005: the site shares the free tier's roughly 20 Gemini calls a day with local work. A
# briefing usually makes two; retries can make it four, and the guard's UTC day straddles Google's
# Pacific one, so this budgets the usual case and Google's own quota is the hard stop.
GEMINI_FREE_TIER_CALLS_PER_DAY = 20
GEMINI_CALLS_PER_USUAL_BRIEFING = 2


def _fly() -> dict:
    with FLY_TOML.open("rb") as f:
        return tomllib.load(f)


def _tables_holding(key: str, node: object, path: tuple[str, ...] = ()) -> Iterator[str]:
    """The dotted name of every table, at any depth, that holds ``key``."""
    if isinstance(node, dict):
        if key in node:
            yield ".".join(path) or "(top level)"
        for name, child in node.items():
            yield from _tables_holding(key, child, (*path, name))
    elif isinstance(node, list):
        for child in node:
            yield from _tables_holding(key, child, path)


def _image_command() -> list[str]:
    """The CMD of the Dockerfile fly.toml builds, read as Docker does: the last one wins."""
    dockerfile = FLY_TOML.parent / _fly()["build"]["dockerfile"]
    source = dockerfile.read_text().splitlines()
    code = "\n".join(line for line in source if not line.lstrip().startswith("#"))
    commands = re.findall(r"^\s*CMD\s+(.*)$", code.replace("\\\n", " "), re.M | re.I)
    assert commands, f"no CMD in {dockerfile}"
    return json.loads(commands[-1])  # exec form; a shell-form CMD fails to parse here


def _option(argv: list[str], flag: str) -> str | None:
    """``flag``'s value, spelled ``--flag value`` or ``--flag=value``; the last one wins, as in click."""
    value = None
    for i, arg in enumerate(argv):
        if arg == flag and i + 1 < len(argv):
            value = argv[i + 1]
        elif arg.startswith(flag + "="):
            value = arg.partition("=")[2]
    return value


def test_swap_size_mb_is_top_level_so_no_table_swallows_it():
    assert list(_tables_holding("swap_size_mb", _fly())) == ["(top level)"]


def test_deploys_roll_so_the_one_machine_is_updated_in_place():
    assert _fly().get("deploy", {}).get("strategy") == "rolling"


def test_the_machine_never_auto_stops():
    assert _fly()["http_service"].get("auto_stop_machines") == "off"


def test_min_machines_running_is_absent_since_it_does_nothing_with_auto_stop_off():
    # Fly applies it only under "stop" or "suspend" (spec R6). Present, it reads as the thing that
    # keeps the machine up, which --ha=false and auto_stop_machines = "off" actually do.
    assert list(_tables_holding("min_machines_running", _fly())) == []


def test_the_proxy_never_compresses_since_compressing_buffers_the_sse_stream():
    assert _fly()["http_service"].get("http_options", {}).get("compress") is False


def test_there_is_exactly_one_vm_a_512mb_shared_cpu_1x():
    vms = _fly().get("vm")

    assert isinstance(vms, list)
    assert len(vms) == 1
    assert vms[0].get("size") == "shared-cpu-1x"
    assert vms[0].get("memory") == "512mb"


def test_the_client_ip_header_is_fly_client_ip_the_one_header_flys_edge_overwrites():
    # X-Forwarded-For keeps a forged leftmost entry and X-Real-IP passes through (ADR-0005).
    assert _fly()["env"].get("CLIENT_IP_HEADER", "").lower() == "fly-client-ip"


@pytest.mark.parametrize("name", ["BRIEFING_DAILY_CAP", "BRIEFING_PER_IP_PER_HOUR"])
def test_each_briefing_limit_is_set_and_reads_as_a_positive_whole_number(monkeypatch, name):
    raw = _fly()["env"].get(name)
    assert raw is not None, f"{name} is unset, so the backend falls back to its local-dev default"

    monkeypatch.setenv(name, str(raw))
    # Parsed by the backend's own reader. minimum=1 for both: to the backend a daily cap of 0 means
    # no cap at all. The -1 default is what a rejected value comes back as.
    assert config._limit_from_env(name, default=-1, minimum=1) >= 1


def test_a_days_usual_briefings_fit_inside_the_gemini_free_tier():
    cap = int(_fly()["env"]["BRIEFING_DAILY_CAP"])

    assert cap * GEMINI_CALLS_PER_USUAL_BRIEFING <= GEMINI_FREE_TIER_CALLS_PER_DAY


def test_build_dockerfile_names_a_file_that_exists():
    assert (FLY_TOML.parent / _fly()["build"]["dockerfile"]).is_file()


def test_fly_routes_to_the_port_the_image_serves_on():
    assert _fly()["http_service"]["internal_port"] == int(_option(_image_command(), "--port"))


def test_the_image_runs_exactly_one_uvicorn_worker():
    assert _option(_image_command(), "--workers") == "1"


def test_the_image_runs_uvicorn_with_proxy_headers_off():
    # uvicorn's proxy headers are on by default, so a missing flag is not off; the last flag wins.
    flags = [arg for arg in _image_command() if arg in ("--proxy-headers", "--no-proxy-headers")]

    assert flags[-1:] == ["--no-proxy-headers"]


def test_every_health_check_answers_200_itself():
    checks = _fly()["http_service"].get("checks", [])
    client = TestClient(create_app(expose_docs=False))

    assert checks
    for check in checks:
        # No redirect-following: with proxy headers off, a trailing-slash redirect points at http://.
        method, path = check.get("method", "GET"), check["path"]
        response = client.request(method, path, follow_redirects=False)
        assert response.status_code == 200, f"{method} {path} answered {response.status_code}"


def test_the_wizards_placeholder_pattern_is_the_one_config_uses():
    copies = re.findall(r'^PLACEHOLDER = re\.compile\(r"([^"]*)"\)', WIZARD.read_text(), re.M)

    assert copies == [config._PLACEHOLDER_KEY.pattern]
