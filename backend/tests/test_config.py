"""Tests for validate_config's contract, as documented in CLAUDE.md's env-var table:
a missing (or placeholder) GOOGLE_API_KEY is fatal, missing optional keys warn.

The constants are patched on the module rather than via the environment — config.py
reads env vars once at import, which happened long before any test ran.
"""

import logging

import pytest

import config


@pytest.mark.parametrize(
    "key", ["", "your-google-ai-studio-api-key-here"], ids=["missing", "placeholder"]
)
def test_an_unconfigured_google_key_exits_with_code_1(monkeypatch, key):
    monkeypatch.setattr(config, "GOOGLE_API_KEY", key)

    with pytest.raises(SystemExit) as excinfo:
        config.validate_config()

    assert excinfo.value.code == 1


def test_missing_optional_keys_warn_but_do_not_fail(monkeypatch, caplog):
    monkeypatch.setattr(config, "GOOGLE_API_KEY", "AIza-valid-key")
    monkeypatch.setattr(config, "TAVILY_API_KEY", "")
    monkeypatch.setattr(config, "OPENWEATHER_API_KEY", "")

    with caplog.at_level(logging.WARNING, logger="config"):
        assert config.validate_config() is None

    assert "news search will be disabled" in caplog.text
    assert "weather features will be disabled" in caplog.text


def test_placeholder_optional_keys_count_as_unconfigured(monkeypatch, caplog):
    """Values copied straight from env.example must warn like absent ones."""
    monkeypatch.setattr(config, "GOOGLE_API_KEY", "AIza-valid-key")
    monkeypatch.setattr(config, "TAVILY_API_KEY", "tvly-your-key-here")
    monkeypatch.setattr(config, "OPENWEATHER_API_KEY", "your-openweather-api-key-here")

    with caplog.at_level(logging.WARNING, logger="config"):
        config.validate_config()

    assert "news search will be disabled" in caplog.text
    assert "weather features will be disabled" in caplog.text


def test_a_fully_configured_environment_validates_silently(monkeypatch, caplog):
    monkeypatch.setattr(config, "GOOGLE_API_KEY", "AIza-valid-key")
    monkeypatch.setattr(config, "TAVILY_API_KEY", "tvly-real-key")
    monkeypatch.setattr(config, "OPENWEATHER_API_KEY", "a-real-openweather-key")

    with caplog.at_level(logging.WARNING, logger="config"):
        assert config.validate_config() is None

    assert caplog.records == []


@pytest.fixture
def reload_config(monkeypatch):
    """Re-read config.py under a patched environment, then restore the real reading.

    config.py reads env vars once at import, so the only way to exercise the parse is to
    re-import it. The teardown reload runs after monkeypatch has restored the environment.
    """
    import importlib

    def _reload(**env):
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        return importlib.reload(config)

    yield _reload
    monkeypatch.undo()
    importlib.reload(config)


def test_the_standings_ttl_defaults_to_five_minutes(reload_config, monkeypatch):
    monkeypatch.delenv("STANDINGS_TTL_SECONDS", raising=False)

    assert reload_config().STANDINGS_TTL_SECONDS == 300


def test_the_standings_ttl_reads_the_environment(reload_config):
    assert reload_config(STANDINGS_TTL_SECONDS="60").STANDINGS_TTL_SECONDS == 60


def test_a_zero_standings_ttl_is_honoured(reload_config):
    """Zero is how an operator turns current-season caching off, not an invalid value."""
    assert reload_config(STANDINGS_TTL_SECONDS="0").STANDINGS_TTL_SECONDS == 0


@pytest.mark.parametrize("raw", ["five", "-1"])
def test_an_invalid_standings_ttl_falls_back_to_the_default(reload_config, raw, caplog):
    with caplog.at_level(logging.WARNING, logger="config"):
        assert reload_config(STANDINGS_TTL_SECONDS=raw).STANDINGS_TTL_SECONDS == 300

    assert "STANDINGS_TTL_SECONDS" in caplog.text


# ── Briefing cost guard ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("name", "default"),
    [
        ("BRIEFING_PER_IP_PER_HOUR", 5),
        ("BRIEFING_DAILY_CAP", 100),
        ("BRIEFING_MAX_CONCURRENT", 2),
        ("BRIEFING_DEADLINE_SECONDS", 90),
    ],
)
def test_each_briefing_limit_has_its_documented_default(reload_config, monkeypatch, name, default):
    monkeypatch.delenv(name, raising=False)

    assert getattr(reload_config(), name) == default


@pytest.mark.parametrize(
    "name",
    [
        "BRIEFING_PER_IP_PER_HOUR",
        "BRIEFING_DAILY_CAP",
        "BRIEFING_MAX_CONCURRENT",
        "BRIEFING_DEADLINE_SECONDS",
    ],
)
def test_each_briefing_limit_reads_the_environment(reload_config, name):
    assert getattr(reload_config(**{name: "7"}), name) == 7


def test_a_zero_daily_cap_means_unlimited_and_is_honoured(reload_config):
    """Zero is how an operator lifts the global cap, not an invalid value."""
    assert reload_config(BRIEFING_DAILY_CAP="0").BRIEFING_DAILY_CAP == 0


@pytest.mark.parametrize(
    ("name", "default"),
    [
        ("BRIEFING_PER_IP_PER_HOUR", 5),
        ("BRIEFING_MAX_CONCURRENT", 2),
        ("BRIEFING_DEADLINE_SECONDS", 90),
    ],
)
def test_a_zero_that_would_refuse_every_briefing_falls_back_to_the_default(
    reload_config, caplog, name, default
):
    """Only the daily cap gives zero a meaning. A zero per-IP limit, slot count or deadline
    would refuse or kill every request, which is a typo far more often than a policy.
    """
    with caplog.at_level(logging.WARNING, logger="config"):
        assert getattr(reload_config(**{name: "0"}), name) == default

    assert name in caplog.text


@pytest.mark.parametrize(
    ("name", "default"),
    [
        ("BRIEFING_PER_IP_PER_HOUR", 5),
        ("BRIEFING_DAILY_CAP", 100),
        ("BRIEFING_MAX_CONCURRENT", 2),
        ("BRIEFING_DEADLINE_SECONDS", 90),
    ],
)
@pytest.mark.parametrize("raw", ["five", "-1", "2.5"])
def test_an_invalid_briefing_limit_falls_back_to_the_default(
    reload_config, caplog, name, default, raw
):
    with caplog.at_level(logging.WARNING, logger="config"):
        assert getattr(reload_config(**{name: raw}), name) == default

    assert name in caplog.text


def test_the_worst_case_llm_budget_fits_inside_the_default_deadline():
    """The arithmetic in config.py's LLM comment, kept honest.

    Every attempt of both LLM calls timing out, with tenacity's worst backoff between them,
    plus the tool fan-out's own cap, must still end before the default deadline. Raising the
    timeout or the attempt count without revisiting the deadline fails here.
    """
    from config import (
        LLM_MAX_ATTEMPTS,
        LLM_RETRY_BACKOFF_MAX_SECONDS,
        LLM_TIMEOUT_SECONDS,
        TOOL_FANOUT_TIMEOUT_SECONDS,
    )

    one_call = LLM_MAX_ATTEMPTS * LLM_TIMEOUT_SECONDS + LLM_RETRY_BACKOFF_MAX_SECONDS
    planner, synthesizer_first_chunk = one_call, one_call

    assert planner + TOOL_FANOUT_TIMEOUT_SECONDS + synthesizer_first_chunk <= 90
    # "At most two retries" — the attempt count includes the first request.
    assert 1 <= LLM_MAX_ATTEMPTS <= 3


# ── The "is this key real?" predicate ────────────────────────────────────────


@pytest.mark.parametrize(
    "value",
    [
        "",
        "   ",
        # The three values env.example ships, verbatim — copying the file without editing it
        # must leave every integration off, not send these strings upstream to earn a 401.
        "your-google-ai-studio-api-key-here",
        "tvly-your-tavily-api-key-here",
        "your-openweather-api-key-here",
        # Case and surrounding whitespace do not make a placeholder real.
        "  YOUR-OPENWEATHER-API-KEY-HERE  ",
        "tvly-your-key-here",
    ],
)
def test_empty_and_placeholder_keys_are_not_configured(value):
    assert config.is_configured(value) is False


@pytest.mark.parametrize(
    "value",
    ["AIza-valid-key", "tvly-dev-AbC123", "0123456789abcdef0123456789abcdef"],
)
def test_a_real_looking_key_is_configured(value):
    assert config.is_configured(value) is True


def test_validate_config_warns_for_a_placeholder_openweather_key_it_used_to_accept(
    monkeypatch, caplog
):
    """The old OpenWeather check was an exact match on one string, so a variant placeholder
    passed validation and went upstream. The predicate is shared, so it cannot drift again.
    """
    monkeypatch.setattr(config, "GOOGLE_API_KEY", "AIza-valid-key")
    monkeypatch.setattr(config, "TAVILY_API_KEY", "tvly-real-key")
    monkeypatch.setattr(config, "OPENWEATHER_API_KEY", "your-openweather-key")

    with caplog.at_level(logging.WARNING, logger="config"):
        config.validate_config()

    assert "weather features will be disabled" in caplog.text
