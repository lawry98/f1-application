'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { streamBriefing } from '@/lib/api';
import { GENERIC_BRIEFING_ERROR } from '@/lib/constants';
import type { ToolResult } from '@/types';

/**
 * How long deltas pile up in the buffer before the accumulated prose is painted.
 *
 * Coalescing lives here rather than on the wire because batching is a rendering
 * concern: retuning the feel should not need a backend deploy. A briefing is an
 * estimated 500–1500 deltas, and every paint re-parses the whole accumulated
 * markdown string — so painting one delta at a time is quadratic in the length
 * of the briefing. Roughly ten flushes a second is perceptually identical to
 * continuous.
 */
const FLUSH_INTERVAL_MS = 80;

export interface BriefingState {
  query: string;
  loading: boolean;
  race: string;
  briefing: string;
  /** Whether synthesis stopped partway, leaving `briefing` unfinished. */
  truncated: boolean;
  toolTrace: ToolResult[];
  error: string;
  statusMessage: string;
}

export interface UseBriefingReturn extends BriefingState {
  setQuery: (query: string) => void;
  submit: (searchQuery?: string) => Promise<void>;
}

export function useBriefing(): UseBriefingReturn {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [race, setRace] = useState('');
  const [briefing, setBriefing] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [toolTrace, setToolTrace] = useState<ToolResult[]>([]);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  // The prose accumulated so far, including deltas not yet painted.
  const bufferRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelFlush = useCallback((): void => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cancelFlush();
    };
  }, [cancelFlush]);

  const submit = useCallback(
    async (searchQuery?: string): Promise<void> => {
      const searchTerm = searchQuery ?? query;
      if (!searchTerm.trim()) return;

      abortRef.current?.abort();
      cancelFlush();
      bufferRef.current = '';
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError('');
      setBriefing('');
      setTruncated(false);
      setRace('');
      setToolTrace([]);
      setStatusMessage('');

      try {
        const stream = streamBriefing(searchTerm, controller.signal);
        const tools: ToolResult[] = [];

        for await (const event of stream) {
          // A superseded request can surface one last buffered event between the
          // abort and the reader rejecting. Dropping it matters more than it used
          // to: `bufferRef` is shared across requests, so a stale delta would not
          // just paint late, it would prepend itself to the next briefing.
          if (abortRef.current !== controller) break;

          if (event.type === 'status') {
            setStatusMessage(event.data.message);
          } else if (event.type === 'race_info') {
            setRace(event.data.name);
          } else if (event.type === 'tool_result') {
            tools.push({ tool: event.data.tool, success: event.data.success });
            setToolTrace([...tools]);
          } else if (event.type === 'briefing_delta') {
            bufferRef.current += event.data.content;
            if (flushTimerRef.current === null) {
              flushTimerRef.current = setTimeout(() => {
                flushTimerRef.current = null;
                setBriefing(bufferRef.current);
              }, FLUSH_INTERVAL_MS);
            }
          } else if (event.type === 'briefing') {
            // The terminal event replaces the accumulated prose rather than
            // appending to it — it is the reconciliation anchor, and it doubles
            // as the final flush, so pending deltas are never stranded.
            cancelFlush();
            bufferRef.current = event.data.content;
            setBriefing(event.data.content);
            setTruncated(Boolean(event.data.truncated));
            setStatusMessage('');
          } else if (event.type === 'error') {
            setError(event.data.message);
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Briefing request failed:', err);
          setError(GENERIC_BRIEFING_ERROR);
        }
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
          setStatusMessage('');
        }
      }
    },
    [query, cancelFlush],
  );

  return {
    query,
    loading,
    race,
    briefing,
    truncated,
    toolTrace,
    error,
    statusMessage,
    setQuery,
    submit,
  };
}
