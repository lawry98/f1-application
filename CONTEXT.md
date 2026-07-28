# Domain glossary

The ubiquitous language for this project. Terms here mean exactly what this file says
they mean — in code, in tests, in commit messages, and in conversation.

This is a glossary and nothing else. No implementation detail, no architecture, no
decisions. Those live in [CLAUDE.md](CLAUDE.md) and [README.md](README.md).

## Calendar and racing

**Season** — one championship year, identified by that year. Races belong to exactly one
season.

**Event** — one Grand Prix weekend in one season: "the 2025 Monaco Grand Prix". This is
the unit the calendar is made of and the unit a Briefing is about. FastF1's term, and the
one to prefer.

**Race** — strictly, the Sunday race session within an Event. In practice this codebase
uses "race" and "Event" interchangeably at its boundaries (`race_query`, `RaceInfo`,
`/api/races`). Treat them as synonymous unless a distinction is being drawn on purpose.

**Circuit** — the physical track. Distinct from the Event held on it: Monaco the circuit
hosts the Monaco Grand Prix, but Imola hosts the *Emilia Romagna* Grand Prix, and a
circuit can host differently-named Events in different Seasons.

> ⚠️ `RaceInfo.circuit_id` does not identify a Circuit. It is a slug of the *Event* name,
> so the same physical Circuit produces different values as the Event is renamed. It is
> also unread by any consumer. Read it as an **event slug**, and prefer that name.

**Round** — an Event's ordinal position within its Season.

## Resolution

**Query** — the raw text a user submits: "monaco", "silverstone 2026", "Vegas". Free-form
and unvalidated.

**Alias** — a colloquial name mapped to the substring that matches an Event: "spa" →
"Belgian", "cota" → "United States". Aliases exist because users name Circuits and cities
while the calendar names Events and countries.

**Resolution** — turning a Query into exactly one Event. Deterministic: no LLM is
involved. Resolution either yields one Event or fails.

**Upcoming** — an Event whose date is today or later. An Event happening *today* is
Upcoming. The property is relative to the moment of asking, so the same Query resolves to
different Events on different days.

**Historical Year** — the Season a Briefing draws its past-performance data from. For an
Upcoming Event that is the previous Season, because the Event itself has not happened yet;
for a completed Event it is the Event's own Season. Distinct from the Event's Season, and
the two are equal only for completed Events.

## Briefing generation

**Briefing** — the synthesised prose about one Event that is the product of this system.
The deliverable a user reads.

> ⚠️ The `briefing` field is also used as an error channel when Resolution fails. That is
> a conflation, not part of the definition. A Briefing is the deliverable; an error is
> not a Briefing.

**Tool** — a capability the agent can call to gather data about an Event. There are seven.
Modules that support the pipeline without being callable by the agent — the resolver and
the schedule cache — are **helpers**, not Tools. Adding a file does not create a Tool.

**Task** — a Tool selected for execution on this request, named. A Task is a chosen Tool
name, not a unit of work with its own parameters.

**Plan** — the set of Tasks chosen for one request.

**Tool Trace** — the record of which Tools ran and whether each succeeded, surfaced to the
user. Deliberately excludes the data the Tools returned.

**Degradation** — the system's response to partial failure: a Tool that cannot get its
data reports that and the Briefing is produced from whatever else succeeded. Failing Tools
are normal operation, not an error state.

**Step** — a phase of processing one request, reported to the user as it progresses:
*resolving*, *planning*, *gathering*, *synthesizing*, then *complete* or *error*.

> ⚠️ Two vocabularies exist for the same phases — Step names as above, and the pipeline's
> internal stage names (*resolver*, *planner*, *tool_executor*, *synthesizer*). Steps are
> the user-facing language; prefer them when talking about what the system is doing.
