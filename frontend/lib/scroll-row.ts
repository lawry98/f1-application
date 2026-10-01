/**
 * The `scrollLeft` that centres `item` in the horizontal scroller `row`. The browser clamps it at
 * the row's two ends.
 *
 * This stands in for `item.scrollIntoView({ inline: 'center', block: 'nearest' })`, which looks
 * like the same thing and is not: Chromium also moves the sequential focus navigation starting
 * point to the element it scrolled to. The site nav and the `/teams` chip strip both centred their
 * current item that way on arrival, so the first Tab skipped the wordmark and landed on whatever
 * followed it — `/tyres` → "Circuits", `/teams` at 375 → "FerrariP2". Scrolling the row itself
 * leaves the starting point alone, and cannot scroll the page vertically either. Only a browser
 * has a starting point; `browser/first-tab.spec.ts` is the guard.
 */
export function centredScrollLeft(row: Element, item: Element): number {
  const rowBox = row.getBoundingClientRect();
  const itemBox = item.getBoundingClientRect();
  const rowCentre = rowBox.left + row.clientLeft + row.clientWidth / 2;
  return row.scrollLeft + itemBox.left + itemBox.width / 2 - rowCentre;
}
