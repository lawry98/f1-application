# Tyre renders

Official Pirelli 2026 Formula 1 product renders, downloaded from
[pirelli.com/tires/en-us/motorsport/car/formula-1](https://www.pirelli.com/tires/en-us/motorsport/car/formula-1).

| File | Compound | Source render |
| --- | --- | --- |
| `hard.webp` | Hard | `pirelli-motorsport-car-Formula1-SlickTyres-white-2026.webp` |
| `medium.webp` | Medium | `pirelli-motorsport-car-Formula1-SlickTyres-yellow-2026.webp` |
| `soft.webp` | Soft | `pirelli-motorsport-car-Formula1-SlickTyres-red-2026.webp` |
| `intermediate.webp` | Intermediate | `pirelli-motorsport-car-Formula1-WetTyres-green-senzaombra-2026.webp` |
| `wet.webp` | Full Wet | `pirelli-motorsport-car-Formula1-WetTyres-blu-senzaombra-2026.webp` |

Renamed to the `RaceCompound` ids in `data/tyres-data.ts` and otherwise unmodified: 1200x1200,
WebP, alpha preserved.

## Rights — read before shipping this publicly

**These are not openly licensed.** They are Pirelli's own copyrighted product renders, and the
sidewalls carry the `PIRELLI`, `P ZERO` and `CINTURATO` word marks, which are registered
trademarks. Trademark restrictions exist independently of any copyright position, so "found on a
public web page" is not a licence for either.

They are in the repo because the site owner asked for them by name for a private build. Before
`/tyres` is published:

- obtain written permission from Pirelli, **or**
- swap `components/tyres/lab/tyre-body.tsx`'s drawn tyre back in as the hero.

That fallback is deliberately kept working rather than deleted — it is original artwork, owes no
attribution, and every direction in `components/tyres/lab/` can render either source. Nothing
about the layout depends on the photographs.
