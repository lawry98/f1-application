import { describe, expect, it } from 'vitest';

import { resolveCircuitRoute } from '@/lib/circuit-route';

describe('resolveCircuitRoute', () => {
  it('renders a canonical slug', () => {
    expect(resolveCircuitRoute('monza', undefined)).toMatchObject({
      kind: 'render',
      entry: { id: 'it-1922' },
    });
  });

  it('redirects an alias to the canonical slug', () => {
    expect(resolveCircuitRoute('bahrain', undefined)).toMatchObject({
      kind: 'redirect',
      to: '/circuits/sakhir',
      entry: { id: 'bh-2002' },
    });
  });

  it('keeps a single ?year= through the redirect', () => {
    expect(resolveCircuitRoute('monte-carlo', '2024')).toMatchObject({
      kind: 'redirect',
      to: '/circuits/monaco?year=2024',
    });
  });

  it('drops a repeated or unusable ?year= rather than forwarding it', () => {
    expect(resolveCircuitRoute('bahrain', ['2024', '2025'])).toMatchObject({
      kind: 'redirect',
      to: '/circuits/sakhir',
    });
    expect(resolveCircuitRoute('bahrain', 'abc')).toMatchObject({
      kind: 'redirect',
      to: '/circuits/sakhir',
    });
  });

  it('carries the canonical circuit’s entry on a redirect, for the interim page title', () => {
    expect(resolveCircuitRoute('bahrain', undefined)).toMatchObject({
      kind: 'redirect',
      entry: { name: expect.any(String) },
    });
  });

  it('is not found for a slug this app draws no circuit for', () => {
    expect(resolveCircuitRoute('atlantis', undefined)).toEqual({ kind: 'notFound' });
    expect(resolveCircuitRoute('constructor', undefined)).toEqual({ kind: 'notFound' });
  });
});
