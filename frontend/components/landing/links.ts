export const NAV_LINKS = [
  { href: '/briefing', label: 'Briefing' },
  { href: '/teardown', label: 'Car Anatomy' },
  // Next to Car Anatomy on purpose: both explain how the machine works, and a reader who
  // has just seen what is inside the car is the reader most likely to want the tyres.
  { href: '/tyres', label: 'Tyres' },
  // Before Teams on purpose: the table answers who is winning and Teams answers who they are, so
  // a name in the table is one link from its profile — and it leaves Teams beside Showcase, which
  // shares the liveries.
  { href: '/standings', label: 'Standings' },
  { href: '/teams', label: 'Teams' },
  { href: '/showcase', label: 'Showcase' },
  { href: '/credits', label: 'Credits' },
] as const;
