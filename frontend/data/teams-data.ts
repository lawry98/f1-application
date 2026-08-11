export interface Driver {
  id: string;
  name: string;
  number: number;
  nationality: string;
  shortCode: string;
  /** Public path to the headshot. Always set; missing files fall back at render. */
  headshot: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  drivers: [Driver, Driver];
  base: string;
  powerUnit: string;
  firstEntry: number;
  championships: number;
  tagline: string;
  /** Public path to the logo. Always set; missing files fall back at render. */
  logo: string;
  /** 2026 constructors' championship points, frozen at STANDINGS_AS_OF. */
  points: number;
  /** 2026 constructors' championship position, frozen at STANDINGS_AS_OF. */
  position: number;
}

/**
 * The page is static, so it states the date of its own numbers rather than
 * implying they are live. Refreshing the standings is a data edit, not a
 * code change.
 */
export const STANDINGS_AS_OF = 'After Round 11 · Hungary';

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
        headshot: '/drivers/george-russell.png',
      },
      {
        id: 'kimi-antonelli',
        name: 'Kimi Antonelli',
        number: 12,
        nationality: 'Italian',
        shortCode: 'ANT',
        headshot: '/drivers/kimi-antonelli.png',
      },
    ],
    base: 'Brackley, United Kingdom',
    powerUnit: 'Mercedes',
    firstEntry: 1954,
    championships: 8,
    tagline: 'The Silver Arrows reborn — a new era, a new voice.',
    logo: '/logos/mercedes.svg',
    points: 379,
    position: 1,
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
        headshot: '/drivers/charles-leclerc.png',
      },
      {
        id: 'lewis-hamilton',
        name: 'Lewis Hamilton',
        number: 44,
        nationality: 'British',
        shortCode: 'HAM',
        headshot: '/drivers/lewis-hamilton.png',
      },
    ],
    base: 'Maranello, Italy',
    powerUnit: 'Ferrari',
    firstEntry: 1950,
    championships: 16,
    tagline: 'The most storied name in motorsport, united with its greatest champion.',
    logo: '/logos/ferrari.svg',
    points: 307,
    position: 2,
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
        headshot: '/drivers/lando-norris.png',
      },
      {
        id: 'oscar-piastri',
        name: 'Oscar Piastri',
        number: 81,
        nationality: 'Australian',
        shortCode: 'PIA',
        headshot: '/drivers/oscar-piastri.png',
      },
    ],
    base: 'Woking, United Kingdom',
    powerUnit: 'Mercedes',
    firstEntry: 1966,
    championships: 8,
    tagline: 'Papaya rising — the most complete driver lineup on the grid.',
    logo: '/logos/mclaren.svg',
    points: 220,
    position: 3,
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
        headshot: '/drivers/max-verstappen.png',
      },
      {
        id: 'isack-hadjar',
        name: 'Isack Hadjar',
        number: 6,
        nationality: 'French-Algerian',
        shortCode: 'HAD',
        headshot: '/drivers/isack-hadjar.png',
      },
    ],
    base: 'Milton Keynes, United Kingdom',
    powerUnit: 'Red Bull Ford Powertrains',
    firstEntry: 2005,
    championships: 6,
    tagline: 'Four-time champion, new blood — the dynasty continues.',
    logo: '/logos/red-bull.svg',
    points: 177,
    position: 4,
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
        headshot: '/drivers/esteban-ocon.png',
      },
      {
        id: 'oliver-bearman',
        name: 'Oliver Bearman',
        number: 87,
        nationality: 'British',
        shortCode: 'BEA',
        headshot: '/drivers/oliver-bearman.png',
      },
    ],
    base: 'Kannapolis, United States',
    powerUnit: 'Ferrari',
    firstEntry: 2016,
    championships: 0,
    tagline: 'American grit, European speed — building toward the front.',
    logo: '/logos/haas.svg',
    points: 21,
    position: 7,
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
        headshot: '/drivers/liam-lawson.png',
      },
      {
        id: 'arvid-lindblad',
        name: 'Arvid Lindblad',
        number: 41,
        nationality: 'British-Swedish',
        shortCode: 'LIN',
        headshot: '/drivers/arvid-lindblad.png',
      },
    ],
    base: 'Faenza, Italy',
    powerUnit: 'Red Bull Ford Powertrains',
    firstEntry: 2006,
    championships: 0,
    tagline: "The proving ground — where tomorrow's champions earn their stripes.",
    logo: '/logos/racing-bulls.svg',
    points: 66,
    position: 5,
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
        headshot: '/drivers/nico-hulkenberg.png',
      },
      {
        id: 'gabriel-bortoleto',
        name: 'Gabriel Bortoleto',
        number: 5,
        nationality: 'Brazilian',
        shortCode: 'BOR',
        headshot: '/drivers/gabriel-bortoleto.png',
      },
    ],
    base: 'Hinwil, Switzerland',
    powerUnit: 'Audi',
    firstEntry: 2026,
    championships: 0,
    tagline: 'Vorsprung durch Technik — the four rings arrive at Formula 1.',
    logo: '/logos/audi.svg',
    points: 12,
    position: 8,
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
        headshot: '/drivers/pierre-gasly.png',
      },
      {
        id: 'franco-colapinto',
        name: 'Franco Colapinto',
        number: 43,
        nationality: 'Argentine',
        shortCode: 'COL',
        headshot: '/drivers/franco-colapinto.png',
      },
    ],
    base: 'Enstone, United Kingdom',
    powerUnit: 'Renault',
    firstEntry: 1977,
    championships: 2,
    tagline: 'French passion, renewed purpose — Alpine chases its next chapter.',
    logo: '/logos/alpine.svg',
    points: 61,
    position: 6,
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
        headshot: '/drivers/carlos-sainz.png',
      },
      {
        id: 'alexander-albon',
        name: 'Alexander Albon',
        number: 23,
        nationality: 'Thai-British',
        shortCode: 'ALB',
        headshot: '/drivers/alexander-albon.png',
      },
    ],
    base: 'Grove, United Kingdom',
    powerUnit: 'Mercedes',
    firstEntry: 1977,
    championships: 7,
    tagline: 'A grand heritage rekindled — the Grove team fights back.',
    logo: '/logos/williams.svg',
    points: 11,
    position: 9,
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
        headshot: '/drivers/sergio-perez.png',
      },
      {
        id: 'valtteri-bottas',
        name: 'Valtteri Bottas',
        number: 77,
        nationality: 'Finnish',
        shortCode: 'BOT',
        headshot: '/drivers/valtteri-bottas.png',
      },
    ],
    base: 'Indianapolis, United States',
    powerUnit: 'GM',
    firstEntry: 2026,
    championships: 0,
    tagline: "America's luxury marque enters the pinnacle of motorsport.",
    logo: '/logos/cadillac.svg',
    points: 0,
    position: 11,
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
        headshot: '/drivers/fernando-alonso.png',
      },
      {
        id: 'lance-stroll',
        name: 'Lance Stroll',
        number: 18,
        nationality: 'Canadian',
        shortCode: 'STR',
        headshot: '/drivers/lance-stroll.png',
      },
    ],
    base: 'Silverstone, United Kingdom',
    powerUnit: 'Honda RBPT',
    firstEntry: 2021,
    championships: 0,
    tagline: "British elegance, Alonso's fury — a team forged to win.",
    logo: '/logos/aston-martin.svg',
    points: 1,
    position: 10,
  },
];

export const TEAM_MAP: Record<string, Team> = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
