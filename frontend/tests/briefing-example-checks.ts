/**
 * The fact checks a saved example briefing must pass, ported line for line from
 * `backend/scripts/briefing_checks.py`.
 *
 * The capture script runs the Python checks before it writes an example; this port is what lets
 * the frontend suite run them again over every committed example, so a hand edit to the prose or
 * the evidence fails CI rather than shipping. Both run the cases in
 * `fixtures/briefing-check-cases.json`, and `briefing-example-checks.test.ts` also holds every
 * committed example's stored verdict to what this recomputes — so the two implementations are
 * pinned to each other on real briefings, not only on the cases.
 *
 * Read the Python module's docstring for what each pile means. Change one, change the other.
 * Every pattern carries the `d` flag for match indices, which is what Python's `match.start(n)`
 * reads; none carries `g`, because a global regex keeps state between calls — `all()` derives
 * one per use instead.
 */

import type {
  BriefingCheckFailure,
  BriefingCheckFlag,
  BriefingCheckPass,
  BriefingEvidence,
  BriefingExample,
  ResultEntry,
} from '@/data/briefing-examples';

export interface BriefingCheckResult {
  passed: BriefingCheckPass[];
  flagged: BriefingCheckFlag[];
  failed: BriefingCheckFailure[];
}

/** What the checks read: an example before its verdict is attached. */
export type CheckableExample = Omit<BriefingExample, 'checks'>;

const SECTIONS = [
  'Track Profile',
  'Championship Context',
  'Form Guide',
  'Key Storylines',
  'Weather Watch',
  'Predictions',
] as const;
const CHECK_ORDER = [
  'tools',
  'complete',
  'sections',
  'circuit',
  'standings',
  'results',
  'as_of',
  'weather',
];

const NUM =
  '(?:\\d+(?:\\.\\d+)?' +
  '|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)' +
  '(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?' +
  '|nineteen|eighteen|seventeen|sixteen|fifteen|fourteen|thirteen|twelve|eleven|ten' +
  '|nine|eight|seven|six|five|four|three|two|one|zero)';
const UNIT_WORDS = (
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen ' +
  'fifteen sixteen seventeen eighteen nineteen'
).split(' ');
const TENS_WORDS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const ORDINALS = 'first second third fourth fifth sixth seventh eighth ninth tenth'.split(' ');
const ORDINAL = `(?:${ORDINALS.join('|')})`;
const MONTHS =
  'january february march april may june july august september october november december'.split(
    ' ',
  );

const SCORING = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 7, 5, 3];
const TEAM_GP_MAX = 25 + 18;
const TEAM_SPRINT_MAX = 8 + 7;

const ci = (source: string): RegExp => new RegExp(source, 'di');
const cased = (source: string): RegExp => new RegExp(source, 'd');

const HEADING = cased('^\\s{0,3}(#{1,6})\\s+(.*?)\\s*#*\\s*$');
const RULE = cased('^\\s*(?:-{3,}|\\*{3,}|_{3,})\\s*$');
const LIST_MARKER = cased('^\\s*(?:[-*+]|\\d+[.)])\\s+');
const LINK = cased('\\[([^\\]]*)\\]\\([^)]*\\)');
const EMPHASIS = cased('(?<![A-Za-z0-9])[*_]+(?=\\S)|(?<=\\S)[*_]+(?![A-Za-z0-9])');
const SENTENCE_BREAK = /(?<=[.!?])\s+(?=[A-Z0-9"'(\[])/;
const LABEL_LINE = cased("^[A-Za-z][A-Za-z '/&-]{0,30}:\\s+(.+)$");
const DIGITS = cased('\\d+(?:[.,:]\\d+)*');
const YEAR = cased('(?<![A-Za-z0-9])(19\\d\\d|20\\d\\d)(?![A-Za-z0-9])');
const RELATIVE_YEAR = ci('\\b(last|this)\\s+(year|season)\\b');

const IGNORED = [
  ci('\\b(?:Practice|FP|Q|SQ)\\s?\\d\\b'),
  ci('\\bSprint Qualifying\\s?\\d\\b'),
  ci('\\bTurns?\\s+\\d+(?:\\s*(?:-|and|to)\\s*\\d+)?\\b'),
  cased('\\bT\\d{1,2}\\b'),
  cased('\\bF[12]\\b'),
  ci('\\bFormula\\s+[12]\\b'),
];

const HERE = ci('\\b(?:here|this circuit|this track|this venue|this race|this event)\\b');
const LAST_TIME = ci(
  '\\b(?:last time out|last race|latest race|most recent race|last round|last weekend' +
    '|previous race|last outing|last start)\\b',
);

const WIN = ci('\\b(?:won|wins|win|winning|winner|winners|victory|victories|triumphed)\\b');
const MODAL_BEFORE = ci(
  '\\b(?:to|will|could|can|would|might|may|should|must|bid|chance|chasing|chase|hunt' +
    "|seeking|eyeing)\\s+(?:[A-Za-z']+\\s+)?$",
);
const TITLE_AFTER = ci('^\\s+(?:\\S+\\s+){0,3}?(?:titles?|championships?|crowns?)\\b');
const POSITION = cased('(?<![A-Za-z0-9])P([1-9]|1\\d|2[0-2])(?![A-Za-z0-9]|\\.\\d)');
const AVERAGE = cased('(?<![A-Za-z0-9])P(\\d{1,2}\\.\\d)(?![0-9])');
const AVERAGE_CONTEXT = ci('\\b(?:avg|average|averages|averaging|averaged)\\b');
const SEQUENCE = cased(
  '(?:P\\d{1,2}|DNF|DNS|DSQ)(?:\\s*,\\s*(?:P\\d{1,2}|DNF|DNS|DSQ)){2,}(?![A-Za-z0-9])',
);
const PLACE = ci(`\\b(${ORDINAL})[- ]place\\b`);
const FINISHED = ci(
  `\\b(?:finished|came|took|placed|claimed)\\s+(${ORDINAL}|\\d{1,2}(?:st|nd|rd|th))\\b`,
);
const NUMBERED_PLACE = ci('\\b(\\d{1,2})(?:st|nd|rd|th)[- ]place\\b');
const RUNNER_UP = ci('\\brunner-up\\b');
const PODIUM = ci('\\bpodiums?\\b');
const DNF = ci('\\bDNF\\b|\\bdid not finish\\b|\\bretired\\b');

const FORM_NOUN = '(wins|victories|podiums|podium finishes)';
const STREAKS: [RegExp, 'streak' | 'count'][] = [
  [ci(`\\b(${NUM})\\s+(?:consecutive|straight|successive)\\s+(?:race\\s+)?${FORM_NOUN}`), 'streak'],
  [ci(`\\b(${NUM})\\s+${FORM_NOUN}\\s+in\\s+a\\s+row\\b`), 'streak'],
  [ci(`\\bwon\\s+(${NUM})\\s+(?:races\\s+|grands prix\\s+)?(in\\s+a\\s+row)\\b`), 'streak'],
  [
    ci(`\\bwon\\s+(${NUM})\\s+(of)\\s+(?:the|his|her|their)\\s+(?:last|past)\\s+(${NUM})\\b`),
    'count',
  ],
  [
    ci(
      `\\b(${NUM})\\s+${FORM_NOUN}\\s+(?:from|in)\\s+(?:the|his|her|their)` +
        `\\s+(?:last|past)\\s+(${NUM})\\b`,
    ),
    'count',
  ],
];

const STANDINGS_CONTEXT = ci('\\b(?:championship|standings|title|table|points|leader)\\b');
const LEADS = ci('\\b(?:leads|leading|leader|lead the|tops|top of the|heads the)\\b');
const STANDING_PLACE = ci(
  `\\b(${ORDINAL}|P\\d{1,2})(?:\\s+(?:place|position))?` +
    '(?=\\s+(?:in|on|with)\\s+(?:\\S+\\s+){0,2}?(?:championship|standings|table|points)\\b)',
);

const POINTS = ci(`(?<![A-Za-z0-9.])(${NUM})(?:\\s*-\\s*|\\s+)(?:points?|pts)\\b`);
const BRACKETED_GAP = ci('\\(\\s*-\\s*(\\d+(?:\\.\\d+)?)\\s*(?:pts|points)?\\s*\\)');
const RACES_OF = ci(`\\b(${NUM})\\s+of\\s+(?:the\\s+)?(${NUM})\\s+(?:races|rounds|grands prix)\\b`);
const RACES_DONE = [
  ci(`\\b(?:after|through)\\s+(${NUM})\\s+(?:races|rounds|grands prix)\\b`),
  ci(
    `\\b(${NUM})\\s+(?:races|rounds|grands prix)\\s+(?:completed|into|so far|down|gone` +
      '|run|held|have been)\\b',
  ),
];
const REMAINING = ci(
  `\\b(${NUM})\\s+(?:races|rounds|grands prix)\\s+(?:remaining|left|to go|to run)\\b`,
);
const ROUND_OF = ci('\\bround\\s+(\\d{1,2})\\s+of\\s+(\\d{1,2})\\b');
const THIS_ROUND = ci('\\b(?:this|it)\\s+(?:is|marks)\\s+round\\s+(\\d{1,2})\\b');
const ANY_ROUND = ci('\\bround\\s+(\\d{1,2})\\b');
const CALENDAR = ci('\\b(\\d{1,2})-(?:race|round)\\s+(?:calendar|season|schedule)\\b');

const KM = ci('(\\d+(?:\\.\\d+)?)\\s*(?:km|kilometres|kilometers)\\b');
const METRES = ci('(\\d{1,2},?\\d{3})\\s*(?:m|metres|meters)\\b');
const MILES = ci('(\\d+(?:\\.\\d+)?)\\s*(?:miles|mi)\\b');

const TEMPERATURE = ci(
  '(-?\\d+(?:\\.\\d+)?)(?:\\s*°\\s*([CF])?|\\s*degrees(?:\\s+(Celsius|Fahrenheit))?' +
    '|([CF])(?![A-Za-z0-9]))',
);
const RAIN = ci('(\\d+(?:\\.\\d+)?)\\s*(?:%|percent|per cent)');
const WIND = ci('(\\d+(?:\\.\\d+)?)\\s*(m/s|km/h|kph|mph)');
const TRACK_TEMPERATURE = ci('\\btrack temp');
const NOT_IN_FORECAST = ci(
  '\\b(?:not (?:yet )?(?:in|within|covered by) the forecast|outside the forecast' +
    "|beyond the forecast|forecast (?:does not|doesn't|won't|will not) (?:yet )?(?:reach|cover))",
);
const NOT_GATHERED = ci(
  '\\b(?:not (?:been )?(?:gathered|collected|included|available|applicable|provided|retrieved' +
    "|part of)|no (?:weather|forecast)|(?:isn't|aren't|wasn't|weren't) (?:gathered|collected" +
    '|included|available|applicable|provided)|already (?:been )?run|does not apply' +
    "|doesn't apply|unavailable)",
);
const TIME_OF_DAY = cased('\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b');

const PRIORITY_YEAR = 0;
const PRIORITY_RESULT = 1;
const PRIORITY_STANDING = 2;
const PRIORITY_FORM = 3;
const PRIORITY_TRACK_TEMP = 4;
const PRIORITY_FIGURE = 5;
const PRIORITY_CIRCUIT = 6;

type WeatherStatus = 'forecast' | 'outside' | 'not_gathered' | 'weekend_over';
const WEATHER_WHY: Record<Exclude<WeatherStatus, 'forecast'>, string> = {
  not_gathered: 'no forecast was gathered for this race',
  outside: 'the weekend is outside the forecast',
  weekend_over: 'the weekend is over',
};

// --- regex plumbing, standing in for Python's `re` ---------------------------------------------

const GLOBALS = new WeakMap<RegExp, RegExp>();

function globalOf(re: RegExp): RegExp {
  let g = GLOBALS.get(re);
  if (!g) {
    g = new RegExp(re.source, `${re.flags}g`);
    GLOBALS.set(re, g);
  }
  return g;
}

function all(re: RegExp, text: string): RegExpExecArray[] {
  return [...text.matchAll(globalOf(re))];
}

function startOf(m: RegExpExecArray, group = 0): number {
  return m.indices![group]![0];
}

function endOf(m: RegExpExecArray, group = 0): number {
  return m.indices![group]![1];
}

function findAll(re: RegExp, text: string): [number, number][] {
  return all(re, text).map((m) => [startOf(m), endOf(m)]);
}

export function norm(text: string): string {
  let stripped = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [fancy, plain] of [
    ['\u2019', "'"],
    ['\u2018', "'"],
    ['\u201c', '"'],
    ['\u201d', '"'],
    ['\u2013', '-'],
    ['\u2014', '-'],
    ['\u2212', '-'],
  ] as const) {
    stripped = stripped.split(fancy).join(plain);
  }
  return stripped;
}

function numValue(token: string): number {
  const lower = token.toLowerCase();
  if (/^\d/.test(lower)) return Number(lower);
  if (UNIT_WORDS.includes(lower)) return UNIT_WORDS.indexOf(lower);
  const parts = lower.split(/[- ]/);
  const tens = (TENS_WORDS.indexOf(parts[0]!) + 2) * 10;
  return tens + (parts.length > 1 ? UNIT_WORDS.indexOf(parts[1]!) : 0);
}

function fmt(value: number): string {
  return String(value);
}

function escape(text: string): string {
  return text.replace(/([.*+?^${}()|[\]\\/-])/g, '\\$1');
}

function termPattern(term: string, caseSensitive = false): RegExp {
  const source = `(?<![A-Za-z0-9])${escape(norm(term))}(?![A-Za-z0-9])`;
  return caseSensitive ? cased(source) : ci(source);
}

function ordinalValue(word: string): number {
  const lower = word.toLowerCase();
  if (/^\d/.test(lower)) return Number(/^\d+/.exec(lower)![0]);
  return ORDINALS.indexOf(lower) + 1;
}

function minute(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function compareTuples(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

// --- the briefing as units ---------------------------------------------------------------------

interface Unit {
  section: string;
  text: string;
  norm: string;
}

function cleanInline(text: string): string {
  return text
    .replace(globalOf(LINK), '$1')
    .replace(globalOf(EMPHASIS), '')
    .split('`')
    .join('')
    .trim();
}

function parseUnits(markdown: string): [Unit[], string[]] {
  const units: Unit[] = [];
  const seen: string[] = [];
  let section = 'Preamble';
  for (const raw of markdown.split('\n')) {
    const heading = HEADING.exec(raw);
    if (heading) {
      const title = norm(cleanInline(heading[2]!)).toLowerCase();
      const canonical = SECTIONS.find((s) => title.includes(s.toLowerCase()));
      if (canonical) {
        section = canonical;
        if (!seen.includes(canonical)) seen.push(canonical);
      } else if (heading[1]!.length === 1) {
        section = 'Preamble';
      }
      continue;
    }
    if (RULE.test(raw)) continue;
    const text = cleanInline(raw.replace(LIST_MARKER, ''));
    if (!text) continue;
    for (const piece of text.split(SENTENCE_BREAK)) {
      const sentence = piece.trim();
      if (sentence) units.push({ section, text: sentence, norm: norm(sentence) });
    }
  }
  return [units, seen];
}

// --- who and what a sentence names -------------------------------------------------------------

interface Mention {
  kind: 'driver' | 'team';
  key: string;
  start: number;
  end: number;
}

interface Entry extends ResultEntry {
  index: number;
  patterns: RegExp[];
}

interface RaceMention {
  start: number;
  end: number;
  entries: Entry[];
}

interface Context {
  race: CheckableExample['race_info'];
  evidence: BriefingEvidence;
  drivers: { code: string; patterns: RegExp[] }[];
  teams: { team: string; patterns: RegExp[] }[];
  entries: Entry[];
  cutoffYear: number;
  searchedYears: Set<number>;
}

function teamAliases(team: string): string[] {
  const aliases = [team];
  for (const suffix of [' F1 Team', ' Racing', ' F1']) {
    if (team.endsWith(suffix) && team.length > suffix.length) {
      aliases.push(team.slice(0, -suffix.length));
    }
  }
  return aliases;
}

function entryAliases(entry: ResultEntry): string[] {
  const names = [entry.event, entry.event.replace('Grand Prix', 'GP')];
  const stem = entry.event.replace(' Grand Prix', '');
  if (stem !== entry.event) names.push(stem);
  for (const extra of [entry.location, entry.circuit]) {
    if (extra) names.push(extra);
  }
  const aliases: string[] = [];
  for (const name of names) {
    const key = norm(name).toLowerCase();
    if (!aliases.includes(key)) aliases.push(key);
  }
  return aliases;
}

function buildContext(example: CheckableExample): Context {
  const evidence = example.evidence;
  const race = example.race_info;
  const standings = evidence.standings;

  const drivers = (evidence.drivers ?? []).map((driver) => ({
    code: driver.code,
    patterns: [
      termPattern(driver.name),
      termPattern(driver.surname),
      termPattern(driver.code, true),
    ],
  }));

  const teams: string[] = [];
  if (standings) {
    for (const row of [...standings.constructors, ...standings.drivers]) {
      if (!teams.includes(row.team)) teams.push(row.team);
    }
  }

  const entries = (evidence.results ?? []).map((entry, index) => ({
    ...entry,
    index,
    patterns: entryAliases(entry).map((alias) => termPattern(alias)),
  }));

  const searched = new Set<number>((evidence.searched_years ?? []).map(Number));
  const window = evidence.circuit_seasons;
  if (window) {
    for (let year = window.from; year <= window.to; year += 1) searched.add(year);
  }
  for (const entry of entries) searched.add(entry.year);
  if (standings) searched.add(standings.year);

  return {
    race,
    evidence,
    drivers,
    teams: teams.map((team) => ({
      team,
      patterns: teamAliases(team).map((alias) => termPattern(alias)),
    })),
    entries,
    cutoffYear: Number(race.as_of.slice(0, 4)),
    searchedYears: searched,
  };
}

function longestFirst<T extends { start: number; end: number }>(found: T[]): T[] {
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: T[] = [];
  for (const mention of found) {
    if (kept.length && mention.start < kept[kept.length - 1]!.end) continue;
    kept.push(mention);
  }
  return kept;
}

function mentions(ctx: Context, text: string): Mention[] {
  const found: Mention[] = [];
  for (const driver of ctx.drivers) {
    for (const pattern of driver.patterns) {
      for (const [start, end] of findAll(pattern, text)) {
        found.push({ kind: 'driver', key: driver.code, start, end });
      }
    }
  }
  for (const team of ctx.teams) {
    for (const pattern of team.patterns) {
      for (const [start, end] of findAll(pattern, text)) {
        found.push({ kind: 'team', key: team.team, start, end });
      }
    }
  }
  return longestFirst(found);
}

function nearest<T extends { start: number; end: number }>(
  found: T[],
  start: number,
  end: number,
): T | null {
  let best: T | null = null;
  let bestKey: number[] | null = null;
  for (const mention of found) {
    let key: number[];
    if (mention.end <= start) key = [start - mention.end, 0, mention.start];
    else if (mention.start >= end) key = [mention.start - end, 1, mention.start];
    else key = [0, 0, mention.start];
    if (bestKey === null || compareTuples(key, bestKey) < 0) {
      best = mention;
      bestKey = key;
    }
  }
  return best;
}

function raceMentions(ctx: Context, s: Sentence): RaceMention[] {
  const found: RaceMention[] = [];
  for (const entry of ctx.entries) {
    for (const pattern of entry.patterns) {
      for (const [start, end] of findAll(pattern, s.norm)) {
        found.push({ start, end, entries: [entry] });
      }
    }
  }
  for (const m of all(HERE, s.norm)) {
    const here = ctx.entries.filter(
      (e) => e.source === 'get_recent_race_results' || e.source === 'get_circuit_winners',
    );
    found.push({ start: startOf(m), end: endOf(m), entries: here });
  }
  for (const m of all(LAST_TIME, s.norm)) {
    const last = ctx.entries.filter((e) => e.source === 'get_recent_top_finishers');
    found.push({ start: startOf(m), end: endOf(m), entries: last });
  }

  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const merged: RaceMention[] = [];
  for (const mention of found) {
    const last = merged[merged.length - 1];
    if (last && mention.start < last.end) {
      for (const entry of mention.entries) {
        if (!last.entries.includes(entry)) last.entries.push(entry);
      }
      continue;
    }
    merged.push({ ...mention, entries: [...mention.entries] });
  }
  return merged.filter((m) => m.entries.length > 0);
}

function namedYears(ctx: Context, s: Sentence): [Set<number>, [number, number][]] {
  const years = new Set<number>();
  const spans: [number, number][] = [];
  for (const m of all(YEAR, s.norm)) {
    const year = Number(m[1]);
    if (year <= ctx.cutoffYear) {
      years.add(year);
      spans.push([startOf(m, 1), endOf(m, 1)]);
    }
  }
  for (const m of all(RELATIVE_YEAR, s.norm)) {
    const offset = m[1]!.toLowerCase() === 'last' ? 1 : 0;
    years.add(ctx.race.year - offset);
  }
  return [years, spans];
}

// --- per-sentence analysis ---------------------------------------------------------------------

class Sentence {
  readonly section: string;
  readonly text: string;
  readonly norm: string;
  readonly index: number;
  readonly consumed: [number, number][] = [];
  readonly failures: [string, string][] = [];
  readonly unverified: [number, string, string][] = [];
  verified = 0;

  constructor(unit: Unit, index: number) {
    this.section = unit.section;
    this.text = unit.text;
    this.norm = unit.norm;
    this.index = index;
  }

  consume(start: number, end: number): void {
    this.consumed.push([start, end]);
  }

  overlaps(start: number, end: number): boolean {
    return this.consumed.some(([s, e]) => s < end && start < e);
  }

  fail(check: string, why: string): void {
    this.failures.push([check, why]);
  }

  flag(priority: number, check: string, reason: string): void {
    this.unverified.push([priority, check, reason]);
  }
}

function datePattern(isoDate: string): RegExp {
  const [year, month, day] = isoDate.split('-') as [string, string, string];
  const name = MONTHS[Number(month) - 1]!;
  const monthAlt = `(?:${name}|${name.slice(0, 3)}\\.?)`;
  const dayAlt = `0?${Number(day)}(?:st|nd|rd|th)?`;
  return ci(
    `\\b(?:${dayAlt}\\s+(?:of\\s+)?${monthAlt}|${monthAlt}\\s+${dayAlt})\\b(?:,?\\s+${year})?` +
      `|\\b${year}-${month}-${day}\\b`,
  );
}

function preConsume(ctx: Context, s: Sentence): void {
  for (const pattern of IGNORED) {
    for (const [start, end] of findAll(pattern, s.norm)) s.consume(start, end);
  }
  for (const m of all(YEAR, s.norm)) {
    const year = Number(m[1]);
    if (year === ctx.race.year || ctx.searchedYears.has(year))
      s.consume(startOf(m, 1), endOf(m, 1));
  }
  for (const m of all(TIME_OF_DAY, s.norm)) {
    const hhmm = `${m[1]!.padStart(2, '0')}:${m[2]}`;
    if (ctx.race.sessions.some((session) => session.start.slice(11, 16) === hhmm)) {
      s.consume(startOf(m), endOf(m));
    }
  }
  const known = new Set([ctx.race.date.slice(0, 10), ctx.race.as_of.slice(0, 10)]);
  for (const session of ctx.race.sessions) known.add(session.start.slice(0, 10));
  const availableFrom = ctx.evidence.weather?.available_from;
  if (availableFrom) known.add(availableFrom);
  for (const day of [...known].sort()) {
    for (const [start, end] of findAll(datePattern(day), s.norm)) s.consume(start, end);
  }
  for (const m of all(ANY_ROUND, s.norm)) {
    if (Number(m[1]) === ctx.race.round) {
      s.consume(startOf(m, 1), endOf(m, 1));
      s.verified += 1;
    }
  }
}

function checkCircuitSentence(ctx: Context, s: Sentence): void {
  const race = ctx.race;
  for (const term of ctx.evidence.other_venues ?? []) {
    if (termPattern(term).test(s.norm)) {
      s.fail('circuit', `names ${term}, which hosted an earlier ${race.name}, not this circuit`);
    }
  }
  const track = ctx.evidence.track;
  const length = track?.length_km;
  if (track && length) {
    for (const [pattern, scale] of [
      [KM, 1.0],
      [MILES, 0.621371],
      [METRES, 1000.0],
    ] as const) {
      for (const m of all(pattern, s.norm)) {
        const raw = m[1]!.split(',').join('');
        const value = Number(raw);
        const decimals = raw.includes('.') ? raw.split('.')[1]!.length : 0;
        const expected = length * scale;
        let tolerance = 0.5 * 10 ** -decimals + 0.001;
        if (scale === 1000.0) tolerance = raw.endsWith('0') ? 5.0 : 0.5;
        if (Math.abs(value - expected) <= tolerance) {
          s.consume(startOf(m, 1), endOf(m, 1));
          s.verified += 1;
        } else if (0.7 * expected <= value && value <= 1.3 * expected) {
          s.consume(startOf(m, 1), endOf(m, 1));
          s.fail('circuit', `quotes ${m[0].trim()}, but ${track.circuit} is ${fmt(length)} km`);
        }
      }
    }
  }
  const first = track?.first_grand_prix;
  if (first && s.section === 'Track Profile') {
    for (const m of all(YEAR, s.norm)) {
      if (Number(m[1]) === first) {
        s.consume(startOf(m, 1), endOf(m, 1));
        s.verified += 1;
      }
    }
  }
  if (s.section === 'Track Profile') {
    const label = LABEL_LINE.exec(s.norm);
    if (label) {
      const value = label[1]!.toLowerCase();
      const names = [race.circuit_name, race.location, race.name];
      if (names.some((name) => name && value.startsWith(norm(name).toLowerCase()))) {
        s.verified += 1;
      }
    }
  }
}

function standingsValues(ctx: Context, found: Mention[]): number[] {
  const evidence = ctx.evidence;
  const standings = evidence.standings!;
  const season = evidence.season ?? null;
  const drivers = new Map(standings.drivers.map((row) => [row.driver_code, row.points]));
  const teams = new Map(standings.constructors.map((row) => [row.team, row.points]));
  const form = evidence.form?.drivers ?? {};

  const allowed = [...SCORING];
  const remaining = season?.remaining_grands_prix;
  if (season && remaining !== undefined && remaining !== null) {
    const sprints = season.remaining_sprints ?? 0;
    const thisSprint = season.this_weekend_sprint ? 1 : 0;
    allowed.push(
      remaining * 25 + sprints * 8,
      (remaining - 1) * 25 + (sprints - thisSprint) * 8,
      remaining * TEAM_GP_MAX + sprints * TEAM_SPRINT_MAX,
      (remaining - 1) * TEAM_GP_MAX + (sprints - thisSprint) * TEAM_SPRINT_MAX,
      25 + 8 * thisSprint,
      TEAM_GP_MAX + TEAM_SPRINT_MAX * thisSprint,
    );
  }

  const named = found.filter((m) => m.kind === 'driver' && drivers.has(m.key));
  const namedTeams = found.filter((m) => m.kind === 'team' && teams.has(m.key));
  if (named.length || namedTeams.length) {
    for (const mention of named) {
      const own = drivers.get(mention.key)!;
      allowed.push(own, ...[...drivers.values()].map((other) => Math.abs(own - other)));
      const line = form[mention.key];
      if (line) allowed.push(line.points);
    }
    for (const mention of namedTeams) {
      const own = teams.get(mention.key)!;
      allowed.push(own, ...[...teams.values()].map((other) => Math.abs(own - other)));
    }
    return allowed;
  }

  for (const table of [standings.drivers, standings.constructors]) {
    const points = table.map((row) => row.points);
    allowed.push(...points);
    for (let i = 1; i < points.length; i += 1) allowed.push(Math.abs(points[i - 1]! - points[i]!));
    for (const p of points.slice(1)) allowed.push(points[0]! - p);
  }
  allowed.push(...Object.values(form).map((line) => line.points));
  return allowed;
}

function checkSeasonCounts(ctx: Context, s: Sentence, counts: Counts): void {
  const standings = ctx.evidence.standings;
  const season = ctx.evidence.season ?? null;
  const race = ctx.race;
  const rounds = season?.rounds;

  const wrongRound = (value: string): void =>
    s.fail('standings', `calls this round ${value}, but it is round ${race.round}`);
  const wrongRounds = (value: string): void =>
    s.fail('standings', `gives ${value} rounds, but the season has ${rounds}`);

  for (const m of all(ROUND_OF, s.norm)) {
    s.consume(startOf(m, 1), endOf(m, 1));
    s.consume(startOf(m, 2), endOf(m, 2));
    if (Number(m[1]) !== race.round) wrongRound(m[1]!);
    else if (rounds && Number(m[2]) !== rounds) wrongRounds(m[2]!);
    else counts.season += 1;
  }
  for (const m of all(THIS_ROUND, s.norm)) {
    if (s.overlaps(startOf(m, 1), endOf(m, 1))) continue;
    if (Number(m[1]) !== race.round) {
      s.consume(startOf(m, 1), endOf(m, 1));
      wrongRound(m[1]!);
    }
  }
  for (const m of all(CALENDAR, s.norm)) {
    s.consume(startOf(m, 1), endOf(m, 1));
    if (rounds && Number(m[1]) !== rounds) wrongRounds(m[1]!);
    else counts.season += 1;
  }
  for (const m of all(RACES_OF, s.norm)) {
    if (s.overlaps(startOf(m, 1), endOf(m, 1))) continue;
    s.consume(startOf(m, 1), endOf(m, 1));
    s.consume(startOf(m, 2), endOf(m, 2));
    const done = numValue(m[1]!);
    const total = numValue(m[2]!);
    if (standings && done !== standings.races_completed) {
      s.fail(
        'standings',
        `counts ${fmt(done)} races, but ${standings.races_completed} had been run`,
      );
    } else if (rounds && total !== rounds) {
      wrongRounds(fmt(total));
    } else {
      counts.season += 1;
    }
  }
  const remaining = season?.remaining_grands_prix;
  for (const m of all(REMAINING, s.norm)) {
    if (s.overlaps(startOf(m, 1), endOf(m, 1))) continue;
    s.consume(startOf(m, 1), endOf(m, 1));
    const value = numValue(m[1]!);
    if (
      remaining !== undefined &&
      remaining !== null &&
      value !== remaining &&
      value !== remaining - 1
    ) {
      s.fail('standings', `leaves ${fmt(value)} races, but ${remaining} remain including this one`);
    } else {
      counts.season += 1;
    }
  }
  if (!standings) return;
  for (const pattern of RACES_DONE) {
    for (const m of all(pattern, s.norm)) {
      if (s.overlaps(startOf(m, 1), endOf(m, 1))) continue;
      s.consume(startOf(m, 1), endOf(m, 1));
      const value = numValue(m[1]!);
      if (value !== standings.races_completed) {
        s.fail(
          'standings',
          `counts ${fmt(value)} races, but ${standings.races_completed} had been run`,
        );
      } else {
        counts.season += 1;
      }
    }
  }
}

function checkPoints(ctx: Context, s: Sentence, found: Mention[], counts: Counts): void {
  const standings = ctx.evidence.standings;
  const figures: [number, number, string][] = [
    ...all(POINTS, s.norm).map((m): [number, number, string] => [
      startOf(m, 1),
      endOf(m, 1),
      m[1]!,
    ]),
    ...all(BRACKETED_GAP, s.norm).map((m): [number, number, string] => [
      startOf(m, 1),
      endOf(m, 1),
      m[1]!,
    ]),
  ];
  if (!standings) {
    for (const [start, end, token] of figures) {
      s.consume(start, end);
      s.fail('standings', `quotes ${token} points with no standings gathered`);
    }
    return;
  }
  const allowed = standingsValues(ctx, found);
  figures.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
  for (const [start, end, token] of figures) {
    if (s.overlaps(start, end)) continue;
    s.consume(start, end);
    const value = numValue(token);
    if (allowed.some((candidate) => Math.abs(value - candidate) < 0.01)) {
      counts.points += 1;
    } else {
      s.fail(
        'standings',
        `quotes ${fmt(value)} points, which no ${standings.year} table value or gap ` +
          'involving who it names gives',
      );
    }
  }
}

function standingsPosition(ctx: Context, mention: Mention): number | null {
  const standings = ctx.evidence.standings;
  if (!standings) return null;
  const row =
    mention.kind === 'driver'
      ? standings.drivers.find((r) => r.driver_code === mention.key)
      : standings.constructors.find((r) => r.team === mention.key);
  return row ? row.position : null;
}

function checkStandingClaims(ctx: Context, s: Sentence, found: Mention[], counts: Counts): void {
  if (!STANDINGS_CONTEXT.test(s.norm) || found.length === 0) return;
  const claims: [number, number, number][] = all(LEADS, s.norm).map((m) => [
    1,
    startOf(m),
    endOf(m),
  ]);
  for (const m of all(STANDING_PLACE, s.norm)) {
    const token = m[1]!;
    const isP = /^[Pp]\d+$/.test(token);
    const value = isP ? Number(token.slice(1)) : ordinalValue(token);
    s.consume(startOf(m, 1), endOf(m, 1));
    claims.push([value, startOf(m, 1), endOf(m, 1)]);
  }
  for (const [value, start, end] of claims) {
    const paired = nearest(found, start, end)!;
    const position = standingsPosition(ctx, paired);
    if (
      position === value ||
      found.some((m) => m.kind === paired.kind && standingsPosition(ctx, m) === value)
    ) {
      counts.positions += 1;
    } else if (position === null) {
      s.flag(PRIORITY_STANDING, 'standings', 'standings claim the table does not settle');
    } else {
      s.fail(
        'standings',
        `puts ${paired.key} ${fmt(value)} in the table, but they are ${position}`,
      );
    }
  }
}

type ClaimKind = 'win' | 'pos' | 'podium' | 'dnf';

function holds(entry: ResultEntry, code: string, kind: ClaimKind, value: number): boolean | null {
  const position = entry.positions[code];
  if (position === undefined || position === null) {
    const depth = entry.depth;
    if (depth === null || depth === undefined || kind === 'dnf') return null;
    const need = ({ win: 1, pos: value, podium: 3 } as Record<string, number>)[kind]!;
    return need <= depth ? false : null;
  }
  if (kind === 'dnf') return position === 'DNF';
  if (typeof position !== 'number') return false;
  if (kind === 'win') return position === 1;
  if (kind === 'pos') return position === value;
  return position <= 3;
}

function formLine(ctx: Context, code: string) {
  return ctx.evidence.form?.drivers?.[code] ?? null;
}

function formPositions(results: string[]): (number | null)[] {
  return results.map((r) => (/^P\d+$/.test(r) ? Number(r.slice(1)) : null));
}

function checkForm(
  ctx: Context,
  s: Sentence,
  drivers: Mention[],
  counts: Counts,
): [number, number][] {
  const spans: [number, number][] = [];

  const judge = (paired: Mention | null, ok: boolean | null, why: string): void => {
    if (paired === null) return;
    if (ok === null) s.flag(PRIORITY_FORM, 'results', 'form claim outside the gathered window');
    else if (ok) counts.results += 1;
    else s.fail('results', why);
  };

  for (const [pattern, kind] of STREAKS) {
    for (const m of all(pattern, s.norm)) {
      spans.push([startOf(m), endOf(m)]);
      s.consume(startOf(m, 1), endOf(m, 1));
      if (kind === 'count') s.consume(startOf(m, 3), endOf(m, 3));
      const paired = nearest(drivers, startOf(m), endOf(m));
      if (paired === null) continue;
      const line = formLine(ctx, paired.key);
      if (line === null) {
        judge(paired, null, '');
        continue;
      }
      const podium = m[2]!.toLowerCase().startsWith('podium');
      const hits = formPositions(line.results).map(
        (p) => p !== null && (podium ? p <= 3 : p === 1),
      );
      const n = numValue(m[1]!);
      let verdict: boolean | null;
      if (kind === 'streak') {
        let trailing = 0;
        for (let i = hits.length - 1; i >= 0 && hits[i]; i -= 1) trailing += 1;
        let longest = 0;
        let run = 0;
        for (const hit of hits) {
          run = hit ? run + 1 : 0;
          longest = Math.max(longest, run);
        }
        const ok = n === trailing || n === longest;
        verdict = !ok && n > hits.length ? null : ok;
      } else {
        const window = Math.trunc(numValue(m[3]!));
        verdict = window > hits.length ? null : n === hits.slice(-window).filter(Boolean).length;
      }
      judge(
        paired,
        verdict,
        `gives ${paired.key} a run their last ${hits.length} Grands Prix ` +
          `(${line.results.join(', ')}) do not show`,
      );
    }
  }

  for (const m of all(SEQUENCE, s.norm)) {
    spans.push([startOf(m), endOf(m)]);
    s.consume(startOf(m), endOf(m));
    const paired = nearest(drivers, startOf(m), endOf(m));
    const line = paired ? formLine(ctx, paired.key) : null;
    if (paired === null || line === null) {
      judge(paired, null, '');
      continue;
    }
    const quoted = m[0].split(',').map((token) => token.trim());
    const results = line.results;
    let ok = false;
    for (let i = 0; i + quoted.length <= results.length; i += 1) {
      if (quoted.every((token, j) => results[i + j] === token)) ok = true;
    }
    judge(
      paired,
      ok,
      `gives ${paired.key} the finishes ${quoted.join(', ')}, but their last ` +
        `${results.length} Grands Prix were ${results.join(', ')}`,
    );
  }

  for (const m of all(AVERAGE, s.norm)) {
    const before = s.norm.slice(Math.max(0, startOf(m) - 40), startOf(m));
    if (!AVERAGE_CONTEXT.test(before)) continue;
    spans.push([startOf(m), endOf(m)]);
    s.consume(startOf(m), endOf(m));
    const paired = nearest(drivers, startOf(m), endOf(m));
    const line = paired ? formLine(ctx, paired.key) : null;
    if (paired === null || line === null || line.avg === null || line.avg === undefined) {
      judge(paired, null, '');
      continue;
    }
    const value = Number(m[1]);
    judge(
      paired,
      Math.abs(value - line.avg) < 0.05,
      `gives ${paired.key} an average of P${m[1]}, but their form averages P${fmtAverage(line.avg)}`,
    );
  }
  return spans;
}

/** Python prints a float average with its decimal point (`1.0`); `String()` would not. */
function fmtAverage(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function resultClaims(
  s: Sentence,
  skip: [number, number][],
): [ClaimKind, number, number, number][] {
  const inside = (start: number, end: number): boolean =>
    skip.some(([a, b]) => a <= start && end <= b);

  const claims: [ClaimKind, number, number, number][] = [];
  for (const m of all(WIN, s.norm)) {
    if (inside(startOf(m), endOf(m))) continue;
    if (MODAL_BEFORE.test(s.norm.slice(0, startOf(m)))) continue;
    if (TITLE_AFTER.test(s.norm.slice(endOf(m)))) continue;
    claims.push(['win', 1, startOf(m), endOf(m)]);
  }
  for (const m of all(POSITION, s.norm)) {
    if (s.overlaps(startOf(m), endOf(m)) || inside(startOf(m), endOf(m))) continue;
    claims.push(['pos', Number(m[1]), startOf(m), endOf(m)]);
  }
  for (const pattern of [PLACE, FINISHED, NUMBERED_PLACE]) {
    for (const m of all(pattern, s.norm)) {
      if (s.overlaps(startOf(m, 1), endOf(m, 1))) continue;
      claims.push(['pos', ordinalValue(m[1]!), startOf(m, 1), endOf(m, 1)]);
    }
  }
  for (const m of all(RUNNER_UP, s.norm)) claims.push(['pos', 2, startOf(m), endOf(m)]);
  for (const m of all(PODIUM, s.norm)) {
    if (inside(startOf(m), endOf(m))) continue;
    claims.push(['podium', 3, startOf(m), endOf(m)]);
  }
  for (const m of all(DNF, s.norm)) {
    if (inside(startOf(m), endOf(m))) continue;
    claims.push(['dnf', 0, startOf(m), endOf(m)]);
  }
  return claims;
}

function describe(kind: ClaimKind, value: number): string {
  if (kind === 'win') return 'won';
  if (kind === 'pos') return `finished P${value}`;
  if (kind === 'podium') return 'finished on the podium';
  return 'did not finish';
}

function checkResultsSentence(ctx: Context, s: Sentence, found: Mention[], counts: Counts): void {
  const drivers = found.filter((m) => m.kind === 'driver');
  if (drivers.length === 0) return;
  const spans = checkForm(ctx, s, drivers, counts);
  const claims = resultClaims(s, spans);
  if (claims.length === 0) return;
  const races = raceMentions(ctx, s);
  const [years, yearSpans] = namedYears(ctx, s);
  let usedYear = false;

  for (const [kind, value, start, end] of claims) {
    const paired = nearest(drivers, start, end)!;
    if (kind === 'pos' && !s.overlaps(start, end)) s.consume(start, end);
    const race = nearest(races, start, end);
    let pool = race ? race.entries : [];
    if (years.size) {
      pool = pool.filter((e) => years.has(e.year));
      usedYear = usedYear || pool.length > 0;
    }
    const distinct = new Set(pool.map((e) => `${e.year}|${norm(e.event).toLowerCase()}`));
    const outcomes = pool.map((entry) => holds(entry, paired.key, kind, value));
    if (outcomes.includes(true)) {
      counts.results += 1;
    } else if (outcomes.includes(false) && (distinct.size === 1 || years.size > 0)) {
      const named = [...new Set(pool.map((e) => `${e.year} ${e.event}`))].sort().join(', ');
      s.fail(
        'results',
        `says ${paired.key} ${describe(kind, value)}, which the ${named} data does not show`,
      );
    } else {
      s.flag(PRIORITY_RESULT, 'results', 'result not in the gathered data');
    }
  }
  if (usedYear) {
    for (const [start, end] of yearSpans) s.consume(start, end);
  }
}

function checkAsOfSentence(ctx: Context, s: Sentence): void {
  const race = ctx.race;
  for (const m of all(YEAR, s.norm)) {
    const year = Number(m[1]);
    if (year > ctx.cutoffYear) {
      s.consume(startOf(m, 1), endOf(m, 1));
      s.flag(PRIORITY_YEAR, 'as_of', `mentions ${year}, after the briefing's cutoff`);
    }
  }
  if (race.is_upcoming) return;
  for (const event of ctx.evidence.later_events ?? []) {
    for (const name of [event, event.replace('Grand Prix', 'GP')]) {
      if (termPattern(name).test(s.norm)) {
        s.fail('as_of', `mentions the ${event}, run after the cutoff`);
        break;
      }
    }
  }
  const own = [termPattern(race.name), termPattern(race.name.replace('Grand Prix', 'GP'))];
  if (own.some((p) => p.test(s.norm)) && termPattern(String(race.year)).test(s.norm)) {
    for (const m of all(WIN, s.norm)) {
      if (MODAL_BEFORE.test(s.norm.slice(0, startOf(m)))) continue;
      s.fail('as_of', `gives the result of the ${race.year} ${race.name} itself`);
      break;
    }
  }
}

interface ForecastSession {
  temperature_c: number | null;
  rain_probability: number | null;
  wind_speed_ms: number | null;
}

function matchesForecast(
  kind: string,
  unit: string,
  value: number,
  session: ForecastSession,
): boolean {
  if (kind === 'temperature') {
    const celsius = session.temperature_c!;
    if (unit === 'F') return Math.abs(value - ((celsius * 9) / 5 + 32)) <= 1;
    return Math.abs(value - celsius) <= 0.5;
  }
  if (kind === 'rain') {
    const rain = session.rain_probability;
    return rain !== null && rain !== undefined && Math.abs(value - rain) <= 0.5;
  }
  const wind = session.wind_speed_ms;
  if (wind === null || wind === undefined) return false;
  if (unit === 'm/s') return Math.abs(value - wind) <= 0.5;
  if (unit === 'mph') return Math.abs(value - wind * 2.237) <= 2;
  return Math.abs(value - wind * 3.6) <= 2;
}

function unitLabel(kind: string, unit: string): string {
  if (kind === 'temperature') return `°${unit}`;
  if (kind === 'rain') return '%';
  return ` ${unit}`;
}

function checkWeatherSentence(
  ctx: Context,
  s: Sentence,
  status: WeatherStatus,
  counts: Counts,
): void {
  const sessions = (ctx.evidence.weather?.sessions ?? []).filter(
    (x) => x.temperature_c !== null && x.temperature_c !== undefined,
  );
  const figures: [string, string, number, number, number][] = [];
  for (const m of all(TEMPERATURE, s.norm)) {
    const unit = (m[2] || m[3] || m[4] || 'C')[0]!.toUpperCase();
    figures.push(['temperature', unit, Number(m[1]), startOf(m, 1), endOf(m, 1)]);
  }
  for (const m of all(RAIN, s.norm)) {
    figures.push(['rain', '%', Number(m[1]), startOf(m, 1), endOf(m, 1)]);
  }
  for (const m of all(WIND, s.norm)) {
    figures.push(['wind', m[2]!.toLowerCase(), Number(m[1]), startOf(m, 1), endOf(m, 1)]);
  }

  if (status !== 'forecast') {
    for (const [, , , start, end] of figures) s.consume(start, end);
    if (figures.length) s.fail('weather', `quotes conditions, but ${WEATHER_WHY[status]}`);
    return;
  }

  if (NOT_IN_FORECAST.test(s.norm)) {
    s.fail('weather', 'says the weekend is not in the forecast, but it is');
  }
  const track = TRACK_TEMPERATURE.test(s.norm);
  for (const [kind, unit, value, start, end] of figures) {
    s.consume(start, end);
    if (kind === 'temperature' && track) {
      s.flag(PRIORITY_TRACK_TEMP, 'weather', 'track temperature, which the forecast does not give');
    } else if (sessions.some((session) => matchesForecast(kind, unit, value, session))) {
      counts.weather += 1;
    } else {
      s.fail(
        'weather',
        `quotes ${fmt(value)}${unitLabel(kind, unit)}, which no session's forecast gives`,
      );
    }
  }
}

function weatherStatus(example: CheckableExample): WeatherStatus {
  if (!example.tool_plan.includes('get_race_weather')) return 'not_gathered';
  const status = example.evidence.weather?.status || 'not_gathered';
  if (status === 'ok' || status === 'partial') return 'forecast';
  if (status === 'outside_forecast_range') return 'outside';
  return status === 'not_gathered' || status === 'weekend_over' ? status : 'not_gathered';
}

function uncheckedFigures(s: Sentence): string[] {
  return all(DIGITS, s.norm)
    .filter((m) => !s.overlaps(startOf(m), endOf(m)))
    .map((m) => m[0]);
}

interface Counts {
  points: number;
  season: number;
  positions: number;
  results: number;
  weather: number;
}

// --- the example -------------------------------------------------------------------------------

export function checkExample(example: CheckableExample): BriefingCheckResult {
  const race = example.race_info;
  const evidence = example.evidence;
  const [units, seen] = parseUnits(example.briefing.content);
  const ctx = buildContext(example);
  const failed: BriefingCheckFailure[] = [];
  const passed: BriefingCheckPass[] = [];

  const tools = example.tools;
  const toolNames = new Set(tools.map((t) => t.tool));
  const missing = example.tool_plan.filter((t) => !toolNames.has(t));
  if (tools.every((t) => t.success) && missing.length === 0) {
    passed.push({ check: 'tools', detail: `${tools.length} of ${tools.length} tools succeeded` });
  } else {
    const bad = [...tools.filter((t) => !t.success).map((t) => t.tool), ...missing];
    failed.push({ check: 'tools', detail: `did not succeed: ${bad.join(', ')}` });
  }

  if (example.briefing.truncated) {
    failed.push({ check: 'complete', detail: 'the briefing was truncated' });
  } else {
    passed.push({ check: 'complete', detail: 'the briefing is complete, not truncated' });
  }

  const absent = SECTIONS.filter((title) => !seen.includes(title));
  if (absent.length) {
    failed.push({ check: 'sections', detail: `missing: ${absent.join(', ')}` });
  } else {
    passed.push({ check: 'sections', detail: 'all six sections are present' });
  }

  const counts: Counts = { points: 0, season: 0, positions: 0, results: 0, weather: 0 };
  const status = weatherStatus(example);
  const sentences = units.map((unit, index) => new Sentence(unit, index));
  for (const s of sentences) {
    preConsume(ctx, s);
    const found = mentions(ctx, s.norm);
    checkCircuitSentence(ctx, s);
    checkAsOfSentence(ctx, s);
    checkSeasonCounts(ctx, s, counts);
    checkPoints(ctx, s, found, counts);
    if (s.section !== 'Predictions') {
      checkStandingClaims(ctx, s, found, counts);
      checkResultsSentence(ctx, s, found, counts);
    }
    if (s.section === 'Weather Watch') checkWeatherSentence(ctx, s, status, counts);
  }

  const circuit = race.circuit_name;
  if (circuit && !sentences.some((s) => termPattern(circuit).test(s.norm))) {
    failed.push({ check: 'circuit', detail: `never names ${circuit}` });
  }

  const sectionRank = new Map<string, number>(
    ['Preamble', ...SECTIONS].map((title, rank) => [title, rank]),
  );
  const flagged: [number, number, BriefingCheckFlag][] = [];
  for (const s of sentences) {
    if (s.failures.length) {
      for (const [check, why] of s.failures) failed.push({ check, detail: `"${s.text}" ${why}` });
      continue;
    }
    let reasons = [...s.unverified];
    if (s.section === 'Predictions') {
      reasons = reasons.filter((r) => r[0] === PRIORITY_YEAR);
    } else {
      const figures = uncheckedFigures(s);
      if (figures.length) {
        reasons.push([
          PRIORITY_FIGURE,
          'figures',
          `figure not checked against the data: ${figures[0]}`,
        ]);
      }
      if (s.section === 'Track Profile' && !s.verified) {
        reasons.push([PRIORITY_CIRCUIT, 'circuit', 'circuit knowledge, not in the gathered data']);
      }
    }
    if (reasons.length) {
      const [, check, reason] = reasons.reduce((best, r) => (r[0] < best[0] ? r : best));
      flagged.push([
        sectionRank.get(s.section)!,
        s.index,
        { check, section: s.section, claim: s.text, reason },
      ]);
    }
  }

  const weatherUnits = sentences.filter((s) => s.section === 'Weather Watch');
  const weatherText = weatherUnits.map((s) => s.text).join(' ');
  let weatherFailed = failed.some((f) => f.check === 'weather');
  let sectionFlag: string | null = null;
  if (!seen.includes('Weather Watch')) {
    failed.push({ check: 'weather', detail: 'there is no Weather Watch section' });
    weatherFailed = true;
  } else if (!weatherFailed && status === 'outside') {
    const available = evidence.weather?.available_from;
    if (available && !weatherUnits.some((s) => datePattern(available).test(s.norm))) {
      sectionFlag = `Weather Watch does not give the date the forecast opens (${available})`;
    }
  } else if (!weatherFailed && status !== 'forecast') {
    const said = norm(weatherText);
    if (!NOT_GATHERED.test(said) && !NOT_IN_FORECAST.test(said)) {
      sectionFlag = 'Weather Watch does not say why there is no forecast';
    }
  }
  const claims = new Set(flagged.map(([, , entry]) => entry.claim));
  if (sectionFlag && weatherUnits.length && !claims.has(weatherText)) {
    flagged.push([
      sectionRank.get('Weather Watch')!,
      weatherUnits[0]!.index,
      { check: 'weather', section: 'Weather Watch', claim: weatherText, reason: sectionFlag },
    ]);
  }

  const clean = (check: string): boolean => !failed.some((f) => f.check === check);

  if (clean('circuit')) {
    const others = evidence.other_venues ?? [];
    const venues = others.length
      ? `none of the other venues that have hosted the ${race.name} (${others.join(', ')})`
      : `no other venue has hosted the ${race.name}`;
    passed.push({ check: 'circuit', detail: `names ${circuit}; ${venues}` });
  }
  const standings = evidence.standings;
  if (clean('standings')) {
    const table = standings ? `the ${standings.year} table as of the cutoff` : 'the season';
    passed.push({
      check: 'standings',
      detail:
        `${counts.points} points figures, ${counts.season} season counts ` +
        `and ${counts.positions} table positions match ${table}`,
    });
  }
  if (clean('results')) {
    passed.push({
      check: 'results',
      detail: `${counts.results} quoted results match the gathered data`,
    });
  }
  if (clean('as_of')) {
    passed.push({
      check: 'as_of',
      detail: `nothing after the cutoff (${minute(race.as_of)}) is mentioned`,
    });
  }
  if (!weatherFailed) {
    let detail: string;
    if (status === 'forecast') {
      detail = `${counts.weather} conditions figures match the forecast`;
    } else if (status === 'outside') {
      detail =
        'quotes no conditions for a weekend outside the forecast, which opens ' +
        `${evidence.weather?.available_from ?? 'None'}`;
    } else {
      detail = `quotes no conditions; ${WEATHER_WHY[status]}`;
    }
    passed.push({ check: 'weather', detail });
  }

  const order = (check: string): number => CHECK_ORDER.indexOf(check);
  passed.sort((a, b) => order(a.check) - order(b.check));
  failed.sort((a, b) => order(a.check) - order(b.check));
  flagged.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { passed, flagged: flagged.map(([, , entry]) => entry), failed };
}
