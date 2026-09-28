import { expect, test } from './support/test';

/**
 * Class 4: the IntersectionObserver scroll spy named the wrong section at 8 of 31 sampled
 * positions, because `intersectionRatio` is a fraction of the target (a ~560px section against a
 * 270px band peaks at 0.48, so the 0.5 threshold never fires). A fake observer fed its own
 * numbers proves nothing. Here the layout is real and the expected winner is computed from live
 * rects using the documented rule.
 *
 * The band is **copied** from hooks/use-scroll-spy.ts, not imported. An import would let a
 * mutant that drops the export fail at compile time, a fake kill that says nothing about
 * whether the spy tracks scroll.
 */
const BAND_TOP = 0.08;
const BAND_BOTTOM = 0.38;
const SAMPLES = 31;
/** Pixels per frame while walking between samples: a real, continuous scroll, not a teleport. */
const STEP_PX = 40;

test.use({ viewport: { width: 1100, height: 900 } }); // lg: the rail is on screen

test('the rail names the section covering most of the band at every sampled scroll position', async ({ page }) => {
  await page.goto('/teams');
  const rail = page.getByRole('navigation', { name: 'Constructors' });
  const links = rail.getByRole('link');
  await expect(links).toHaveCount(11);
  const ids = await links.evaluateAll((as) => as.map((a) => (a.getAttribute('href') ?? '').replace('#team-', '')));

  const { start, end } = await page.evaluate((sectionIds) => {
    const top = (id: string) => document.getElementById(`team-${id}`)?.getBoundingClientRect().top ?? 0;
    const bottom = (id: string) => document.getElementById(`team-${id}`)?.getBoundingClientRect().bottom ?? 0;
    return {
      start: Math.max(0, top(sectionIds[0] ?? '') + window.scrollY - innerHeight * 0.1),
      end: bottom(sectionIds[sectionIds.length - 1] ?? '') + window.scrollY - innerHeight * 0.4,
    };
  }, ids);

  let expected = ids[0] ?? '';
  let wrong = 0;
  let from = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const to = Math.round(start + ((end - start) * i) / (SAMPLES - 1));
    const winner = await page.evaluate(
      async ({ from, to, sectionIds, bandTop, bandBottom, step }) => {
        const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const dir = to >= from ? 1 : -1;
        for (let y = from; dir * (to - y) > 0; y += dir * Math.min(step, Math.abs(to - y))) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await frame();
        }
        window.scrollTo({ top: to, behavior: 'instant' });
        await frame();
        await frame();
        const top = innerHeight * bandTop;
        const bottom = innerHeight * bandBottom;
        let best: string | null = null;
        let bestCovered = 0;
        for (const id of sectionIds) {
          const rect = document.getElementById(`team-${id}`)?.getBoundingClientRect();
          if (!rect) continue;
          const covered = Math.max(0, Math.min(rect.bottom, bottom) - Math.max(rect.top, top));
          if (covered > bestCovered) {
            bestCovered = covered;
            best = id;
          }
        }
        return best;
      },
      { from, to, sectionIds: ids, bandTop: BAND_TOP, bandBottom: BAND_BOTTOM, step: STEP_PX },
    );
    from = to;
    // Nothing covering the band keeps the last answer, as the hook does.
    if (winner !== null) expected = winner;

    const active = rail.locator('a[aria-current="location"]');
    try {
      await expect(active).toHaveAttribute('href', `#team-${expected}`, { timeout: 750 });
    } catch {
      wrong++;
      expect
        .soft(await active.getAttribute('href'), `scrollY ${to}: the band is covered most by #team-${expected}`)
        .toBe(`#team-${expected}`);
    }
  }
  expect(wrong, `${wrong} of ${SAMPLES} sampled positions named the wrong section`).toBe(0);
});
