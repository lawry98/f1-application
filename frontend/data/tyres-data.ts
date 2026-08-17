/**
 * Everything the /tyres page states about Formula 1 tyres, in one typed place.
 *
 * Two rules govern this file.
 *
 * **The numbered range and the race-weekend label are different things.** Pirelli builds a
 * range of numbered dry compounds for a season and nominates three of them for each Grand
 * Prix; only at that event do those three become Hard, Medium and Soft. The same number is
 * the Hard at one race and the Medium or Soft at another. The types below keep those two
 * ideas in separate shapes — `DryCompound` has no label field at all, and a label only
 * exists inside a `WeekendAllocation` — so no component can render one as if it were the
 * other. That is the single most important thing this page teaches.
 *
 * **Nothing here is a number we made up.** Qualitative behaviour (softer compounds offer
 * more grip and less life) is definitional and stated in words. Anything that is a real
 * measurement — an allocation count, a regulation, a water-displacement figure — carries a
 * `SourceRef` and is only present if a primary publication supports it.
 */

/** The three tread constructions the artwork draws. A slick has no pattern; that is the point. */
export type TyreTread = 'slick' | 'intermediate' | 'wet';

/**
 * A five-step ordinal ranking, used for grip, durability and warm-up speed.
 *
 * A **relative ordering within a `ComparisonGroup`** — never across one — and not a measurement
 * of anything. It exists because a reader comparing compounds needs to see the shape of the
 * trade-off at a glance, and prose alone makes that work. Every rendering of it names the group
 * it is relative to, and no unit is ever attached.
 */
export type Ordinal = 1 | 2 | 3 | 4 | 5;

export interface SourceRef {
  /** Short name as it appears in the citation list, e.g. "Pirelli". */
  publisher: string;
  title: string;
  url: string;
}

/**
 * The page's compound palette.
 *
 * These are **this page's own colours**, picked to read as the familiar sidewall bands on a
 * `zinc-950` background — not a claim to be anyone's exact brand hexes. They are used
 * decoratively at full strength and are put through `lib/tyre-utils.ts` before they carry
 * any text, because four of the six fail AA outright as small text and two are too bright
 * to be a surface at all.
 */
export const COMPOUND_COLORS = {
  hard: '#f4f4f5',
  medium: '#ffd12e',
  soft: '#e8382f',
  intermediate: '#3fbf4f',
  wet: '#2b8fe0',
} as const;

export type CompoundColorKey = keyof typeof COMPOUND_COLORS;

/**
 * One of the five tyres a driver can actually be on during a session — the three dry
 * **labels** plus the two wet-weather compounds. These are what the explorer shows, because
 * these are the things that own a colour.
 *
 * Note what is *not* here: a compound number. Hard, Medium and Soft are roles assigned at
 * each Grand Prix, not fixed products, so this shape cannot carry one. The join between a
 * role and a number exists only inside a dated `WeekendAllocation`.
 */
export interface RaceCompound {
  id: CompoundColorKey;
  /** Display name, e.g. "Medium". */
  name: string;
  /** Editorial category label sitting above the name. */
  category: string;
  color: string;
  tread: TyreTread;
  /** One line of editorial voice. */
  tagline: string;
  /** Two or three sentences of plain explanation. */
  summary: string;
  /** Relative rankings across these five. Not measurements — see `Ordinal`. */
  grip: Ordinal;
  durability: Ordinal;
  /** How readily it reaches its working range: 5 = switches on fastest. */
  warmUp: Ordinal;
  warmUpNote: string;
  degradation: string;
  suitedTo: string;
  strategicRole: string;
  scenario: { title: string; body: string; source: SourceRef };
  /**
   * What backs the descriptive copy above. Required, not optional: the explorer is the section
   * most readers will see, it paraphrases Pirelli directly, and a panel that quotes a
   * manufacturer with nothing to click is the weakest thing this page could do.
   */
  sources: SourceRef[];
  /**
   * Position on the durability-to-maximum-attack scale, `0` to `1`.
   * `0` is "make it to the end"; `1` is "one lap, everything you have".
   */
  attack: number;
  /**
   * For the three dry labels: the sentence that stops a reader believing the label is a
   * product. Absent on the wet-weather compounds, which really are single products.
   */
  nominationNote?: string;
}

/**
 * One step of the season's numbered dry range.
 *
 * Deliberately colourless and label-free. Rendering these in neutral graphite while the
 * `RaceCompound` set owns the reds and yellows is half the argument the page is making.
 */
export interface DryCompoundNumber {
  id: string;
  /** e.g. "C2". */
  name: string;
  /** 1 is the hardest, most durable end of the range. */
  rank: number;
  character: string;
}

/**
 * A real, dated example of three numbered compounds being nominated for one Grand Prix and
 * relabelled Hard, Medium and Soft for it.
 *
 * Always rendered as one of several, never alone: a single example is indistinguishable from
 * a rule, and the rule is exactly what is not true.
 */
export interface WeekendAllocation {
  event: string;
  /** The season this allocation belongs to. */
  season: number;
  picks: { label: 'Hard' | 'Medium' | 'Soft'; compound: string }[];
  note: string;
  source: SourceRef;
}

export interface StrategyScenario {
  id: string;
  situation: string;
  detail: string;
  /** What a team would lean towards, and why. Never phrased as the one right answer. */
  leaning: string;
  advantage: string;
  risk: string;
  /**
   * Plural, because several of these draw their upside and their risk from *different* races —
   * and a single `source` field led to a Hungary race report being cited for claims about
   * Melbourne and Montreal.
   */
  sources: SourceRef[];
}

export interface LifecycleStage {
  id: string;
  name: string;
  body: string;
  /** Only set where a primary publication supports the claim. */
  source?: SourceRef;
}

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

/* ------------------------------------------------------------------------- *
 * Provenance
 * ------------------------------------------------------------------------- */

/**
 * The page states the date of its own facts rather than implying they are live. Updating
 * the content is a data edit; this constant is the one place the date lives, so the badge in
 * the hero and the line above the citation list cannot drift apart.
 */
export const TYRES_CONTENT_AS_OF = '17 August 2026';
export const TYRES_SEASON = 2026;

const SRC = {
  range2026: {
    publisher: 'Pirelli',
    title: 'The range of compounds for the 2026 season has been set',
    url: 'https://press.pirelli.com/the-range-of-compounds-for-the-2026-season-has-been-set/',
  },
  reveal2026: {
    publisher: 'Pirelli',
    title: 'Pirelli reveals 2026 F1 tyres, a fresh logo design and new compounds',
    url: 'https://press.pirelli.com/pirelli-reveals-2026-f1-tyres-a-fresh-logo-design-and-new-compounds/',
  },
  products: {
    publisher: 'Pirelli',
    title: 'Formula 1 tyres',
    url: 'https://www.pirelli.com/tyres/en-ww/motorsport/f1/tyres',
  },
  beginners: {
    publisher: 'Formula 1',
    title: "The beginner's guide to Formula 1 tyres",
    url: 'https://www.formula1.com/en/latest/article/the-beginners-guide-to-formula-1-tyres.61SvF0Kfg29UR2SPhakDqd',
  },
  choosing: {
    publisher: 'Pirelli',
    title: 'Formula 1 for dummies: the choice of tyres',
    url: 'https://www.pirelli.com/global/en-ww/race/racingspot/formula-1/formula-1-for-dummies-the-choice-of-tyres-in-formula-1-53864/',
  },
  suzuka2026: {
    publisher: 'Pirelli',
    title: 'The Suzuka challenge, with the hardest trio in the range',
    url: 'https://press.pirelli.com/the-suzuka-challenge-with-the-hardest-trio-in-the-range/',
  },
  monacoBarcelona2026: {
    publisher: 'Pirelli',
    title: 'The tyre compound selections for Monte Carlo and Barcelona',
    url: 'https://press.pirelli.com/the-tyre-compound-selections-for-monte-carlo-and-barcelona/',
  },
  barcelona2026: {
    publisher: 'Formula 1',
    title: 'What tyres will the teams and drivers have for the 2026 Barcelona-Catalunya Grand Prix',
    url: 'https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2026-barcelona-catalunya-grand-prix.2wVnaPZmlQUuj9P72FrjuA',
  },
  crossover: {
    publisher: 'Pirelli',
    title: "When it's time to change from slick to wet tyres",
    url: 'https://www.pirelli.com/global/en-ww/race/racingspot/formula-1/when-it-s-time-to-change-from-slick-to-wet-tyres-in-formula-1-52943/',
  },
  graining: {
    publisher: 'Pirelli',
    title: "It's graining, men!",
    url: 'https://www.pirelli.com/global/en-ww/race/racingspot/formula-1/it-s-graining-men--124082/',
  },
  bahrain2025: {
    publisher: 'Pirelli',
    title: 'In Bahrain with prior knowledge',
    url: 'https://press.pirelli.com/in-bahrain-with-prior-knowledge/',
  },
  bahrainRace2025: {
    publisher: 'Pirelli',
    title: "Piastri's clean sweep in McLaren's second home race",
    url: 'https://press.pirelli.com/piastris-clean-sweep-in-mclarens-second-home-race/',
  },
  austria2025: {
    publisher: 'Pirelli',
    title: 'A hot summer of Formula 1 gets underway in Austria',
    url: 'https://press.pirelli.com/a-hot-summer-of-formula-1-gets-underway-in-austria/',
  },
  silverstone2026: {
    publisher: 'Pirelli',
    title: 'Leclerc paints Silverstone red',
    url: 'https://press.pirelli.com/leclerc-paints-silverstone-red/',
  },
  barcelonaRace2026: {
    publisher: 'Pirelli',
    title: "Tyre strategy delivers Hamilton's first win in red",
    url: 'https://press.pirelli.com/tyre-strategy-delivers-hamiltons-first-win-in-red-0/',
  },
  silverstone2025: {
    publisher: 'Pirelli',
    title: 'McLaren back on top in Silverstone',
    url: 'https://press.pirelli.com/mclaren-back-on-top-in-silverstone/',
  },
  hungary2026: {
    publisher: 'Pirelli',
    title: 'Norris wins in Hungary with a late charge on Softs',
    url: 'https://press.pirelli.com/norris-wins-in-hungary-with-a-late-charge-on-softs/',
  },
  budapest2026: {
    publisher: 'Pirelli',
    title: 'The heat is on in Budapest',
    url: 'https://press.pirelli.com/the-heat-is-on-in-budapest/',
  },
  blanketsBritish2026: {
    publisher: 'FIA',
    title: '2026 British Grand Prix — Competition Notes, Pirelli Preview',
    url: 'https://www.fia.com/system/files/decision-document/2026_british_grand_prix_-_competition_notes_-_pirelli_preview.pdf',
  },
  blanketsMiami2026: {
    publisher: 'FIA',
    title: '2026 Miami Grand Prix — Competition Notes, Pirelli Preview',
    url: 'https://www.fia.com/system/files/decision-document/2026_miami_grand_prix_-_competition_notes_-_pirelli_preview.pdf',
  },
  sporting2026: {
    publisher: 'FIA',
    title: '2026 Formula 1 Sporting Regulations, Section B',
    url: 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_05_-_2026-02-27.pdf',
  },
  fsc: {
    publisher: 'Pirelli',
    title: "Pirelli's FSC-certified tyres make their debut in Formula 1",
    url: 'https://press.pirelli.com/pirellis-motorsport-fsc-certified-tyres-forest-stewardship-council-make-their-debut-in-formula-1/',
  },
  sustainability: {
    publisher: 'Pirelli',
    title: 'Sustainability behind every Pirelli motorsport tyre',
    url: 'https://www.pirelli.com/global/en-ww/life/sustainability/mobility/sustainability-behind-every-pirelli-motorsports-tyre-53668/',
  },
  season2025Numbers: {
    publisher: 'Pirelli',
    title: 'The 2025 Formula 1 season in numbers',
    url: 'https://press.pirelli.com/the-2025-formula-1-season-in-numbers/',
  },
  importance: {
    publisher: 'Pirelli',
    title: 'The importance of tyres in Formula 1',
    url: 'https://www.pirelli.com/global/en-ww/race/racingspot/formula-1/the-importance-of-tyres-in-formula-1-53772/',
  },
  melbourne2025: {
    publisher: 'Pirelli',
    title: 'Melbourne writes the first chapter of the new F1 season',
    url: 'https://press.pirelli.com/melbourne-writes-the-first-chapter-of-the-new-f1-season/',
  },
  canada2026: {
    publisher: 'Pirelli',
    title: 'Antonelli wins the Canadian Grand Prix, Hamilton and Verstappen on the podium',
    url: 'https://press.pirelli.com/antonelli-wins-the-canadian-grand-prix-hamilton-and-verstappen-on-the-podium/',
  },
  hungaryAllocation2026: {
    publisher: 'Formula 1',
    title: 'What tyres will the teams and drivers have for the 2026 Hungarian Grand Prix',
    url: 'https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2026-hungarian-grand-prix.RikSxOCPXMkPloK0RRmqQ',
  },
} as const satisfies Record<string, SourceRef>;

/** Every source the page cites, in the order the citation list shows them. */
export const TYRE_SOURCES: SourceRef[] = Array.from(
  new Map(Object.values(SRC).map((s) => [s.url, s as SourceRef])).values(),
);

/* ------------------------------------------------------------------------- *
 * The five compounds a driver can actually be on
 * ------------------------------------------------------------------------- */

/**
 * Ordinals are compared **within** a group, never across one. A full wet's grip rating is
 * about grip in standing water, where no slick has any; putting the two on one ladder would
 * be meaningless. Every rendering of the bars prints the group it belongs to.
 */
export type ComparisonGroup = 'dry' | 'wet';

export const RACE_COMPOUNDS: (RaceCompound & { comparisonGroup: ComparisonGroup })[] = [
  {
    id: 'hard',
    name: 'Hard',
    category: 'Dry slick · white sidewall',
    comparisonGroup: 'dry',
    color: COMPOUND_COLORS.hard,
    tread: 'slick',
    tagline: 'The long game.',
    summary:
      'The hardest of the three compounds nominated for a Grand Prix. It gives up lap time to give back stint length, and it is the tyre a team reaches for when the alternative is an extra pit stop. Pirelli describes the hardest end of its range as built for maximum resistance to heat and extreme forces, capable of very long stints, at the expense of peak performance.',
    grip: 2,
    durability: 5,
    warmUp: 2,
    warmUpNote:
      'Slowest to switch on. On a cool track or an out-lap behind traffic it can take most of a lap to come alive, which is why an early safety car so often catches Hard-shod cars out.',
    degradation:
      'Least prone to thermal degradation of the three, which is exactly why it is nominated where the track takes the most energy out of the tyre.',
    suitedTo:
      'Abrasive surfaces, high-energy corner sequences, hot races, and any circuit where the field would otherwise be pitting twice.',
    strategicRole:
      'The stint that buys track position: run long, let others stop, and rejoin in clear air.',
    scenario: {
      title: 'Silverstone 2026 — the whole grid, then a rethink',
      body: 'Every car started on the middle compound and switched to the Hard, exactly as a one-stop wants. Two late neutralisations tore it up and forced everyone into at least two stops.',
      source: SRC.silverstone2026,
    },
    sources: [SRC.products, SRC.range2026],
    attack: 0.15,
    nominationNote:
      'Hard is a role, not a product. It is whichever of the season’s numbered compounds is the hardest of the three chosen for that particular Grand Prix.',
  },
  {
    id: 'medium',
    name: 'Medium',
    category: 'Dry slick · yellow sidewall',
    comparisonGroup: 'dry',
    color: COMPOUND_COLORS.medium,
    tread: 'slick',
    tagline: 'The compromise that usually wins.',
    summary:
      'The middle of the three nominated compounds, and more often than not the race tyre. It is quick enough to defend a position and durable enough to reach a sensible pit window, which is why it turns up in the largest share of racing laps at a lot of Grands Prix.',
    grip: 3,
    durability: 4,
    warmUp: 3,
    warmUpNote:
      'Comes in without drama. Enough working range that a driver can lean on it from early in a stint without spending the tyre doing it.',
    degradation:
      'Sits between the other two on both wear and thermal degradation — the reason it is so often the tyre the strategy is built around rather than the tyre the strategy works around.',
    suitedTo:
      'Almost anything. It is the default first stint at circuits where a one-stop and a two-stop are close.',
    strategicRole:
      'The anchor stint. Start on it, or take it in the middle, and keep both a one-stop and a two-stop alive for as long as possible.',
    scenario: {
      title: 'Bahrain 2025 — the majority tyre in a race nobody could one-stop',
      body: 'Degradation across all three compounds was significant enough that a two-stop was, in Pirelli’s words, the only real choice. The Medium still carried more of the race distance than either other compound, at just under 46%.',
      source: SRC.bahrainRace2025,
    },
    sources: [SRC.products, SRC.choosing],
    attack: 0.45,
    nominationNote:
      'Medium is a role, not a product. The same numbered compound that is the Medium at one race can be the Hard or the Soft at the next.',
  },
  {
    id: 'soft',
    name: 'Soft',
    category: 'Dry slick · red sidewall',
    comparisonGroup: 'dry',
    color: COMPOUND_COLORS.soft,
    tread: 'slick',
    tagline: 'Everything, right now.',
    summary:
      'The softest of the three nominated compounds. It warms up fastest, delivers the largest footprint and the most grip, and gives you the fastest lap times of the weekend — for a shorter time than you would like. Eight of the thirteen dry sets a driver gets are Softs, one of them reserved for anyone reaching Q3.',
    grip: 5,
    durability: 2,
    warmUp: 5,
    warmUpNote:
      'Switches on quickest of the three. That is what makes it the qualifying tyre, and what makes it so tempting on a safety-car restart when there are only a few laps left to attack.',
    degradation:
      'Degrades fastest, and can grain when the track is cold or the tyre is being asked for more than it has. Its life is often decided in the first two laps of a stint.',
    suitedTo:
      'Slow, smooth or street circuits where mechanical grip matters most and the surface takes little out of the tyre.',
    strategicRole:
      'Qualifying, the undercut, and the last roll of the dice — a short final stint where raw pace beats tyre life.',
    scenario: {
      title: 'Hungary 2026 — a third stop nobody needed, on purpose',
      body: 'Simulations had a one-stop and a two-stop dead level. The win came from neither: a Virtual Safety Car made an extra stop cheap, and a late stint on Softs did the rest.',
      source: SRC.hungary2026,
    },
    sources: [SRC.beginners, SRC.hungaryAllocation2026],
    attack: 0.85,
    nominationNote:
      'Soft is a role, not a product. It names the softest of the three compounds picked for that event, which changes from race to race.',
  },
  {
    id: 'intermediate',
    name: 'Intermediate',
    category: 'Wet weather · green sidewall',
    comparisonGroup: 'wet',
    color: COMPOUND_COLORS.intermediate,
    tread: 'intermediate',
    tagline: 'The one that does the most work.',
    summary:
      'A patterned tyre for a wet track with no standing water, and for a drying one. Pirelli designs it with a deliberately wide working range so it overlaps both the slick and the full wet, which is why it ends up doing most of the running in most wet races — including ones that start behind a safety car.',
    grip: 4,
    durability: 3,
    warmUp: 3,
    warmUpNote:
      'Needs water to stay cool. On a drying line it overheats and goes off quickly, which is the clock every team is watching before the switch to slicks.',
    degradation:
      'Wears fastest exactly when it is quickest — on a drying track, where there is no longer enough water to carry the heat away.',
    suitedTo:
      'Light rain, a damp track, a drying track, and the long tail of almost every rain-affected race.',
    strategicRole:
      'The default wet tyre, and the tyre both crossover decisions are measured against — slick-to-inter on the way down, inter-to-slick on the way back up.',
    scenario: {
      title: 'Silverstone 2025 — the same call, made twice, judged differently',
      body: 'Five drivers gambled on slicks before the start and the rain arrived earlier than expected, handing the advantage to everyone who had stayed on Intermediates. The tyre then did most of the middle of the race before conditions finally came to the slicks.',
      source: SRC.silverstone2025,
    },
    sources: [SRC.products, SRC.crossover],
    attack: 0.5,
  },
  {
    id: 'wet',
    name: 'Full Wet',
    category: 'Wet weather · blue sidewall',
    comparisonGroup: 'wet',
    color: COMPOUND_COLORS.wet,
    tread: 'wet',
    tagline: 'For water the others cannot move.',
    summary:
      'The heavy-rain tyre, with a profile built to resist aquaplaning and a tread that disperses very large quantities of water. Its limit is often not grip at all: in genuinely heavy rain, Pirelli notes, it is visibility rather than grip that causes the problem, and races get stopped.',
    grip: 5,
    durability: 4,
    warmUp: 2,
    warmUpNote:
      'Gets no tyre blankets at all under the current rules, so it starts cold — one reason it is a harder tyre to be confident on in the first laps after a restart.',
    degradation:
      'Survives standing water well, but suffers as soon as the track dries: without water to cool it, the tread overheats and the Intermediate becomes quicker.',
    suitedTo:
      'Standing water, a track that has just been declared raceable, and restarts behind the safety car in genuinely heavy rain.',
    strategicRole:
      'Survival and continuation — keeping the race running, and getting to the point where an Intermediate is the right answer again.',
    scenario: {
      title: 'Melbourne 2025 — three phases in one afternoon',
      body: 'Everyone started on Intermediates. A neutralisation on lap 33 triggered a switch to slicks, split evenly between Medium and Hard. Then the rain returned and the whole field came back for Intermediates to the flag.',
      source: SRC.melbourne2025,
    },
    sources: [SRC.products, SRC.blanketsMiami2026],
    attack: 0.3,
  },
];

/* ------------------------------------------------------------------------- *
 * The numbered range, and how it becomes Hard / Medium / Soft
 * ------------------------------------------------------------------------- */

/**
 * The 2026 dry slick range: five compounds, C1 to C5.
 *
 * **This is a change from 2025**, which ran six. Pirelli dropped the C6 because the gap
 * between it and the C5 was too small to be worth a step. Anything built assuming six
 * compounds is describing last season.
 */
export const DRY_RANGE: DryCompoundNumber[] = [
  {
    id: 'c1',
    name: 'C1',
    rank: 1,
    character:
      'The hardest in the range, nominated where a circuit takes the most energy out of the tyre. Built for resistance to heat and extreme forces and for very long stints, at the cost of peak performance.',
  },
  {
    id: 'c2',
    name: 'C2',
    rank: 2,
    character:
      'Suited to faster, hotter and more abrasive circuits. Also the conservative pick for a new venue, where real tyre loads have never been measured in competition.',
  },
  {
    id: 'c3',
    name: 'C3',
    rank: 3,
    character:
      'The most versatile compound in the range. Pirelli says it can serve as the hardest, the middle or the softest of a three-compound selection — and in 2026 it has done all three.',
  },
  {
    id: 'c4',
    name: 'C4',
    rank: 4,
    character:
      'Built for low-severity circuits where a quick warm-up matters, so peak performance arrives as soon as possible. Used extensively across a season.',
  },
  {
    id: 'c5',
    name: 'C5',
    rank: 5,
    character:
      'The softest in the range, for the slowest circuits with low wear and degradation where maximum mechanical grip is what counts — typically street circuits or exceptionally smooth asphalt.',
  },
];

export const DRY_RANGE_SOURCE: SourceRef = SRC.products;

/**
 * The proof, in three dated rows: **the same numbered compound carrying all three labels
 * inside one season.**
 *
 * This is why the page separates the two ideas at the type level. C3 was the Soft at Suzuka,
 * the Medium at Barcelona and the Hard at Monaco — 2026, all three sourced.
 */
export const ALLOCATION_EXAMPLES: WeekendAllocation[] = [
  {
    event: 'Japanese Grand Prix, Suzuka',
    season: 2026,
    picks: [
      { label: 'Hard', compound: 'C1' },
      { label: 'Medium', compound: 'C2' },
      { label: 'Soft', compound: 'C3' },
    ],
    note: 'The hardest trio in the range, because Suzuka is one of the toughest circuits of the year for tyres.',
    source: SRC.suzuka2026,
  },
  {
    event: 'Barcelona-Catalunya Grand Prix',
    season: 2026,
    picks: [
      { label: 'Hard', compound: 'C2' },
      { label: 'Medium', compound: 'C3' },
      { label: 'Soft', compound: 'C4' },
    ],
    note: 'A step softer than the previous year, chosen to encourage more pit stops.',
    source: SRC.barcelona2026,
  },
  {
    event: 'Monaco Grand Prix',
    season: 2026,
    picks: [
      { label: 'Hard', compound: 'C3' },
      { label: 'Medium', compound: 'C4' },
      { label: 'Soft', compound: 'C5' },
    ],
    note: 'The lowest average speed on the calendar and virtually no tyre degradation, so the three softest compounds go on.',
    source: SRC.monacoBarcelona2026,
  },
];

/** The compound the allocation section follows across all three rows. */
export const ALLOCATION_TRACKED_COMPOUND = 'C3';

export interface AllocationRule {
  label: string;
  value: string;
  source: SourceRef;
}

export const ALLOCATION_RULES: AllocationRule[] = [
  {
    label: 'Dry sets per driver',
    value: '13 — two Hard, three Medium, eight Soft',
    source: SRC.beginners,
  },
  { label: 'Wet-weather sets', value: 'Five Intermediate, two Full Wet', source: SRC.beginners },
  {
    label: 'Sprint weekends',
    value: '12 dry sets (two, four, six) and six Intermediates',
    source: SRC.beginners,
  },
  {
    label: 'Must-use rule',
    value: 'At least two different slick compounds in a dry race',
    source: SRC.sporting2026,
  },
  {
    label: 'How the three are picked',
    value: 'Safety first, then track characteristics and expected temperatures',
    source: SRC.choosing,
  },
];

/* ------------------------------------------------------------------------- *
 * Strategy
 * ------------------------------------------------------------------------- */

export const STRATEGY_SCENARIOS: StrategyScenario[] = [
  {
    id: 'hot-abrasive',
    situation: 'A hot, abrasive track',
    detail:
      'Sakhir-style asphalt, high track temperature, and thermal degradation biting hardest across the rear axle.',
    leaning: 'Harder of the nominated compounds, and plan for one more stop than you would like.',
    advantage: 'Longer stints and a rear axle that is still there at the end of them.',
    risk: 'You concede lap time every lap. Bahrain 2025 was predicted as a possible one-stop and turned out to be, in Pirelli’s words, a race where a two-stop was the only real choice.',
    sources: [SRC.bahrain2025, SRC.bahrainRace2025],
  },
  {
    id: 'safety-car-restart',
    situation: 'A late safety car',
    detail:
      'The pit stop just got cheap, the field has bunched up, and there are a handful of racing laps left.',
    leaning: 'The softest compound available, if there is time to use it before the flag.',
    advantage:
      'Fresh rubber and instant warm-up against rivals on old tyres. At Silverstone in 2026 the final safety car is what put the softest compound into widespread use, and Ferrari stopped for it in anticipation of the restart.',
    risk: 'You give up track position to make the stop, and if the restart comes late or the laps run out, you have paid for grip you never got to spend.',
    sources: [SRC.silverstone2026],
  },
  {
    id: 'long-first-stint',
    situation: 'A long opening stint, or an undercut',
    detail:
      'Stopping early puts you on fresh tyres while your rival is on old ones; stopping late gives you clear air and a tyre offset at the end.',
    leaning: 'Whichever your rival cannot answer.',
    advantage:
      'Barcelona 2026 was won by significantly anticipating the first stop — maximising the undercut and forcing rivals onto the same three-stop strategy, against two-stops behind.',
    risk: 'An early stop commits you to more stops. If the safety car you were counting on never comes, you have simply driven further on worse tyres.',
    sources: [SRC.barcelonaRace2026],
  },
  {
    id: 'drying-track',
    situation: 'A track that is drying',
    detail:
      'The Intermediate is quickest right up to the moment it is not: without water to cool it, it overheats on a drying line.',
    leaning:
      'Hold the Intermediate until the lap-time trend crosses. Pirelli’s published rule of thumb runs the other way too — once a dry lap time rises by roughly 10–12%, it is time to think about Intermediates.',
    advantage: 'Getting it right can be worth more than a pit stop.',
    risk: 'At Silverstone in 2025 five drivers took slicks before the start, the rain came earlier than expected, and everyone still on Intermediates gained.',
    sources: [SRC.crossover, SRC.silverstone2025],
  },
  {
    id: 'returning-rain',
    situation: 'Rain that comes back',
    detail: 'Conditions that change twice in one afternoon, in both directions.',
    leaning: 'Whatever keeps you on track and out of the gravel.',
    advantage:
      'Melbourne 2025 ran Intermediates, then slicks under a lap-33 neutralisation split evenly between Medium and Hard, then Intermediates again to the flag.',
    risk: 'Every extra stop is time lost, and a gamble on rain that does not arrive is expensive — four teams fitted Intermediates in Canada in 2026 anticipating a change that never came.',
    sources: [SRC.melbourne2025, SRC.canada2026],
  },
  {
    id: 'close-call',
    situation: 'When one stop and two stops are dead level',
    detail:
      'Simulations put the two strategies within nothing of each other, and overtaking is hard.',
    leaning: 'Track position, until something changes the price of a pit stop.',
    advantage:
      'Hungary 2026: qualifying-day simulations showed no difference in overall race time between one and two stops. The win came from a third stop, made cheap by a Virtual Safety Car.',
    risk: 'Committing early to either removes your ability to react. The tie is usually broken by an event nobody has yet had.',
    sources: [SRC.budapest2026, SRC.hungary2026],
  },
];

/* ------------------------------------------------------------------------- *
 * Lifecycle
 * ------------------------------------------------------------------------- */

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    id: 'preparation',
    name: 'Preparation',
    body: 'Tyres are fitted to rims and brought up to temperature in electric blankets. Under the current rules slicks may be heated to a tread and sidewall temperature of 70°C for a maximum of two hours, and only before the session they are meant for. Intermediates are held to a lower limit.',
    source: SRC.blanketsBritish2026,
  },
  {
    id: 'no-blankets',
    name: 'The exception',
    body: 'Full Wets get no blankets at all — the FIA’s per-event notes state plainly that no blankets are allowed for them. A wet-weather restart therefore begins on a genuinely cold tyre.',
    source: SRC.blanketsMiami2026,
  },
  {
    id: 'prescriptions',
    name: 'Pressures and camber',
    body: 'Pirelli sets a minimum starting pressure and camber limits for every circuit, and the FIA publishes them per event. They exist to control the stresses the tyre is put under, and they can be revised during a race weekend.',
    source: SRC.importance,
  },
  {
    id: 'formation-lap',
    name: 'Formation lap',
    body: 'The blankets come off moments before the start, and the formation lap is the only chance to put temperature into the tyre — weaving, braking hard, and arriving at the grid with the tyre in its working range rather than under it.',
    source: SRC.importance,
  },
  {
    id: 'stint',
    name: 'The stint',
    body: 'From here the tyre only ever gets worse, in two different ways. Surface overheating is reversible and comes from the tread sliding on the track. Thermal degradation is not: enough energy alters the chemical bonds in the tread and the grip does not come back.',
    source: SRC.bahrain2025,
  },
  {
    id: 'pit-stop',
    name: 'The pit stop',
    body: 'A dry race obliges every driver to use at least two different slick compounds, so at least one stop is a rule rather than a choice. Across the 2025 season that came to 720 pit stops.',
    source: SRC.season2025Numbers,
  },
  {
    id: 'after',
    name: 'After use',
    body: 'Pirelli states that all the tyres it brings to a Grand Prix weekend — across F1, F2, F3 and F1 Academy — are transformed into secondary raw materials after use, sent to authorised treatment plants to recover material or energy. One published route is pyrolysis, where the elastomeric part is broken down into gas, mineral oil and recovered carbon black.',
    source: SRC.sustainability,
  },
  {
    id: 'materials',
    name: 'What they are made of',
    body: 'Since 2024 every Pirelli tyre used across an F1 weekend has been made with Forest Stewardship Council certified natural rubber — the first in the sport. Pirelli puts natural rubber at roughly 18% of a tyre’s weight, which is what the FSC certification covers. It is not a recycled-content or bio-based figure for the tyre as a whole; Pirelli publishes no such figure for an F1 tyre.',
    source: SRC.fsc,
  },
];

/**
 * Claims deliberately **not** made on this page, kept next to the ones that are.
 *
 * Each was checked against Pirelli, Formula 1 and FIA publications and found unsupported.
 * Writing them down is cheaper than re-researching them the next time someone is tempted:
 * an F1 tyre is not "100% recycled", no recycled-content percentage is published for one,
 * and ISCC PLUS is a Pirelli road-product certification that its motorsport pages never claim.
 */
export const LIFECYCLE_UNSUPPORTED_CLAIMS = [
  'that F1 tyres are 100% recycled',
  'any recycled or bio-based percentage for an F1 tyre',
  'ISCC PLUS certification of F1 tyres',
] as const;

/* ------------------------------------------------------------------------- *
 * FAQ
 * ------------------------------------------------------------------------- */

export const TYRE_FAQ: (FaqEntry & { source: SourceRef })[] = [
  {
    id: 'graining',
    question: 'What is graining?',
    answer:
      'Pirelli describes it as the tyre surface being stressed to the point where the compound starts to break up: microcracks form and leave the tread irregular, with peaks and troughs. The result is a loss of grip that shows up mid-corner, under braking and on acceleration. It happens most often when track temperatures are low, or when the tyre is outside its working range.',
    source: SRC.graining,
  },
  {
    id: 'blistering',
    question: 'What is blistering, and how is it different?',
    answer:
      'Graining is a surface breaking up; blistering starts underneath. Microcavities let gas or vapour bubbles form between the carcass and the tread, and excessive heat can partially separate the rubber layers. Those bubbles can then become craters or holes, visible as dark streaks or damaged areas on the tread.',
    source: SRC.austria2025,
  },
  {
    id: 'degradation',
    question: 'Is degradation the same as wear?',
    answer:
      'No, and the difference decides strategy. Wear life is the number of laps before the tread has physically worn away. Thermal degradation is chemical: enough energy goes into the tyre to alter the bonds in the tread, and that loss of grip is irreversible. Surface overheating, by contrast, comes from the tread sliding and can be recovered from.',
    source: SRC.bahrain2025,
  },
  {
    id: 'slick',
    question: 'Why do slicks have no tread?',
    answer:
      'Because tread is a compromise you only want in the wet. A slick has no pattern in order to put as much rubber on the road as possible. Intermediates and full wets trade some of that contact for blocks and channels, which find grip in water and flex as they do it.',
    source: SRC.crossover,
  },
  {
    id: 'warm-up',
    question: 'What does it mean for a tyre to “switch on”?',
    answer:
      'Every compound has a range it works in. Below it, you are not getting what the tyre has; above it, performance falls away and wear can become critical. The hard part is not just reaching that range but holding both axles inside it at the same time, which is why an out-lap is driven so differently from a flying lap.',
    source: SRC.products,
  },
  {
    id: 'when-to-change',
    question: 'How do teams know when to change to wets?',
    answer:
      'Pirelli publishes a rule of thumb: if a normal slick lap is 100%, then once lap times rise to about 110–112% it is time for Intermediates — so a 1m30s dry lap becoming roughly 1m40s is the trigger. A similar rise from a normal Intermediate lap says it is time for Full Wets.',
    source: SRC.crossover,
  },
  {
    id: 'water',
    question: 'How much water can a wet tyre actually move?',
    answer:
      'Pirelli has published that at 300km/h a single Intermediate can disperse around 35 to 40 litres of water per second, and that a Full Wet roughly doubles that. Those figures were published in 2020 and 2022 and describe earlier specifications; Pirelli has not republished them for the current tyre.',
    source: SRC.crossover,
  },
  {
    id: 'allocations-differ',
    question: 'Why do different circuits get different compounds?',
    answer:
      'Because circuits ask different things of a tyre. Pirelli weighs abrasiveness, surface grip, traction and braking demands, lateral forces, downforce effects and how much the track evolves — with safety first, then track characteristics and expected temperatures. Suzuka gets the hardest trio in the range; Monaco, with the lowest average speed of the calendar and virtually no degradation, gets the three softest.',
    source: SRC.choosing,
  },
  {
    id: 'what-changed-2026',
    question: 'What changed for 2026?',
    answer:
      'The range went from six compounds to five: Pirelli dropped the C6 because the gap between it and the C5 was too small to be worth a step. The tyres themselves are narrower — 25mm less tread at the front and 30mm less at the rear, with overall diameter down 15mm front and 10mm rear — while the rim stays at 18 inches. Pirelli has noted that a smaller footprint can increase exposure to graining and overheating.',
    source: SRC.reveal2026,
  },
];
