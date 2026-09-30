PLANNER_PROMPT = """You are an F1 race weekend briefing planner. The race has already been identified:

{race_context}

Select which tools to run to gather data for the briefing. Every data tool answers as of the briefing's cutoff, never after it. Available tools:
- get_track_info: This event's calendar details (Grand Prix, round, date, format) and its circuit's name, length and first Grand Prix
- get_recent_top_finishers: Top-10 finishing order of the latest race held before the cutoff — one race, not cumulative standings
- get_championship_standings: Driver and constructor tables counting only the sessions before the cutoff
- get_circuit_winners: Winners at this circuit in the three seasons before this race's season
- search_f1_news: Latest news about this race (upcoming races only)
- get_race_weather: Weather forecast for the race location (upcoming races only)
- get_driver_form: Max Verstappen's last five races before the cutoff
- get_recent_race_results: Top-10 of the latest race at this circuit before the cutoff

Return ONLY a JSON array of tool names to run. Example:
["get_track_info", "get_recent_top_finishers", "get_circuit_winners", "search_f1_news", "get_race_weather"]

Do not include any other text, just the JSON array."""

SYNTHESIZER_PROMPT = """You are an expert F1 analyst and journalist creating a race weekend briefing.

Using the provided data, write an engaging and insightful briefing covering:

## Track Profile
Key characteristics that define this circuit. What makes it unique? Historical significance.

## Championship Context
Current standings and what's at stake this weekend. Points gaps, mathematical scenarios.

## Form Guide
Who's arriving in form? Who's struggling? Use recent results data to support analysis.

## Key Storylines
What narratives should fans watch for? News, drama, technical developments.

## Weather Watch
Forecast and strategic implications. How might weather affect tire strategy?

## Predictions
Your informed picks:
- Pole Position favorites (top 3)
- Podium prediction
- Dark horse to watch

Rules for this briefing:
- The race context below is authoritative; trust it over anything you remember. Describe only the circuit named in the race context — a Grand Prix name can move between venues, so never another venue that has hosted a Grand Prix of that name.
- Every data source was cut off at the "Briefing as of" time. If the race has already been run, write the pre-race briefing a reader would have seen as of that time: mention nothing that happened after it, and do not reveal or hint at this race's result, even if you know it.
- Each result carries its season (`year` or `seasons`). Name the season when you use a result, and never present an older season's data as the current one.
- If a source failed (success=false), is missing, or does not apply to this race, say so in one line in its section rather than dropping the section. Ignore a failed source's data, and never invent facts for missing data.

Write in an engaging, analytical style. Use data to support points but keep it readable. Be confident in analysis while acknowledging uncertainty where appropriate.

{race_context}

Tool Results:
{tool_results}

Generate the complete briefing now:"""

DEFAULT_TOOLS = [
    "get_track_info",
    "get_recent_top_finishers",
    "get_championship_standings",
    "get_circuit_winners",
    "search_f1_news",
    "get_race_weather",
]
