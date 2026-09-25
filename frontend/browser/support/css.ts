import type { Locator, Page } from '@playwright/test';

import { formatCssColor, parseCssColor } from './color';

/**
 * Tailwind preflight's `--tw-ring-color`, as Chromium serialises it inside a computed
 * `box-shadow`. CLAUDE.md measured exactly this on every control whose ring-colour rule was
 * never generated. It is on every element at rest, so it only means something inside a
 * *painted* shadow.
 */
export const TAILWIND_DEFAULT_RING = 'rgba(59, 130, 246, 0.5)';

export interface FocusState {
  label: string;
  focusVisible: boolean;
  /** `--tw-ring-color`, normalised to Chromium's computed form. */
  ringColor: string;
  boxShadow: string;
}

/**
 * Moves focus to `target` with real Tab presses, so `:focus-visible` matches for the reason it
 * does for a user. Call it straight after `goto`: Chromium resumes sequential navigation from
 * the last focused element, not from the top.
 */
export async function focusByKeyboard(page: Page, target: Locator, maxTabs = 100): Promise<void> {
  const handle = await target.elementHandle();
  if (handle === null) throw new Error('focusByKeyboard: target is not in the DOM');
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    if (await handle.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`focusByKeyboard: ${maxTabs} Tab presses never reached the target`);
}

interface RawFocusState {
  label: string;
  focusVisible: boolean;
  ring: string;
  boxShadow: string;
}

function normalise(raw: RawFocusState): FocusState {
  return {
    label: raw.label,
    focusVisible: raw.focusVisible,
    ringColor: raw.ring === '' ? '' : formatCssColor(parseCssColor(raw.ring)),
    boxShadow: raw.boxShadow,
  };
}

/*
 * The two readers below repeat one small body because Playwright serialises the function into
 * the page — a shared closure cannot cross that boundary.
 */

export async function focusState(target: Locator): Promise<FocusState> {
  const raw = await target.evaluate((el): RawFocusState => {
    const style = getComputedStyle(el);
    return {
      label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60)}"`,
      focusVisible: el.matches(':focus-visible'),
      ring: style.getPropertyValue('--tw-ring-color').trim(),
      boxShadow: style.boxShadow,
    };
  });
  return normalise(raw);
}

async function activeFocusState(page: Page): Promise<FocusState | null> {
  const raw = await page.evaluate((): RawFocusState | null => {
    const el = document.activeElement;
    if (el === null || el === document.body) return null;
    const style = getComputedStyle(el);
    return {
      label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60)}"`,
      focusVisible: el.matches(':focus-visible'),
      ring: style.getPropertyValue('--tw-ring-color').trim(),
      boxShadow: style.boxShadow,
    };
  });
  return raw === null ? null : normalise(raw);
}

/**
 * Tabs through the whole page from the top, recording each focused control's ring. Stops when
 * focus leaves the document or wraps back to the first control.
 */
export async function tabThroughPage(page: Page, maxTabs = 250): Promise<FocusState[]> {
  const states: FocusState[] = [];
  let first: string | null = null;
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body) return null;
      if (!el.hasAttribute('data-harness-tab-id')) el.setAttribute('data-harness-tab-id', String(Math.random()));
      return el.getAttribute('data-harness-tab-id');
    });
    if (id === null || id === first) break;
    first ??= id;
    const state = await activeFocusState(page);
    if (state !== null) states.push(state);
  }
  return states;
}

/** Whether any same-origin stylesheet contains a rule with exactly this selector text. */
export async function hasRule(page: Page, selectorText: string): Promise<boolean> {
  return page.evaluate((wanted) => {
    const walk = (rules: CSSRuleList): boolean =>
      Array.from(rules).some(
        (rule) =>
          (rule instanceof CSSStyleRule && rule.selectorText === wanted) ||
          ('cssRules' in rule && walk((rule as CSSGroupingRule).cssRules)),
      );
    return Array.from(document.styleSheets).some((sheet) => {
      try {
        return walk(sheet.cssRules);
      } catch {
        return false; // cross-origin sheet
      }
    });
  }, selectorText);
}
