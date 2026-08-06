export interface Driver {
  id: string;
  name: string;
  number: number;
  nationality: string;
  shortCode: string;
  /**
   * Optional portrait, served from `public/`. No portraits ship with the repo, so driver cards
   * render their typographic treatment instead; supply one and the card switches to the image
   * layout (scrimmed, untinted) with no other change.
   */
  image?: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  /**
   * Raw brand color. Decorative use only — run it through `paletteFor()` in `lib/team-utils`
   * before putting text, borders, or focus rings in it.
   */
  color: string;
  drivers: [Driver, Driver];
  base: string;
  powerUnit: string;
  firstEntry: number;
  /** Constructors' titles won, all-time. */
  championships: number;
  tagline: string;
  /**
   * Live constructors' standing. Deliberately unset: this page is a static dataset with no
   * standings source, and inventing a table would be worse than omitting it. Every consumer
   * treats these as optional and falls back to all-time stats, so populating them here is the
   * only change needed to light up the standings UI.
   */
  championshipPosition?: number;
  points?: number;
}

export const TEAMS: Team[] = [
  {
    id: 'mercedes',
    name: 'Mercedes-AMG Petronas F1 Team',
    shortName: 'Mercedes',
    color: '#00d2be',
    drivers: [
      {
        id: 'george-russell',
        name: 'George Russell',
        number: 63,
        nationality: 'British',
        shortCode: 'RUS',
      },
      {
        id: 'kimi-antonelli',
        name: 'Kimi Antonelli',
        number: 12,
        nationality: 'Italian',
        shortCode: 'ANT',
      },
    ],
    base: 'Brackley, United Kingdom',
    powerUnit: 'Mercedes',
    firstEntry: 1954,
    championships: 8,
    tagline: 'The Silver Arrows reborn — a new era, a new voice.',
  },
  {
    id: 'ferrari',
    name: 'Scuderia Ferrari HP',
    shortName: 'Ferrari',
    color: '#dc0000',
    drivers: [
      {
        id: 'charles-leclerc',
        name: 'Charles Leclerc',
        number: 16,
        nationality: 'Monégasque',
        shortCode: 'LEC',
      },
      {
        id: 'lewis-hamilton',
        name: 'Lewis Hamilton',
        number: 44,
        nationality: 'British',
        shortCode: 'HAM',
      },
    ],
    base: 'Maranello, Italy',
    powerUnit: 'Ferrari',
    firstEntry: 1950,
    championships: 16,
    tagline: 'The most storied name in motorsport, united with its greatest champion.',
  },
  {
    id: 'mclaren',
    name: 'McLaren Formula 1 Team',
    shortName: 'McLaren',
    color: '#ff8700',
    drivers: [
      {
        id: 'lando-norris',
        name: 'Lando Norris',
        number: 4,
        nationality: 'British',
        shortCode: 'NOR',
      },
      {
        id: 'oscar-piastri',
        name: 'Oscar Piastri',
        number: 81,
        nationality: 'Australian',
        shortCode: 'PIA',
      },
    ],
    base: 'Woking, United Kingdom',
    powerUnit: 'Mercedes',
    firstEntry: 1966,
    championships: 8,
    tagline: 'Papaya rising — the most complete driver lineup on the grid.',
  },
  {
    id: 'red-bull',
    name: 'Oracle Red Bull Racing',
    shortName: 'Red Bull',
    color: '#1e41ff',
    drivers: [
      {
        id: 'max-verstappen',
        name: 'Max Verstappen',
        number: 1,
        nationality: 'Dutch',
        shortCode: 'VER',
      },
      {
        id: 'isack-hadjar',
        name: 'Isack Hadjar',
        number: 6,
        nationality: 'French-Algerian',
        shortCode: 'HAD',
      },
    ],
    base: 'Milton Keynes, United Kingdom',
    powerUnit: 'Red Bull Ford Powertrains',
    firstEntry: 2005,
    championships: 6,
    tagline: 'Four-time champion, new blood — the dynasty continues.',
  },
  {
    id: 'haas',
    name: 'MoneyGram Haas F1 Team',
    shortName: 'Haas',
    color: '#ffffff',
    drivers: [
      {
        id: 'esteban-ocon',
        name: 'Esteban Ocon',
        number: 31,
        nationality: 'French',
        shortCode: 'OCO',
      },
      {
        id: 'oliver-bearman',
        name: 'Oliver Bearman',
        number: 87,
        nationality: 'British',
        shortCode: 'BEA',
      },
    ],
    base: 'Kannapolis, United States',
    powerUnit: 'Ferrari',
    firstEntry: 2016,
    championships: 0,
    tagline: 'American grit, European speed — building toward the front.',
  },
  {
    id: 'racing-bulls',
    name: 'Visa Cash App Racing Bulls F1 Team',
    shortName: 'Racing Bulls',
    color: '#2b4562',
    drivers: [
      {
        id: 'liam-lawson',
        name: 'Liam Lawson',
        number: 30,
        nationality: 'New Zealander',
        shortCode: 'LAW',
      },
      {
        id: 'arvid-lindblad',
        name: 'Arvid Lindblad',
        number: 41,
        nationality: 'British-Swedish',
        shortCode: 'LIN',
      },
    ],
    base: 'Faenza, Italy',
    powerUnit: 'Red Bull Ford Powertrains',
    firstEntry: 2006,
    championships: 0,
    tagline: "The proving ground — where tomorrow's champions earn their stripes.",
  },
  {
    id: 'audi',
    name: 'Audi F1 Team',
    shortName: 'Audi',
    color: '#e8002d',
    drivers: [
      {
        id: 'nico-hulkenberg',
        name: 'Nico Hülkenberg',
        number: 27,
        nationality: 'German',
        shortCode: 'HUL',
      },
      {
        id: 'gabriel-bortoleto',
        name: 'Gabriel Bortoleto',
        number: 5,
        nationality: 'Brazilian',
        shortCode: 'BOR',
      },
    ],
    base: 'Hinwil, Switzerland',
    powerUnit: 'Audi',
    firstEntry: 2026,
    championships: 0,
    tagline: 'Vorsprung durch Technik — the four rings arrive at Formula 1.',
  },
  {
    id: 'alpine',
    name: 'BWT Alpine F1 Team',
    shortName: 'Alpine',
    color: '#0090ff',
    drivers: [
      {
        id: 'pierre-gasly',
        name: 'Pierre Gasly',
        number: 10,
        nationality: 'French',
        shortCode: 'GAS',
      },
      {
        id: 'franco-colapinto',
        name: 'Franco Colapinto',
        number: 43,
        nationality: 'Argentine',
        shortCode: 'COL',
      },
    ],
    base: 'Enstone, United Kingdom',
    powerUnit: 'Renault',
    firstEntry: 1977,
    championships: 2,
    tagline: 'French passion, renewed purpose — Alpine chases its next chapter.',
  },
  {
    id: 'williams',
    name: 'Williams Racing',
    shortName: 'Williams',
    color: '#005aff',
    drivers: [
      {
        id: 'carlos-sainz',
        name: 'Carlos Sainz',
        number: 55,
        nationality: 'Spanish',
        shortCode: 'SAI',
      },
      {
        id: 'alexander-albon',
        name: 'Alexander Albon',
        number: 23,
        nationality: 'Thai-British',
        shortCode: 'ALB',
      },
    ],
    base: 'Grove, United Kingdom',
    powerUnit: 'Mercedes',
    firstEntry: 1977,
    championships: 7,
    tagline: 'A grand heritage rekindled — the Grove team fights back.',
  },
  {
    id: 'cadillac',
    name: 'Cadillac Formula Racing',
    shortName: 'Cadillac',
    color: '#c8102e',
    drivers: [
      {
        id: 'sergio-perez',
        name: 'Sergio Pérez',
        number: 11,
        nationality: 'Mexican',
        shortCode: 'PER',
      },
      {
        id: 'valtteri-bottas',
        name: 'Valtteri Bottas',
        number: 77,
        nationality: 'Finnish',
        shortCode: 'BOT',
      },
    ],
    base: 'Indianapolis, United States',
    powerUnit: 'GM',
    firstEntry: 2026,
    championships: 0,
    tagline: "America's luxury marque enters the pinnacle of motorsport.",
  },
  {
    id: 'aston-martin',
    name: 'Aston Martin Aramco F1 Team',
    shortName: 'Aston Martin',
    color: '#006f62',
    drivers: [
      {
        id: 'fernando-alonso',
        name: 'Fernando Alonso',
        number: 14,
        nationality: 'Spanish',
        shortCode: 'ALO',
      },
      {
        id: 'lance-stroll',
        name: 'Lance Stroll',
        number: 18,
        nationality: 'Canadian',
        shortCode: 'STR',
      },
    ],
    base: 'Silverstone, United Kingdom',
    powerUnit: 'Honda RBPT',
    firstEntry: 2021,
    championships: 0,
    tagline: "British elegance, Alonso's fury — a team forged to win.",
  },
];

export const TEAM_MAP: Record<string, Team> = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

/** Position of each team in `TEAMS` — the grid-listing order, not a championship standing. */
export const TEAM_INDEX: Record<string, number> = Object.fromEntries(
  TEAMS.map((t, i) => [t.id, i]),
);

/** The season this dataset describes. Rendered wherever the page states its own scope. */
export const SEASON = 2026;
