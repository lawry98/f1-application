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
