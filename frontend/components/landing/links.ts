export const NAV_LINKS = [
  { href: '/briefing', label: 'Briefing' },
  { href: '/teardown', label: 'Car Anatomy' },
  // Next to Car Anatomy on purpose: both explain how the machine works, and a reader who
  // has just seen what is inside the car is the reader most likely to want the tyres.
  { href: '/tyres', label: 'Tyres' },
  { href: '/teams', label: 'Teams' },
  { href: '/showcase', label: 'Showcase' },
  { href: '/credits', label: 'Credits' },
] as const;
