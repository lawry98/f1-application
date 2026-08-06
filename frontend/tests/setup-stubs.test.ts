import { describe, it, expect, vi } from 'vitest';

// These are environment gaps, not app code. They are asserted because a missing stub
// surfaces as a throw from deep inside a component, which reads like an app bug.
describe('jsdom stubs installed by tests/setup.ts', () => {
  it('gives every element a scrollIntoView', () => {
    const el = document.createElement('div');
    expect(typeof el.scrollIntoView).toBe('function');
    expect(() => el.scrollIntoView({ inline: 'center' })).not.toThrow();
  });

  it('gives window a scrollTo', () => {
    expect(typeof window.scrollTo).toBe('function');
    expect(() => window.scrollTo({ top: 0 })).not.toThrow();
  });

  it('gives window a matchMedia that reports no match by default', () => {
    const mql = window.matchMedia('(min-width: 1280px)');
    expect(mql.matches).toBe(false);
    expect(mql.media).toBe('(min-width: 1280px)');
  });

  it('lets a matchMedia listener be added and removed without throwing', () => {
    const mql = window.matchMedia('(min-width: 1280px)');
    const listener = vi.fn();
    expect(() => mql.addEventListener('change', listener)).not.toThrow();
    expect(() => mql.removeEventListener('change', listener)).not.toThrow();
  });
});
