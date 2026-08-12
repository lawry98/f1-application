# Circuit geometry credits

Every `*.json` in this directory is derived from **[bacinger/f1-circuits](https://github.com/bacinger/f1-circuits)**,
a repository of Formula 1 circuits in GeoJSON format, used under the MIT licence.

The files here are not the upstream data verbatim. `frontend/scripts/fetch-circuit-geometry.mjs`
projects the source's WGS84 lon/lat into a normalised 0..1 box — scaling longitude by
`cos(mean latitude)`, flipping the y axis for SVG, preserving each circuit's aspect ratio — and
downsamples each outline to at most 240 points. Re-run that script to refresh or extend the set.

`index.json` maps a slugged **location** to a circuit id. Location is the join key because the
backend's `circuit_id` is derived from the _event_ name (`italian_grand_prix`), not the circuit,
while `RaceInfo.location` (`Monza`) matches the source's own `Location` field. Five entries in
that map are aliases for places the two sources name differently — see `LOCATION_ALIASES` in the
script.

## Licence

```
Copyright (c) 2019-2025 Tomislav Bacinger

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Sources considered and not used

- **FastF1 telemetry.** Would give the real racing line. Unreachable from this project's
  environment: `session.load()` reports car data, position data _and_ session info unavailable
  against both the primary source and the livetiming mirror — the same unreachability
  `CLAUDE.md` records for the result tools.
- **OpenF1 `/location`.** Verified working (Monza 2024 qualifying, `session_key=9586`, returns
  x/y/z at roughly 4 Hz). Rejected for outlines because a racing line is a _car's path_ — noisy,
  kerb-clipping, and only available from 2023 — where these are surveyed centre lines covering
  40 circuits including historical ones. Still the right source if a racing-line overlay is ever
  wanted.
- **[TUMFTM/racetrack-database](https://github.com/TUMFTM/racetrack-database).** Centre lines
  _plus_ track widths, which would allow drawing real track width rather than a stroke. Not used
  because it is LGPL-3.0, and copyleft on a vendored data set is a licensing decision rather than
  a technical one.
