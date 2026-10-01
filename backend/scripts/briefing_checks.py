"""Fact checks for a captured example briefing.

An example is shown to a visitor as a stand-in for a live briefing, so it has to be right, and
its prose is never edited: an example that fails a check is recaptured or dropped. This reads the
prose back against the minimal tool data the capture kept (``evidence``) and sorts every claim
into one of three piles:

- **failed** — the data contradicts it. Nothing with a failure is committed.
- **flagged** — the data cannot settle it (general circuit knowledge, a result outside the
  seasons gathered, a figure nothing checks). Listed for a human to review.
- otherwise it was verified, and only the counts reach ``passed``.

``frontend/tests/briefing-example-checks.ts`` is a line-for-line port that the frontend suite
runs over every committed example, and both run the cases in
``frontend/tests/fixtures/briefing-check-cases.json``. Change one, change the other, and add the
case to that file. Every pattern here is written so it means the same in JavaScript: ASCII word
classes, fixed-width lookbehind, accents stripped before matching.

Stdlib only, so the frontend's CI never needs this file's dependencies — and nothing here
imports the app.
"""

import re
import unicodedata
from itertools import pairwise
from typing import Any

SECTIONS = (
    "Track Profile",
    "Championship Context",
    "Form Guide",
    "Key Storylines",
    "Weather Watch",
    "Predictions",
)
CHECK_ORDER = (
    "tools",
    "complete",
    "sections",
    "circuit",
    "standings",
    "results",
    "as_of",
    "weather",
)

FLAGS = re.A | re.I
CASED = re.A

# Longest alternatives first, so "seventeen" is never read as "seven".
NUM = (
    r"(?:\d+(?:\.\d+)?"
    r"|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)"
    r"(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?"
    r"|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten"
    r"|nine|eight|seven|six|five|four|three|two|one|zero)"
)
WORD_VALUES = {
    word: value
    for value, word in enumerate(
        [
            "zero",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
        ]
    )
}
TENS_VALUES = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}
ORDINALS = (
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
)
ORDINAL = "(?:" + "|".join(ORDINALS) + ")"
MONTHS = (
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
)

# Points per finishing place: a Grand Prix, then a sprint's 8 to 1.
SCORING = (25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 7, 5, 3)
# A constructor can score both cars' points: P1 + P2.
TEAM_GP_MAX = 25 + 18
TEAM_SPRINT_MAX = 8 + 7

HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$", CASED)
LIST_MARKER = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+", CASED)
LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)", CASED)
EMPHASIS = re.compile(r"(?<![A-Za-z0-9])[*_]+(?=\S)|(?<=\S)[*_]+(?![A-Za-z0-9])", CASED)
SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\[])", CASED)
DIGITS = re.compile(r"\d+(?:[.,:]\d+)*", CASED)
YEAR = re.compile(r"(?<![A-Za-z0-9])(19\d\d|20\d\d)(?![A-Za-z0-9])", CASED)
RELATIVE_YEAR = re.compile(r"\b(last|this)\s+(year|season)\b", FLAGS)

IGNORED = [
    re.compile(r"\b(?:Practice|FP|Q|SQ)\s?\d\b", FLAGS),
    re.compile(r"\bSprint Qualifying\s?\d\b", FLAGS),
    re.compile(r"\bTurns?\s+\d+(?:\s*(?:-|and|to)\s*\d+)?\b", FLAGS),
    re.compile(r"\bT\d{1,2}\b", CASED),
    re.compile(r"\bF[12]\b", CASED),
    re.compile(r"\bFormula\s+[12]\b", FLAGS),
]

HERE = re.compile(r"\b(?:here|this circuit|this track|this venue|this race|this event)\b", FLAGS)
LAST_TIME = re.compile(
    r"\b(?:last time out|last race|latest race|most recent race|last round|last weekend"
    r"|previous race|last outing|last start)\b",
    FLAGS,
)

WIN = re.compile(r"\b(?:won|wins|win|winning|winner|winners|victory|victories|triumphed)\b", FLAGS)
MODAL_BEFORE = re.compile(
    r"\b(?:to|will|could|can|would|might|may|should|must|bid|chance|chasing|chase|hunt"
    r"|seeking|eyeing)\s+(?:[A-Za-z']+\s+)?$",
    FLAGS,
)
TITLE_AFTER = re.compile(r"^\s+(?:\S+\s+){0,3}?(?:titles?|championships?|crowns?)\b", FLAGS)
POSITION = re.compile(r"(?<![A-Za-z0-9])P([1-9]|1\d|2[0-2])(?![A-Za-z0-9])", CASED)
PLACE = re.compile(r"\b(" + ORDINAL + r")[- ]place\b", FLAGS)
FINISHED = re.compile(
    r"\b(?:finished|came|took|placed|claimed)\s+(" + ORDINAL + r"|\d{1,2}(?:st|nd|rd|th))\b",
    FLAGS,
)
NUMBERED_PLACE = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)[- ]place\b", FLAGS)
RUNNER_UP = re.compile(r"\brunner-up\b", FLAGS)
PODIUM = re.compile(r"\bpodiums?\b", FLAGS)
DNF = re.compile(r"\bDNF\b|\bdid not finish\b|\bretired\b", FLAGS)

STREAKS = [
    (
        re.compile(
            r"\b(" + NUM + r")\s+(?:consecutive|straight|successive)\s+(?:race\s+)?"
            r"(wins|victories|podiums|podium finishes)\b",
            FLAGS,
        ),
        "streak",
    ),
    (re.compile(r"\b(" + NUM + r")\s+(wins|victories|podiums)\s+in\s+a\s+row\b", FLAGS), "streak"),
    (
        re.compile(r"\bwon\s+(" + NUM + r")\s+(?:races\s+|grands prix\s+)?(in\s+a\s+row)\b", FLAGS),
        "streak",
    ),
    (
        re.compile(
            r"\bwon\s+("
            + NUM
            + r")\s+(of)\s+(?:the|his|her|their)\s+(?:last|past)\s+("
            + NUM
            + r")\b",
            FLAGS,
        ),
        "count",
    ),
    (
        re.compile(
            r"\b(" + NUM + r")\s+(wins|victories|podiums)\s+(?:from|in)\s+(?:the|his|her|their)"
            r"\s+(?:last|past)\s+(" + NUM + r")\b",
            FLAGS,
        ),
        "count",
    ),
]

STANDINGS_CONTEXT = re.compile(r"\b(?:championship|standings|title|table|points|leader)\b", FLAGS)
LEADS = re.compile(r"\b(?:leads|leading|leader|lead the|tops|top of the|heads the)\b", FLAGS)
STANDING_PLACE = re.compile(
    r"\b(" + ORDINAL + r"|P\d{1,2})(?:\s+(?:place|position))?"
    r"(?=\s+(?:in|on|with)\s+(?:\S+\s+){0,2}?(?:championship|standings|table|points)\b)",
    FLAGS,
)

POINTS = re.compile(r"(?<![A-Za-z0-9.])(" + NUM + r")(?:\s*-\s*|\s+)(?:points?|pts)\b", FLAGS)
RACES_DONE = [
    re.compile(r"\b(?:after|through)\s+(" + NUM + r")\s+(?:races|rounds|grands prix)\b", FLAGS),
    re.compile(
        r"\b(" + NUM + r")\s+(?:races|rounds|grands prix)\s+(?:completed|into|so far|down|gone"
        r"|run|held|have been)\b",
        FLAGS,
    ),
]
REMAINING = re.compile(
    r"\b(" + NUM + r")\s+(?:races|rounds|grands prix)\s+(?:remaining|left|to go|to run)\b", FLAGS
)
ROUND_OF = re.compile(r"\bround\s+(\d{1,2})\s+of\s+(\d{1,2})\b", FLAGS)
THIS_ROUND = re.compile(r"\b(?:this|it)\s+(?:is|marks)\s+round\s+(\d{1,2})\b", FLAGS)
CALENDAR = re.compile(r"\b(\d{1,2})-(?:race|round)\s+(?:calendar|season|schedule)\b", FLAGS)

KM = re.compile(r"(\d+(?:\.\d+)?)\s*(?:km|kilometres|kilometers)\b", FLAGS)
METRES = re.compile(r"(\d{1,2},?\d{3})\s*(?:m|metres|meters)\b", FLAGS)
MILES = re.compile(r"(\d+(?:\.\d+)?)\s*(?:miles|mi)\b", FLAGS)

TEMPERATURE = re.compile(
    r"(-?\d+(?:\.\d+)?)(?:\s*°\s*([CF])?|\s*degrees(?:\s+(Celsius|Fahrenheit))?|([CF])(?![A-Za-z0-9]))",
    FLAGS,
)
RAIN = re.compile(r"(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)", FLAGS)
WIND = re.compile(r"(\d+(?:\.\d+)?)\s*(m/s|km/h|kph|mph)", FLAGS)
TRACK_TEMPERATURE = re.compile(r"\btrack temp", FLAGS)
NOT_IN_FORECAST = re.compile(
    r"\b(?:not (?:yet )?(?:in|within|covered by) the forecast|outside the forecast"
    r"|beyond the forecast|forecast (?:does not|doesn't|won't|will not) (?:yet )?(?:reach|cover))",
    FLAGS,
)
NOT_GATHERED = re.compile(
    r"\b(?:not (?:been )?(?:gathered|collected|included|available|applicable|provided|retrieved"
    r"|part of)|no (?:weather|forecast)|(?:isn't|aren't|wasn't|weren't) (?:gathered|collected"
    r"|included|available|applicable|provided)|already (?:been )?run|does not apply"
    r"|doesn't apply|unavailable)",
    FLAGS,
)
TIME_OF_DAY = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", CASED)


def norm(text: str) -> str:
    """Accents stripped and typographic quotes flattened, so patterns match ASCII alike."""
    stripped = "".join(
        ch for ch in unicodedata.normalize("NFD", text) if not "\u0300" <= ch <= "\u036f"
    )
    return (
        stripped.replace("\u2019", "'")
        .replace("\u2018", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )


def num_value(token: str) -> float:
    token = token.lower()
    if token[0].isdigit():
        return float(token)
    if token in WORD_VALUES:
        return float(WORD_VALUES[token])
    parts = re.split(r"[- ]", token)
    return float(TENS_VALUES[parts[0]] + (WORD_VALUES[parts[1]] if len(parts) > 1 else 0))


def fmt(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def term_pattern(term: str, flags: int = FLAGS) -> re.Pattern[str]:
    return re.compile(r"(?<![A-Za-z0-9])" + re.escape(norm(term)) + r"(?![A-Za-z0-9])", flags)


def ordinal_value(word: str) -> int:
    word = word.lower()
    if word[0].isdigit():
        return int(re.match(r"\d+", word).group(0))
    return ORDINALS.index(word) + 1


def minute(iso: str) -> str:
    return f"{iso[:10]} {iso[11:16]} UTC"


# --- the briefing as units --------------------------------------------------------------------


def clean_inline(text: str) -> str:
    text = LINK.sub(r"\1", text)
    text = EMPHASIS.sub("", text)
    return text.replace("`", "").strip()


def parse_units(markdown: str) -> tuple[list[dict[str, Any]], list[str]]:
    """Every sentence with its section, and the canonical sections seen, in order."""
    units: list[dict[str, Any]] = []
    seen: list[str] = []
    section = "Preamble"
    for raw in markdown.split("\n"):
        heading = HEADING.match(raw)
        if heading:
            title = norm(clean_inline(heading.group(2))).lower()
            canonical = next((s for s in SECTIONS if s.lower() in title), None)
            if canonical:
                section = canonical
                if canonical not in seen:
                    seen.append(canonical)
            elif len(heading.group(1)) == 1:
                section = "Preamble"
            continue
        text = clean_inline(LIST_MARKER.sub("", raw))
        if not text:
            continue
        for sentence in SENTENCE_BREAK.split(text):
            sentence = sentence.strip()
            if sentence:
                units.append({"section": section, "text": sentence, "norm": norm(sentence)})
    return units, seen


# --- who and what a sentence names -------------------------------------------------------------


def team_aliases(team: str) -> list[str]:
    aliases = [team]
    for suffix in (" F1 Team", " Racing", " F1"):
        if team.endswith(suffix) and len(team) > len(suffix):
            aliases.append(team[: -len(suffix)])
    return aliases


def build_context(example: dict[str, Any]) -> dict[str, Any]:
    evidence = example["evidence"]
    race = example["race_info"]
    standings = evidence.get("standings")

    drivers = []
    for driver in evidence.get("drivers") or []:
        patterns = [term_pattern(driver["name"]), term_pattern(driver["surname"])]
        patterns.append(term_pattern(driver["code"], CASED))
        drivers.append({"code": driver["code"], "patterns": patterns})

    teams: list[str] = []
    if standings:
        for row in standings["constructors"]:
            if row["team"] not in teams:
                teams.append(row["team"])
        for row in standings["drivers"]:
            if row["team"] not in teams:
                teams.append(row["team"])
    team_entries = [
        {"team": team, "patterns": [term_pattern(alias) for alias in team_aliases(team)]}
        for team in teams
    ]

    entries = []
    for index, entry in enumerate(evidence.get("results") or []):
        names = [entry["event"], entry["event"].replace("Grand Prix", "GP")]
        stem = entry["event"].replace(" Grand Prix", "")
        if stem != entry["event"]:
            names.append(stem)
        if entry.get("location"):
            names.append(entry["location"])
        aliases = []
        for name in names:
            key = norm(name).lower()
            if key not in aliases:
                aliases.append(key)
        entries.append(
            {**entry, "index": index, "patterns": [term_pattern(alias) for alias in aliases]}
        )

    return {
        "race": race,
        "evidence": evidence,
        "drivers": drivers,
        "teams": team_entries,
        "entries": entries,
        "cutoff_year": int(race["as_of"][:4]),
    }


def find_all(pattern: re.Pattern[str], text: str) -> list[tuple[int, int]]:
    return [(m.start(), m.end()) for m in pattern.finditer(text)]


def mentions(ctx: dict[str, Any], text: str) -> list[dict[str, Any]]:
    """Drivers and teams the sentence names, as spans, overlaps resolved to the longest."""
    found = []
    for driver in ctx["drivers"]:
        for pattern in driver["patterns"]:
            for start, end in find_all(pattern, text):
                found.append({"kind": "driver", "key": driver["code"], "start": start, "end": end})
    for team in ctx["teams"]:
        for pattern in team["patterns"]:
            for start, end in find_all(pattern, text):
                found.append({"kind": "team", "key": team["team"], "start": start, "end": end})
    found.sort(key=lambda m: (m["start"], -(m["end"] - m["start"])))
    kept: list[dict[str, Any]] = []
    for mention in found:
        if kept and mention["start"] < kept[-1]["end"]:
            continue
        kept.append(mention)
    return kept


def nearest(found: list[dict[str, Any]], start: int, end: int, kind: str | None) -> dict | None:
    best = None
    best_key = None
    for mention in found:
        if kind and mention["kind"] != kind:
            continue
        if mention["end"] <= start:
            distance, after = start - mention["end"], 0
        elif mention["start"] >= end:
            distance, after = mention["start"] - end, 1
        else:
            distance, after = 0, 0
        key = (distance, after, mention["start"])
        if best_key is None or key < best_key:
            best, best_key = mention, key
    return best


# --- per-sentence analysis ----------------------------------------------------------------------


class Sentence:
    """One sentence's outcomes: a failure, an unverified claim, or verified items."""

    def __init__(self, unit: dict[str, Any], index: int) -> None:
        self.section = unit["section"]
        self.text = unit["text"]
        self.norm = unit["norm"]
        self.index = index
        self.consumed: list[tuple[int, int]] = []
        self.failures: list[tuple[str, str]] = []
        self.unverified: list[tuple[int, str, str]] = []
        self.verified_numbers = 0

    def consume(self, start: int, end: int) -> None:
        self.consumed.append((start, end))

    def overlaps(self, start: int, end: int) -> bool:
        return any(s < end and start < e for s, e in self.consumed)

    def fail(self, check: str, why: str) -> None:
        self.failures.append((check, why))

    def flag(self, priority: int, check: str, reason: str) -> None:
        self.unverified.append((priority, check, reason))


PRIORITY_YEAR, PRIORITY_RESULT, PRIORITY_STANDING, PRIORITY_FORM = 0, 1, 2, 3
PRIORITY_TRACK_TEMP, PRIORITY_FIGURE, PRIORITY_CIRCUIT = 4, 5, 6


def pre_consume(ctx: dict[str, Any], s: Sentence) -> None:
    for pattern in IGNORED:
        for start, end in find_all(pattern, s.norm):
            s.consume(start, end)
    race_year = str(ctx["race"]["year"])
    for match in YEAR.finditer(s.norm):
        if match.group(1) == race_year:
            s.consume(match.start(1), match.end(1))
    for match in TIME_OF_DAY.finditer(s.norm):
        hhmm = f"{int(match.group(1)):02d}:{match.group(2)}"
        if any(session["start"][11:16] == hhmm for session in ctx["race"]["sessions"]):
            s.consume(match.start(), match.end())
    known_dates = {ctx["race"]["date"][:10], ctx["race"]["as_of"][:10]}
    known_dates.update(session["start"][:10] for session in ctx["race"]["sessions"])
    weather = ctx["evidence"].get("weather") or {}
    if weather.get("available_from"):
        known_dates.add(weather["available_from"])
    for date in known_dates:
        for start, end in find_all(date_pattern(date), s.norm):
            s.consume(start, end)


def date_pattern(iso_date: str) -> re.Pattern[str]:
    year, month, day = iso_date.split("-")
    name = MONTHS[int(month) - 1]
    month_alt = f"(?:{name}|{name[:3]}\\.?)"
    day_alt = f"0?{int(day)}(?:st|nd|rd|th)?"
    return re.compile(
        rf"\b(?:{day_alt}\s+(?:of\s+)?{month_alt}|{month_alt}\s+{day_alt})\b(?:,?\s+{year})?"
        rf"|\b{year}-{month}-{day}\b",
        FLAGS,
    )


def check_circuit_sentence(ctx: dict[str, Any], s: Sentence) -> None:
    for term in ctx["evidence"].get("other_venues") or []:
        if term_pattern(term).search(s.norm):
            s.fail(
                "circuit",
                f"names {term}, which hosted an earlier {ctx['race']['name']}, not this circuit",
            )
    track = ctx["evidence"].get("track") or {}
    length = track.get("length_km")
    if length:
        for pattern, scale in ((KM, 1.0), (MILES, 0.621371), (METRES, 1000.0)):
            for match in pattern.finditer(s.norm):
                raw = match.group(1).replace(",", "")
                value = float(raw)
                decimals = len(raw.split(".")[1]) if "." in raw else 0
                expected = length * scale
                tolerance = 0.5 * 10 ** (-decimals) + 0.001
                if scale == 1000.0:
                    tolerance = 5.0 if raw.endswith("0") else 0.5
                s.consume(match.start(1), match.end(1))
                if abs(value - expected) <= tolerance:
                    s.verified_numbers += 1
                elif 0.7 * expected <= value <= 1.3 * expected:
                    s.fail(
                        "circuit",
                        f"quotes {match.group(0).strip()}, but {track['circuit']} is "
                        f"{fmt(length)} km",
                    )
                else:
                    s.consumed.pop()
    first = track.get("first_grand_prix")
    if first and s.section == "Track Profile":
        for match in YEAR.finditer(s.norm):
            if int(match.group(1)) == first:
                s.consume(match.start(1), match.end(1))
                s.verified_numbers += 1


def standings_values(ctx: dict[str, Any], found: list[dict[str, Any]]) -> list[float]:
    evidence = ctx["evidence"]
    standings = evidence["standings"]
    season = evidence.get("season") or {}
    drivers = {row["driver_code"]: row["points"] for row in standings["drivers"]}
    teams = {row["team"]: row["points"] for row in standings["constructors"]}
    form = (evidence.get("form") or {}).get("drivers") or {}

    allowed = [float(value) for value in SCORING]
    remaining = season.get("remaining_grands_prix")
    if remaining is not None:
        sprints = season.get("remaining_sprints") or 0
        this_sprint = 1 if season.get("this_weekend_sprint") else 0
        allowed += [
            remaining * 25 + sprints * 8,
            (remaining - 1) * 25 + (sprints - this_sprint) * 8,
            remaining * TEAM_GP_MAX + sprints * TEAM_SPRINT_MAX,
            (remaining - 1) * TEAM_GP_MAX + (sprints - this_sprint) * TEAM_SPRINT_MAX,
            25 + 8 * this_sprint,
            TEAM_GP_MAX + TEAM_SPRINT_MAX * this_sprint,
        ]

    named = [m for m in found if m["kind"] == "driver" and m["key"] in drivers]
    named_teams = [m for m in found if m["kind"] == "team" and m["key"] in teams]
    if named or named_teams:
        for mention in named:
            own = drivers[mention["key"]]
            allowed.append(own)
            allowed += [abs(own - other) for other in drivers.values()]
            if mention["key"] in form:
                allowed.append(form[mention["key"]]["points"])
        for mention in named_teams:
            own = teams[mention["key"]]
            allowed.append(own)
            allowed += [abs(own - other) for other in teams.values()]
        return allowed

    for table in (standings["drivers"], standings["constructors"]):
        points = [row["points"] for row in table]
        allowed += points
        allowed += [abs(a - b) for a, b in pairwise(points)]
        if points:
            allowed += [points[0] - p for p in points[1:]]
    allowed += [line["points"] for line in form.values()]
    return allowed


def check_standings_sentence(
    ctx: dict[str, Any], s: Sentence, found: list[dict[str, Any]], counts: dict[str, int]
) -> None:
    evidence = ctx["evidence"]
    standings = evidence.get("standings")
    season = evidence.get("season") or {}
    race = ctx["race"]

    for match in ROUND_OF.finditer(s.norm):
        s.consume(match.start(1), match.end(1))
        s.consume(match.start(2), match.end(2))
        if int(match.group(1)) != race["round"]:
            s.fail(
                "standings", f"calls this round {match.group(1)}, but it is round {race['round']}"
            )
        elif season.get("rounds") and int(match.group(2)) != season["rounds"]:
            s.fail(
                "standings", f"gives {match.group(2)} rounds, but the season has {season['rounds']}"
            )
        else:
            counts["season"] += 1
    for match in THIS_ROUND.finditer(s.norm):
        if s.overlaps(match.start(1), match.end(1)):
            continue
        s.consume(match.start(1), match.end(1))
        if int(match.group(1)) != race["round"]:
            s.fail(
                "standings", f"calls this round {match.group(1)}, but it is round {race['round']}"
            )
        else:
            counts["season"] += 1
    for match in CALENDAR.finditer(s.norm):
        s.consume(match.start(1), match.end(1))
        if season.get("rounds") and int(match.group(1)) != season["rounds"]:
            s.fail(
                "standings", f"gives {match.group(1)} rounds, but the season has {season['rounds']}"
            )
        else:
            counts["season"] += 1
    remaining = season.get("remaining_grands_prix")
    for match in REMAINING.finditer(s.norm):
        s.consume(match.start(1), match.end(1))
        value = num_value(match.group(1))
        if remaining is not None and value not in (remaining, remaining - 1):
            s.fail(
                "standings",
                f"leaves {fmt(value)} races, but {remaining} remain including this one",
            )
        else:
            counts["season"] += 1

    if not standings:
        for match in POINTS.finditer(s.norm):
            s.consume(match.start(1), match.end(1))
            s.fail("standings", f"quotes {match.group(0)} with no standings gathered")
        return

    for pattern in RACES_DONE:
        for match in pattern.finditer(s.norm):
            if s.overlaps(match.start(1), match.end(1)):
                continue
            s.consume(match.start(1), match.end(1))
            value = num_value(match.group(1))
            if value != standings["races_completed"]:
                s.fail(
                    "standings",
                    f"counts {fmt(value)} races, but {standings['races_completed']} had been run",
                )
            else:
                counts["season"] += 1

    allowed = standings_values(ctx, found)
    for match in POINTS.finditer(s.norm):
        s.consume(match.start(1), match.end(1))
        value = num_value(match.group(1))
        if any(abs(value - candidate) < 0.01 for candidate in allowed):
            counts["points"] += 1
        else:
            s.fail(
                "standings",
                f"quotes {fmt(value)} points, which no {standings['year']} table value or gap "
                "involving who it names gives",
            )


def standings_position(ctx: dict[str, Any], mention: dict[str, Any]) -> int | None:
    standings = ctx["evidence"].get("standings")
    if not standings:
        return None
    if mention["kind"] == "driver":
        rows = [r for r in standings["drivers"] if r["driver_code"] == mention["key"]]
    else:
        rows = [r for r in standings["constructors"] if r["team"] == mention["key"]]
    return rows[0]["position"] if rows else None


def check_standing_claims(
    ctx: dict[str, Any], s: Sentence, found: list[dict[str, Any]], counts: dict[str, int]
) -> None:
    if not STANDINGS_CONTEXT.search(s.norm) or not found:
        return
    claims = []
    for match in LEADS.finditer(s.norm):
        claims.append((1, match.start(), match.end()))
    for match in STANDING_PLACE.finditer(s.norm):
        token = match.group(1)
        value = int(token[1:]) if token[0] in "Pp" and token[1:].isdigit() else ordinal_value(token)
        s.consume(match.start(1), match.end(1))
        claims.append((value, match.start(1), match.end(1)))
    for value, start, end in claims:
        paired = nearest(found, start, end, None)
        if paired is None:
            continue
        if standings_position(ctx, paired) == value:
            counts["positions"] += 1
            continue
        if any(m["kind"] == paired["kind"] and standings_position(ctx, m) == value for m in found):
            counts["positions"] += 1
            continue
        if standings_position(ctx, paired) is None:
            s.flag(PRIORITY_STANDING, "standings", "standings claim the table does not settle")
            continue
        s.fail(
            "standings",
            f"puts {paired['key']} {fmt(value)} in the table, but they are "
            f"{standings_position(ctx, paired)}",
        )


def race_groups(ctx: dict[str, Any], s: Sentence) -> tuple[list[list[dict]], bool]:
    """The results entries each race mention identifies, filtered by any year the sentence names."""
    groups: list[list[dict]] = []
    for entry in ctx["entries"]:
        if any(p.search(s.norm) for p in entry["patterns"]):
            groups.append([entry])
    if HERE.search(s.norm):
        groups.append(
            [
                e
                for e in ctx["entries"]
                if e["source"] in ("get_recent_race_results", "get_circuit_winners")
            ]
        )
    if LAST_TIME.search(s.norm):
        groups.append([e for e in ctx["entries"] if e["source"] == "get_recent_top_finishers"])

    years = set()
    year_spans = []
    for match in YEAR.finditer(s.norm):
        year = int(match.group(1))
        if year <= ctx["cutoff_year"]:
            years.add(year)
            year_spans.append((match.start(1), match.end(1)))
    for match in RELATIVE_YEAR.finditer(s.norm):
        offset = 1 if match.group(1).lower() == "last" else 0
        years.add(ctx["race"]["year"] - offset)
    if years:
        groups = [[e for e in group if e["year"] in years] for group in groups]
        if any(group for group in groups):
            for start, end in year_spans:
                s.consume(start, end)
    return [g for g in groups if g], bool(years)


def holds(entry: dict[str, Any], code: str, kind: str, value: int) -> bool | None:
    position = entry["positions"].get(code)
    if position is None:
        depth = entry.get("depth")
        if depth is None or kind == "dnf":
            return None
        need = {"win": 1, "pos": value, "podium": 3}[kind]
        return False if need <= depth else None
    if kind == "dnf":
        return position == "DNF"
    if not isinstance(position, int):
        return False
    if kind == "win":
        return position == 1
    if kind == "pos":
        return position == value
    return position <= 3


def form_positions(results: list[str]) -> list[int | None]:
    return [int(r[1:]) if r.startswith("P") and r[1:].isdigit() else None for r in results]


def check_streaks(
    ctx: dict[str, Any], s: Sentence, found: list[dict[str, Any]], counts: dict[str, int]
) -> list[tuple[int, int]]:
    spans = []
    form = (ctx["evidence"].get("form") or {}).get("drivers") or {}
    for pattern, kind in STREAKS:
        for match in pattern.finditer(s.norm):
            spans.append((match.start(), match.end()))
            s.consume(match.start(1), match.end(1))
            if kind == "count":
                s.consume(match.start(3), match.end(3))
            paired = nearest(found, match.start(), match.end(), "driver")
            if paired is None:
                continue
            noun = match.group(2).lower()
            podium = noun.startswith("podium")
            line = form.get(paired["key"])
            if line is None:
                s.flag(PRIORITY_FORM, "results", "form claim outside the gathered window")
                continue
            positions = form_positions(line["results"])
            hits = [p is not None and (p <= 3 if podium else p == 1) for p in positions]
            n = num_value(match.group(1))
            if kind == "streak":
                trailing = 0
                for hit in reversed(hits):
                    if not hit:
                        break
                    trailing += 1
                longest = run = 0
                for hit in hits:
                    run = run + 1 if hit else 0
                    longest = max(longest, run)
                ok = n in (trailing, longest)
                if not ok and n > len(hits):
                    s.flag(PRIORITY_FORM, "results", "form claim outside the gathered window")
                    continue
            else:
                window = int(num_value(match.group(3)))
                if window > len(hits):
                    s.flag(PRIORITY_FORM, "results", "form claim outside the gathered window")
                    continue
                ok = n == sum(hits[-window:])
            if ok:
                counts["results"] += 1
            else:
                s.fail(
                    "results",
                    f"gives {paired['key']} a streak their last {len(hits)} Grands Prix "
                    f"({', '.join(line['results'])}) do not show",
                )
    return spans


def result_claims(s: Sentence, skip: list[tuple[int, int]]) -> list[tuple[str, int, int, int]]:
    def inside(start: int, end: int) -> bool:
        return any(a <= start and end <= b for a, b in skip)

    claims = []
    for match in WIN.finditer(s.norm):
        if inside(match.start(), match.end()):
            continue
        if MODAL_BEFORE.search(s.norm[: match.start()]):
            continue
        if TITLE_AFTER.search(s.norm[match.end() :]):
            continue
        claims.append(("win", 1, match.start(), match.end()))
    for match in POSITION.finditer(s.norm):
        if s.overlaps(match.start(), match.end()):
            continue
        claims.append(("pos", int(match.group(1)), match.start(), match.end()))
    for pattern in (PLACE, FINISHED, NUMBERED_PLACE):
        for match in pattern.finditer(s.norm):
            if s.overlaps(match.start(1), match.end(1)):
                continue
            claims.append(("pos", ordinal_value(match.group(1)), match.start(1), match.end(1)))
    for match in RUNNER_UP.finditer(s.norm):
        claims.append(("pos", 2, match.start(), match.end()))
    for match in PODIUM.finditer(s.norm):
        if inside(match.start(), match.end()):
            continue
        claims.append(("podium", 3, match.start(), match.end()))
    for match in DNF.finditer(s.norm):
        claims.append(("dnf", 0, match.start(), match.end()))
    return claims


def check_results_sentence(
    ctx: dict[str, Any], s: Sentence, found: list[dict[str, Any]], counts: dict[str, int]
) -> None:
    spans = check_streaks(ctx, s, found, counts)
    drivers = [m for m in found if m["kind"] == "driver"]
    if not drivers:
        return
    claims = result_claims(s, spans)
    if not claims:
        return
    groups, named_year = race_groups(ctx, s)
    pool = [entry for group in groups for entry in group]
    distinct = {(e["year"], norm(e["event"]).lower()) for e in pool}

    for kind, value, start, end in claims:
        paired = nearest(drivers, start, end, "driver")
        if kind in ("pos",) and not s.overlaps(start, end):
            s.consume(start, end)
        outcomes = [holds(entry, paired["key"], kind, value) for entry in pool]
        if True in outcomes:
            counts["results"] += 1
        elif False in outcomes and (len(distinct) == 1 or named_year):
            races = ", ".join(sorted({f"{e['year']} {e['event']}" for e in pool}))
            s.fail(
                "results",
                f"says {paired['key']} {describe(kind, value)}, which the {races} data does not show",
            )
        else:
            s.flag(PRIORITY_RESULT, "results", "result not in the gathered data")


def describe(kind: str, value: int) -> str:
    if kind == "win":
        return "won"
    if kind == "pos":
        return f"finished P{value}"
    if kind == "podium":
        return "finished on the podium"
    return "did not finish"


def check_as_of_sentence(ctx: dict[str, Any], s: Sentence) -> None:
    race = ctx["race"]
    for match in YEAR.finditer(s.norm):
        year = int(match.group(1))
        if year > ctx["cutoff_year"]:
            s.consume(match.start(1), match.end(1))
            s.flag(PRIORITY_YEAR, "as_of", f"mentions {year}, after the briefing's cutoff")
    if race["is_upcoming"]:
        return
    for event in ctx["evidence"].get("later_events") or []:
        for name in (event, event.replace("Grand Prix", "GP")):
            if term_pattern(name).search(s.norm):
                s.fail("as_of", f"mentions the {event}, run after the cutoff")
                break
    own = [term_pattern(race["name"]), term_pattern(race["name"].replace("Grand Prix", "GP"))]
    if any(p.search(s.norm) for p in own) and term_pattern(str(race["year"])).search(s.norm):
        for match in WIN.finditer(s.norm):
            if MODAL_BEFORE.search(s.norm[: match.start()]):
                continue
            s.fail("as_of", f"gives the result of the {race['year']} {race['name']} itself")
            break


def check_weather_sentence(ctx: dict[str, Any], s: Sentence, status: str, counts: dict) -> None:
    weather = ctx["evidence"].get("weather") or {}
    sessions = [x for x in weather.get("sessions") or [] if x.get("temperature_c") is not None]
    figures = []
    for match in TEMPERATURE.finditer(s.norm):
        unit = (match.group(2) or match.group(3) or match.group(4) or "C")[0].upper()
        figures.append(("temperature", unit, float(match.group(1)), match.start(1), match.end(1)))
    for match in RAIN.finditer(s.norm):
        figures.append(("rain", "%", float(match.group(1)), match.start(1), match.end(1)))
    for match in WIND.finditer(s.norm):
        figures.append(
            ("wind", match.group(2).lower(), float(match.group(1)), match.start(1), match.end(1))
        )

    if status != "forecast":
        for _, _, _, start, end in figures:
            s.consume(start, end)
        if figures:
            s.fail("weather", f"quotes conditions, but {WEATHER_WHY[status]}")
        return

    if NOT_IN_FORECAST.search(s.norm):
        s.fail("weather", "says the weekend is not in the forecast, but it is")
    track = bool(TRACK_TEMPERATURE.search(s.norm))
    for kind, unit, value, start, end in figures:
        s.consume(start, end)
        if kind == "temperature" and track:
            s.flag(
                PRIORITY_TRACK_TEMP,
                "weather",
                "track temperature, which the forecast does not give",
            )
            continue
        if any(matches_forecast(kind, unit, value, session) for session in sessions):
            counts["weather"] += 1
        else:
            s.fail(
                "weather",
                f"quotes {fmt(value)}{unit_label(kind, unit)}, which no session's forecast gives",
            )


WEATHER_WHY = {
    "not_gathered": "no forecast was gathered for this race",
    "outside": "the weekend is outside the forecast",
    "weekend_over": "the weekend is over",
}


def unit_label(kind: str, unit: str) -> str:
    if kind == "temperature":
        return f"°{unit}"
    if kind == "rain":
        return "%"
    return f" {unit}"


def matches_forecast(kind: str, unit: str, value: float, session: dict[str, Any]) -> bool:
    if kind == "temperature":
        celsius = session["temperature_c"]
        if unit == "F":
            return abs(value - (celsius * 9 / 5 + 32)) <= 1
        return abs(value - celsius) <= 0.5
    if kind == "rain":
        return (
            session.get("rain_probability") is not None
            and abs(value - session["rain_probability"]) <= 0.5
        )
    wind = session.get("wind_speed_ms")
    if wind is None:
        return False
    if unit == "m/s":
        return abs(value - wind) <= 0.5
    if unit == "mph":
        return abs(value - wind * 2.237) <= 2
    return abs(value - wind * 3.6) <= 2


def weather_status(example: dict[str, Any]) -> str:
    if "get_race_weather" not in example["tool_plan"]:
        return "not_gathered"
    status = ((example["evidence"].get("weather") or {}).get("status")) or "not_gathered"
    if status in ("ok", "partial"):
        return "forecast"
    if status == "outside_forecast_range":
        return "outside"
    return status


def unchecked_figures(s: Sentence) -> list[str]:
    return [m.group(0) for m in DIGITS.finditer(s.norm) if not s.overlaps(m.start(), m.end())]


# --- the example -------------------------------------------------------------------------------


def check_example(example: dict[str, Any]) -> dict[str, list]:
    """Sort an example's claims into passed, flagged and failed. See the module docstring."""
    race = example["race_info"]
    evidence = example["evidence"]
    content = example["briefing"]["content"]
    units, seen = parse_units(content)
    ctx = build_context(example)
    failed: list[dict[str, str]] = []
    passed: list[dict[str, str]] = []

    tools = example["tools"]
    succeeded = [t for t in tools if t["success"]]
    missing = [t for t in example["tool_plan"] if t not in {x["tool"] for x in tools}]
    if len(succeeded) == len(tools) and not missing:
        passed.append({"check": "tools", "detail": f"{len(tools)} of {len(tools)} tools succeeded"})
    else:
        bad = [t["tool"] for t in tools if not t["success"]] + missing
        failed.append({"check": "tools", "detail": f"did not succeed: {', '.join(bad)}"})

    if example["briefing"]["truncated"]:
        failed.append({"check": "complete", "detail": "the briefing was truncated"})
    else:
        passed.append({"check": "complete", "detail": "the briefing is complete, not truncated"})

    absent = [title for title in SECTIONS if title not in seen]
    if absent:
        failed.append({"check": "sections", "detail": f"missing: {', '.join(absent)}"})
    else:
        passed.append({"check": "sections", "detail": "all six sections are present"})

    counts = {"points": 0, "season": 0, "positions": 0, "results": 0, "weather": 0, "length": 0}
    status = weather_status(example)
    sentences = [Sentence(unit, index) for index, unit in enumerate(units)]
    for s in sentences:
        pre_consume(ctx, s)
        found = mentions(ctx, s.norm)
        check_circuit_sentence(ctx, s)
        check_as_of_sentence(ctx, s)
        check_standings_sentence(ctx, s, found, counts)
        if s.section != "Predictions":
            check_standing_claims(ctx, s, found, counts)
            check_results_sentence(ctx, s, found, counts)
        if s.section == "Weather Watch":
            check_weather_sentence(ctx, s, status, counts)

    circuit = race["circuit_name"]
    if circuit and not any(term_pattern(circuit).search(s.norm) for s in sentences):
        failed.append({"check": "circuit", "detail": f"never names {circuit}"})

    flagged: list[tuple[int, int, dict[str, str]]] = []
    section_rank = {title: rank for rank, title in enumerate(("Preamble", *SECTIONS))}
    for s in sentences:
        if s.failures:
            for check, why in s.failures:
                failed.append({"check": check, "detail": f'"{s.text}" {why}'})
            continue
        reasons = sorted(s.unverified, key=lambda item: item[0])
        if s.section != "Predictions":
            figures = unchecked_figures(s)
            if figures:
                reasons.append(
                    (
                        PRIORITY_FIGURE,
                        "figures",
                        f"figure not checked against the data: {figures[0]}",
                    )
                )
            if s.section == "Track Profile" and not s.verified_numbers:
                reasons.append(
                    (PRIORITY_CIRCUIT, "circuit", "circuit knowledge, not in the gathered data")
                )
        elif reasons:
            reasons = [r for r in reasons if r[0] == PRIORITY_YEAR]
        if reasons:
            _, check, reason = sorted(reasons, key=lambda item: item[0])[0]
            flagged.append(
                (
                    section_rank[s.section],
                    s.index,
                    {"check": check, "section": s.section, "claim": s.text, "reason": reason},
                )
            )

    weather_units = [s for s in sentences if s.section == "Weather Watch"]
    weather_text = " ".join(s.text for s in weather_units)
    weather_failed = any(f["check"] == "weather" for f in failed)
    section_flag = None
    if "Weather Watch" not in seen:
        failed.append({"check": "weather", "detail": "there is no Weather Watch section"})
        weather_failed = True
    elif not weather_failed:
        if status == "outside":
            available = (evidence.get("weather") or {}).get("available_from")
            if available and not any(date_pattern(available).search(s.norm) for s in weather_units):
                section_flag = (
                    f"Weather Watch does not give the date the forecast opens ({available})"
                )
        elif (
            status != "forecast"
            and not NOT_GATHERED.search(norm(weather_text))
            and not NOT_IN_FORECAST.search(norm(weather_text))
        ):
            section_flag = "Weather Watch does not say why there is no forecast"
    if section_flag and weather_units:
        claims = {entry["claim"] for _, _, entry in flagged}
        if weather_text not in claims:
            flagged.append(
                (
                    section_rank["Weather Watch"],
                    weather_units[0].index,
                    {
                        "check": "weather",
                        "section": "Weather Watch",
                        "claim": weather_text,
                        "reason": section_flag,
                    },
                )
            )

    if not any(f["check"] == "circuit" for f in failed):
        others = evidence.get("other_venues") or []
        venues = (
            f"none of the other venues that have hosted the {race['name']} ({', '.join(others)})"
            if others
            else f"no other venue has hosted the {race['name']}"
        )
        passed.append({"check": "circuit", "detail": f"names {circuit}; {venues}"})
    standings = evidence.get("standings")
    if not any(f["check"] == "standings" for f in failed):
        table = f"the {standings['year']} table as of the cutoff" if standings else "the season"
        passed.append(
            {
                "check": "standings",
                "detail": f"{counts['points']} points figures, {counts['season']} season counts and "
                f"{counts['positions']} table positions match {table}",
            }
        )
    if not any(f["check"] == "results" for f in failed):
        passed.append(
            {
                "check": "results",
                "detail": f"{counts['results']} quoted results match the gathered data",
            }
        )
    if not any(f["check"] == "as_of" for f in failed):
        passed.append(
            {
                "check": "as_of",
                "detail": f"nothing after the cutoff ({minute(race['as_of'])}) is mentioned",
            }
        )
    if not weather_failed:
        if status == "forecast":
            detail = f"{counts['weather']} conditions figures match the forecast"
        elif status == "outside":
            available = (evidence.get("weather") or {}).get("available_from")
            detail = (
                f"quotes no conditions for a weekend outside the forecast, which opens {available}"
            )
        else:
            detail = f"quotes no conditions; {WEATHER_WHY.get(status, WEATHER_WHY['not_gathered'])}"
        passed.append({"check": "weather", "detail": detail})

    order = {check: rank for rank, check in enumerate(CHECK_ORDER)}
    passed.sort(key=lambda entry: order[entry["check"]])
    failed.sort(key=lambda entry: order[entry["check"]])
    flagged.sort(key=lambda item: (item[0], item[1]))
    return {"passed": passed, "flagged": [entry for _, _, entry in flagged], "failed": failed}
