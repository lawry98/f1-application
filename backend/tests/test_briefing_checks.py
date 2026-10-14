"""The fact checks a captured example briefing must pass before it is committed.

The cases live in ``frontend/tests/fixtures/briefing-check-cases.json`` and the frontend's
Vitest port runs the same file, so the two checkers cannot disagree about what passes.
"""

import copy
import json
from pathlib import Path

import pytest

from scripts.briefing_checks import check_example

CASES_PATH = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "tests"
    / "fixtures"
    / "briefing-check-cases.json"
)
FIXTURE = json.loads(CASES_PATH.read_text(encoding="utf-8"))


def _merge(base: dict, patch: dict) -> dict:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _merge(base[key], value)
        else:
            base[key] = value
    return base


def build_case(case: dict) -> dict:
    example = copy.deepcopy(FIXTURE["bases"][case["base"]])
    for old, new in case.get("replace", []):
        assert old in example["briefing"]["content"], f"replace target missing: {old!r}"
        example["briefing"]["content"] = example["briefing"]["content"].replace(old, new, 1)
    return _merge(example, copy.deepcopy(case.get("patch", {})))


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=[case["name"] for case in FIXTURE["cases"]])
def test_check_case(case: dict) -> None:
    result = check_example(build_case(case))

    assert [failure["check"] for failure in result["failed"]] == case["expect"]["failed"]
    assert [flag["claim"] for flag in result["flagged"]] == case["expect"]["flagged"]


def test_a_clean_example_passes_every_check_by_name() -> None:
    result = check_example(build_case({"base": "monaco"}))

    assert [entry["check"] for entry in result["passed"]] == [
        "tools",
        "complete",
        "sections",
        "circuit",
        "standings",
        "results",
        "as_of",
        "weather",
    ]


def test_a_failure_quotes_the_sentence_it_is_about() -> None:
    result = check_example(
        build_case({"base": "monaco", "replace": [["on 131 points", "on 135 points"]]})
    )

    (failure,) = result["failed"]
    assert (
        "Kimi Antonelli leads the championship on 135 points after five races." in failure["detail"]
    )


def test_every_flag_names_its_check_section_and_reason() -> None:
    result = check_example(build_case({"base": "monaco"}))

    (flag,) = result["flagged"]
    assert flag == {
        "check": "circuit",
        "section": "Track Profile",
        "claim": "Overtaking is close to impossible, so qualifying decides most races.",
        "reason": "circuit knowledge, not in the gathered data",
    }
