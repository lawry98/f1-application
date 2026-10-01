---
status: accepted
---

# A past race gets a pre-race briefing as of the start of its weekend

A query can resolve to a race that has already been run, and on the default path it often does.
With no year, "Monaco", "Silverstone" and "Japanese GP" — the input box's own examples — resolve
to their 2026 editions once those have run. Before this, every source answered as of *today*. So
"Silverstone 2023" opened "as the paddock arrives" but quoted Verstappen's end-of-season 556
points, the Abu Dhabi 2023 result, and 2024–25 winners at a circuit whose 2023 race had not
happened yet.

A past race now gets the briefing a reader would have seen on the Thursday of its weekend. It
is not a race review, and the query is not refused.

## The cutoff

Every briefing carries one instant, `as_of`, set by the resolver:

- **Upcoming race** (race day today or later, mid-weekend included): the start of today.
- **Past race**: the first session's start, FastF1's `Session1DateUtc`. FastF1 has no session
  times for older seasons, so EventDate − 2 days stands in there.

Every data tool answers as of that instant and never after it. The latest race (here, and
anywhere), the last N races, the standings, and the winners window all count only what started
before `as_of`. Weather and news cannot be cut off, so a past race's plan drops them right after
the planner, before the plan is announced. The synthesizer is told it is writing as of `as_of`,
must mention nothing after it, and must not reveal or hint at the result even if it knows it.
The circuit band says "Pre-race briefing as of 5 Jun 2026 · this race has been run".

## Why not the alternatives

- **A race review** needs sources a review is built from — the race's own classification, lap
  data, the stewards' decisions — and a different six sections. That is a different product.
- **Refusing a past race** fails the default query for most of the season, since the box's own
  examples resolve to editions already run.
- **Briefing a past race as of today** is what shipped. It is a pre-race frame filled with
  post-race facts, and it reads as confidently wrong.

## What we accepted

- **The cutoff is coarse for an upcoming race.** It is the start of today, not now. A sprint or a
  race held earlier today is counted from tomorrow, which is the freshness the date-keyed cache
  gave before.
- **A past cutoff makes answers immutable,** so the result cache keeps them for the life of the
  process (ADR-0003 is amended to match), and the standings cache keeps a cutoff before today
  with no TTL.
- **The model may know the result anyway.** The prompt forbids revealing or hinting at it, but a
  model's own knowledge cannot be cut off. The live checks grep each past-race briefing for the
  result.
