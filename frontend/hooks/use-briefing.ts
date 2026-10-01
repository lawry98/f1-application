'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { BriefingRequestError, streamBriefing } from '@/lib/api';
import { isRejectionCode, type BriefingNotice } from '@/lib/briefing-notice';
import { BRIEFING_DEADLINE_ERROR, GENERIC_BRIEFING_ERROR } from '@/lib/constants';
import type { RaceInfo, ToolResult } from '@/types';

/** How often a pending notice's countdown repaints. */
const COUNTDOWN_TICK_MS = 1000;

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
  /**
   * The whole `race_info` payload, not just its name.
   *
   * `race` is kept alongside it rather than derived from it because every existing consumer
   * reads `race` and expects `''` — not `null` — before the event lands, and because the two
   * answer different questions: `race` is "what am I generating", which the loader shows from
   * the moment it resolves, while `raceInfo` is the record the circuit band draws from and is
   * meaningless in part.
   */
  raceInfo: RaceInfo | null;
  briefing: string;
  /** Whether synthesis stopped partway, leaving `briefing` unfinished. */
  truncated: boolean;
  toolTrace: ToolResult[];
  /** The tools the planner chose, in its order. Empty until the `tool_plan` event lands. */
  toolPlan: string[];
  error: string;
  statusMessage: string;
  /** The graph stage the run is in: resolving | planning | gathering | synthesizing. */
  step: string;
  /** Epoch ms the current request began. Zero before the first submit. */
  startedAt: number;
  /**
   * The server refused to start a run — busy, or a limit spent — and says when to ask again.
   * While it is set, `submit` does nothing; it clears itself when the wait runs out.
   */
  notice: BriefingNotice | null;
  /** Whole seconds until `notice` clears; zero when there is none. */
  retryInSeconds: number;
}

export interface UseBriefingReturn extends BriefingState {
  setQuery: (query: string) => void;
  submit: (searchQuery?: string) => Promise<void>;
}

export function useBriefing(): UseBriefingReturn {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [race, setRace] = useState('');
  const [raceInfo, setRaceInfo] = useState<RaceInfo | null>(null);
  const [briefing, setBriefing] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [toolTrace, setToolTrace] = useState<ToolResult[]>([]);
  const [toolPlan, setToolPlan] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [step, setStep] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [notice, setNotice] = useState<BriefingNotice | null>(null);
  // The clock the countdown is read against, held in state so render stays pure: it is set when
  // a refusal lands and by the tick, never read off `Date.now()` during render.
  const [now, setNow] = useState(0);
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

  useEffect(() => {
    if (notice === null) return;
    const id = setInterval(() => {
      const tickedAt = Date.now();
      setNow(tickedAt);
      // Clearing it is what re-enables the controls: nothing else has to watch the clock.
      if (tickedAt >= notice.retryAt) setNotice(null);
    }, COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [notice]);

  const submit = useCallback(
    async (searchQuery?: string): Promise<void> => {
      const searchTerm = searchQuery ?? query;
      if (!searchTerm.trim()) return;
      // The controls are locked while a wait is pending, but Enter in the field still calls
      // this; asking again before `retryAt` only earns the same refusal.
      if (notice !== null) return;

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
      setRaceInfo(null);
      setToolTrace([]);
      setToolPlan([]);
      setStatusMessage('');
      setStep('');
      setStartedAt(Date.now());

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
            setStep(event.data.step);
          } else if (event.type === 'race_info') {
            setRace(event.data.name);
            setRaceInfo(event.data);
          } else if (event.type === 'tool_plan') {
            setToolPlan(event.data.tools);
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
            // The terminal event is the authoritative full text, not one more
            // increment: painting it *replaces* the accumulated prose, which is
            // what makes a delta lost to a malformed frame recoverable. It also
            // doubles as the final flush, so pending deltas are never stranded.
            //
            // Nothing reads the buffer after this — deltas always precede the
            // terminal event, and the next submit() resets it — so it is left
            // alone rather than resynced.
            cancelFlush();
            setBriefing(event.data.content);
            setTruncated(Boolean(event.data.truncated));
            setStatusMessage('');
            setStep('');
          } else if (event.type === 'error') {
            // The deadline is keyed on its code, so the page owns its wording; every other
            // error event's message is already written for a reader.
            setError(event.data.code === 'deadline' ? BRIEFING_DEADLINE_ERROR : event.data.message);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) {
          // Superseded or unmounted: nothing to report.
        } else if (
          err instanceof BriefingRequestError &&
          isRejectionCode(err.code) &&
          err.retryAfterSeconds !== null
        ) {
          // Busy or a limit spent: not a failure, and not worth a console error. A refusal
          // that names no wait cannot drive a countdown, so it falls through to the generic
          // error below rather than locking the page for an unknown time.
          const refusedAt = Date.now();
          setNow(refusedAt);
          setNotice({
            code: err.code,
            retryAt: refusedAt + err.retryAfterSeconds * 1000,
            waitSeconds: err.retryAfterSeconds,
            limit: err.limit,
          });
        } else {
          console.error('Briefing request failed:', err);
          setError(GENERIC_BRIEFING_ERROR);
        }
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
          setStatusMessage('');
          // Belt-and-braces, not a reachable case: the `briefing` event already clears
          // `step`, and on the error path the loader unmounts in the same batch. Kept
          // because `step` and `statusMessage` are meant to move together — the invariant
          // is the point, not this specific line.
          setStep('');
        }
      }
    },
    [query, notice, cancelFlush],
  );

  const retryInSeconds =
    notice === null ? 0 : Math.max(0, Math.ceil((notice.retryAt - now) / 1000));

  return {
    query,
    loading,
    race,
    raceInfo,
    briefing,
    truncated,
    toolTrace,
    toolPlan,
    error,
    statusMessage,
    step,
    startedAt,
    notice,
    retryInSeconds,
    setQuery,
    submit,
  };
}
